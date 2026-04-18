# nexus/api/server.py
"""
NEXUS FastAPI Bridge — the single hub connecting GUI, voice, and orchestrator.

Ports:
  8000  — FastAPI (REST + WebSocket)
  1234  — LM Studio (internal, never exposed to GUI directly)

WebSocket message protocol:
  IN  (GUI → server): {type: "text_chat", text: "..."}
                      {type: "voice_toggle", active: bool}
                      {type: "ping"}
  OUT (server → GUI): {type: "nexus_response", text, task_type, model, verified, confidence, source}
                      {type: "voice_status", status: "IDLE|LISTENING|RECORDING|TRANSCRIBING|PROCESSING"}
                      {type: "voice_transcript", text}
                      {type: "processing_start", text, source}
                      {type: "pong"}
"""

import asyncio
import os
import sys
from typing import Set

import requests
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Make sure nexus root is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.orchestrator import process
from voice.listener import VoiceListener
from voice.stt import STTPipeline
from voice.tts import TTSPipeline

# ── App setup ────────────────────────────────────────────────────────────────
app = FastAPI(title="NEXUS API", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global state ──────────────────────────────────────────────────────────────
connected_clients: Set[WebSocket] = set()
conversation_history: list[dict] = []
_event_loop: asyncio.AbstractEventLoop | None = None

# Initialize voice stack (lazy — only loads Whisper model on first use)
stt = STTPipeline(model_size="base.en")
tts = TTSPipeline()
listener = VoiceListener(stt=stt)


# ── Lifecycle ─────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    global _event_loop
    _event_loop = asyncio.get_event_loop()
    print("[NEXUS API] Server online — ws://localhost:8000/ws")


# ── Broadcast helper ──────────────────────────────────────────────────────────
async def broadcast(message: dict):
    """Send JSON to all connected WebSocket clients. Purge dead connections."""
    dead: Set[WebSocket] = set()
    for ws in connected_clients:
        try:
            await ws.send_json(message)
        except Exception:
            dead.add(ws)
    connected_clients.difference_update(dead)


# ── Voice event handler (called from listener thread via run_coroutine_threadsafe) ──
async def handle_voice_event(event: dict):
    global conversation_history

    event_type = event.get("type")

    if event_type == "voice_transcript":
        text = event.get("text", "").strip()
        if not text:
            return

        # Tell GUI: here's what the user said
        await broadcast({"type": "voice_transcript", "text": text})
        await broadcast({"type": "processing_start", "text": text, "source": "voice"})

        # Run orchestrator in thread pool (blocking call)
        loop = asyncio.get_event_loop()
        packet = await loop.run_in_executor(
            None, lambda: process(text, conversation_history)
        )

        conversation_history.append({"role": "user", "content": text})
        conversation_history.append({"role": "assistant", "content": packet.raw_response})

        # Send response to GUI
        await broadcast({
            "type": "nexus_response",
            "text": packet.raw_response,
            "task_type": packet.task_type,
            "model": packet.worker_model,
            "verified": packet.verified,
            "confidence": packet.confidence,
            "source": "voice",
        })

        # Speak response (blocking — keeps audio sequential)
        await loop.run_in_executor(None, lambda: tts.speak(packet.raw_response))

        # Back to listening
        await broadcast({"type": "voice_status", "status": "LISTENING"})

    else:
        # All other events (RECORDING, TRANSCRIBING, etc.) pass through to GUI
        await broadcast(event)


def on_voice_event(event: dict):
    """Thread-safe callback from VoiceListener → schedules coroutine on main loop."""
    if _event_loop and not _event_loop.is_closed():
        asyncio.run_coroutine_threadsafe(handle_voice_event(event), _event_loop)


# ── WebSocket endpoint ────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.add(ws)

    # Send current voice state on connect
    await ws.send_json({
        "type": "voice_status",
        "status": "LISTENING" if listener.is_active else "IDLE",
    })

    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")

            if msg_type == "text_chat":
                await _handle_text_chat(data.get("text", ""))

            elif msg_type == "voice_toggle":
                active = data.get("active", False)
                if active:
                    listener.start(callback=on_voice_event)
                    await broadcast({"type": "voice_status", "status": "LISTENING"})
                else:
                    listener.stop()
                    await broadcast({"type": "voice_status", "status": "IDLE"})

            elif msg_type == "ping":
                await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[NEXUS API] WebSocket error: {e}")
    finally:
        connected_clients.discard(ws)


async def _handle_text_chat(text: str):
    global conversation_history
    if not text.strip():
        return

    await broadcast({"type": "processing_start", "text": text, "source": "text"})

    loop = asyncio.get_event_loop()
    packet = await loop.run_in_executor(
        None, lambda: process(text, conversation_history)
    )

    conversation_history.append({"role": "user", "content": text})
    conversation_history.append({"role": "assistant", "content": packet.raw_response})

    await broadcast({
        "type": "nexus_response",
        "text": packet.raw_response,
        "task_type": packet.task_type,
        "model": packet.worker_model,
        "verified": packet.verified,
        "confidence": packet.confidence,
        "source": "text",
    })


# ── REST endpoints ────────────────────────────────────────────────────────────
@app.get("/status")
async def get_status():
    lm_ok = False
    loaded_model = "—"
    try:
        r = requests.get("http://localhost:1234/v1/models", timeout=3)
        data = r.json().get("data", [])
        lm_ok = True
        loaded_model = data[0]["id"] if data else "none"
    except Exception:
        pass

    return {
        "api": "ONLINE",
        "lm_studio": "ONLINE" if lm_ok else "OFFLINE",
        "loaded_model": loaded_model,
        "voice_active": listener.is_active,
        "clients_connected": len(connected_clients),
        "history_turns": len(conversation_history) // 2,
    }


@app.post("/chat")
async def post_chat(body: dict):
    """REST fallback for when WebSocket isn't available."""
    text = body.get("text", "")
    loop = asyncio.get_event_loop()
    packet = await loop.run_in_executor(
        None, lambda: process(text, conversation_history)
    )
    conversation_history.append({"role": "user", "content": text})
    conversation_history.append({"role": "assistant", "content": packet.raw_response})
    return {
        "response": packet.raw_response,
        "task_type": packet.task_type,
        "model": packet.worker_model,
        "verified": packet.verified,
        "confidence": packet.confidence,
    }


@app.post("/clear-history")
async def clear_history():
    global conversation_history
    conversation_history = []
    return {"status": "cleared"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")