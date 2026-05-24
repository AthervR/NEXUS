"""
NEXUS FastAPI Bridge — api/server.py
v0.5.2 — Correct voice class names: STTPipeline, VoiceListener, TTSPipeline
"""

import asyncio
import json
import os
import subprocess
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Optional

import httpx
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from core.orchestrator import process
from core.lm_client import validate_model_ids, eject_duplicate_models

# ─── Optional voice ───────────────────────────────────────────────────────────
try:
    from voice.stt import STTPipeline
    from voice.listener import VoiceListener
    from voice.tts import TTSPipeline
    VOICE_AVAILABLE = True
    print("[NEXUS] Voice modules loaded OK")
except ImportError as e:
    VOICE_AVAILABLE = False
    STTPipeline = VoiceListener = TTSPipeline = None
    print(f"[NEXUS] Voice unavailable — {e}")

# ─── Mutable state ────────────────────────────────────────────────────────────
_state: dict[str, Any] = {
    "voice_listener": None,
    "tts":            None,
    "conversation":   [],
    "start_time":     time.time(),
}

# Initialise TTS once at startup
if VOICE_AVAILABLE:
    try:
        _state["tts"] = TTSPipeline()
        print("[NEXUS] TTS pipeline ready")
    except Exception as e:
        print(f"[NEXUS] TTS init failed — {e}")
        VOICE_AVAILABLE = False

# ─── TTL cache ────────────────────────────────────────────────────────────────
_cache: dict[str, tuple[Any, datetime]] = {}

def cache_get(key: str, ttl: int = 30) -> Optional[Any]:
    if key not in _cache:
        return None
    data, ts = _cache[key]
    if (datetime.utcnow() - ts).total_seconds() < ttl:
        return data
    return None

def cache_set(key: str, data: Any) -> Any:
    _cache[key] = (data, datetime.utcnow())
    return data

# ─── WebSocket connection manager ─────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        print(f"[NEXUS] WS connected — {len(self.active)} clients")

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
        print(f"[NEXUS] WS disconnected — {len(self.active)} clients")

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

manager = ConnectionManager()

# ─── Live data context builder ────────────────────────────────────────────────
def _build_live_context() -> str:
    """Build a compact live-data block injected into every LLM system prompt."""
    sections: list[str] = ["[LIVE NEXUS DATA — reference this in your responses]"]

    markets_data = cache_get("markets", ttl=60)
    if markets_data and markets_data.get("markets"):
        sections.append("MARKET PRICES (live):")
        for m in markets_data["markets"]:
            arrow = "▲" if m["up"] else "▼"
            sections.append(f"  {m['sym']} ({m['name']}): {m['val']}  {arrow}{m['chg']}")

    flights_data = cache_get("flights", ttl=30)
    if flights_data:
        total = flights_data.get("total", 0)
        fl    = flights_data.get("flights", [])
        notable = [f for f in fl if f["type"] in ("MIL", "SURV")][:6]
        sections.append(f"ADS-B FLIGHTS: {total} aircraft airborne")
        if notable:
            callsigns = ", ".join(f"{f['callsign']} ({f['type']})" for f in notable)
            sections.append(f"  Notable: {callsigns}")

    for limit_key in ("news_25", "news_10"):
        news_data = cache_get(limit_key, ttl=180)
        if news_data and news_data.get("articles"):
            arts = news_data["articles"][:12]
            sections.append(f"LATEST NEWS ({len(arts)} headlines, GDELT 2.0):")
            for a in arts:
                tone = float(a.get("tone", 0))
                label = "BREAKING" if tone < -6 else "ESCALATING" if tone < -3 else "WATCH" if tone < -1 else ""
                prefix = f"[{label}] " if label else ""
                country = a.get("sourcecountry", "")
                country_str = f"[{country}] " if country else ""
                sections.append(f"  {prefix}{country_str}{a['title']}")
            break

    return "\n".join(sections)

# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[NEXUS] API bridge starting on port 8000...")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, eject_duplicate_models)
    await loop.run_in_executor(None, validate_model_ids)
    yield
    print("[NEXUS] Shutting down...")
    vl = _state["voice_listener"]
    if vl:
        vl.stop()

# ─── App + CORS ───────────────────────────────────────────────────────────────
app = FastAPI(title="NEXUS API Bridge", version="0.5.2", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Voice transcript handler (called from listener thread) ───────────────────
async def _handle_voice_transcript(transcript: str):
    conv = _state["conversation"]
    loop = asyncio.get_event_loop()

    await manager.broadcast({"type": "voice_transcript", "text": transcript})
    await manager.broadcast({"type": "voice_status", "status": "PROCESSING"})

    live_ctx = _build_live_context()
    packet   = await loop.run_in_executor(
        None, lambda: process(transcript, conv, modality="voice", live_context=live_ctx)
    )

    conv.append({"role": "user",      "content": transcript})
    conv.append({"role": "assistant", "content": packet.raw_response})

    await manager.broadcast({
        "type":       "nexus_response",
        "text":       packet.raw_response,
        "task_type":  packet.task_type,
        "model":      packet.worker_model,
        "verified":   packet.verified,
        "confidence": round(packet.confidence, 2),
        "source":     "voice",
    })
    tts = _state.get("tts")
    vl  = _state.get("voice_listener")
    if tts:
        await manager.broadcast({"type": "voice_status", "status": "SPEAKING"})
        if vl:
            vl.is_active = False  # mute mic so TTS output isn't re-transcribed
        try:
            await loop.run_in_executor(None, lambda: tts.speak(packet.tts_text))
        finally:
            if vl:
                vl.is_active = True

    await manager.broadcast({"type": "voice_status", "status": "LISTENING"})

# ─── WebSocket endpoint ───────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    loop = asyncio.get_event_loop()
    conv = _state["conversation"]

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")

            # ── Ping ──
            if msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

            # ── Text chat ──
            elif msg_type == "text_chat":
                text = msg.get("text", "").strip()
                if not text:
                    continue

                live_ctx = _build_live_context()
                packet   = await loop.run_in_executor(
                    None, lambda: process(text, conv, live_context=live_ctx)
                )

                conv.append({"role": "user",      "content": text})
                conv.append({"role": "assistant", "content": packet.raw_response})

                await manager.broadcast({
                    "type":       "nexus_response",
                    "text":       packet.raw_response,
                    "task_type":  packet.task_type,
                    "model":      packet.worker_model,
                    "verified":   packet.verified,
                    "confidence": round(packet.confidence, 2),
                    "source":     "text",
                })

                # Speak response if voice listener is active
                vl  = _state.get("voice_listener")
                tts = _state.get("tts")
                if tts and vl and vl.is_active:
                    vl.is_active = False  # mute mic so TTS output isn't re-transcribed
                    try:
                        await loop.run_in_executor(None, lambda: tts.speak(packet.tts_text))
                    finally:
                        vl.is_active = True

            # ── Voice toggle ──
            elif msg_type == "voice_toggle":
                active = msg.get("active", False)

                if not VOICE_AVAILABLE:
                    await websocket.send_text(json.dumps({
                        "type": "voice_status", "status": "UNAVAILABLE"
                    }))
                    continue

                if active:
                    # Wake PipeWire mic source and ensure volume is not at 0.
                    # XDG_RUNTIME_DIR must be set so pactl can reach the PipeWire session.
                    _MIC_SOURCE = "alsa_input.usb-Generic_AIRHUG_21_AIRHUG_21-00.analog-stereo"
                    try:
                        uid = os.getuid()
                        _pactl_env = {**os.environ, "XDG_RUNTIME_DIR": f"/run/user/{uid}"}
                        subprocess.run(["pactl", "suspend-source", _MIC_SOURCE, "0"],
                                       timeout=2, env=_pactl_env)
                        subprocess.run(["pactl", "set-source-volume", _MIC_SOURCE, "65536"],
                                       timeout=2, env=_pactl_env)
                        subprocess.run(["pactl", "set-default-source", _MIC_SOURCE],
                                       timeout=2, env=_pactl_env)
                        print("[NEXUS] Mic woken, volume=100%, set as default")
                    except Exception as e:
                        print(f"[NEXUS] pactl wake failed (non-fatal): {e}")

                    def make_callback(lp):
                        def on_event(event: dict):
                            ev_type = event.get("type")
                            if ev_type == "voice_transcript":
                                asyncio.run_coroutine_threadsafe(
                                    _handle_voice_transcript(event["text"]), lp,
                                )
                            elif ev_type == "voice_status":
                                asyncio.run_coroutine_threadsafe(
                                    manager.broadcast({"type": "voice_status", "status": event["status"]}),
                                    lp,
                                )
                        return on_event

                    if _state["voice_listener"] is None:
                        stt = STTPipeline()
                        vl  = VoiceListener(stt=stt)
                        vl.start(callback=make_callback(loop))
                        _state["voice_listener"] = vl
                    else:
                        _state["voice_listener"].start(callback=make_callback(loop))

                    await manager.broadcast({
                        "type": "voice_status", "status": "LISTENING"
                    })

                else:
                    vl = _state["voice_listener"]
                    if vl:
                        vl.stop()
                    await manager.broadcast({
                        "type": "voice_status", "status": "IDLE"
                    })

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"[NEXUS] WS error: {e}")
        manager.disconnect(websocket)

# ─── REST: Status ─────────────────────────────────────────────────────────────
@app.get("/status")
async def get_status():
    lm_status    = "offline"
    model_loaded = "none"
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r    = await client.get("http://localhost:1234/v1/models")
            data = r.json()
            lm_status    = "online"
            models_list  = data.get("data") or []
            model_loaded = ", ".join(m["id"] for m in models_list) if models_list else "unknown"
    except Exception:
        pass

    uptime_s = int(time.time() - _state["start_time"])
    h, rem   = divmod(uptime_s, 3600)
    m, s     = divmod(rem, 60)
    vl       = _state["voice_listener"]
    voice_on = VOICE_AVAILABLE and vl is not None and getattr(vl, "is_running", False)

    return {
        "lm_studio":    lm_status,
        "model_loaded": model_loaded,
        "voice":        voice_on,
        "ws_clients":   len(manager.active),
        "history_len":  len(_state["conversation"]),
        "uptime":       f"{h}h {m}m {s}s",
    }

# ─── REST: Chat fallback ──────────────────────────────────────────────────────
@app.post("/chat")
async def chat_rest(body: dict):
    text = (body.get("text") or "").strip()
    if not text:
        return {"error": "empty input"}

    conv     = _state["conversation"]
    loop     = asyncio.get_event_loop()
    live_ctx = _build_live_context()
    packet   = await loop.run_in_executor(
        None, lambda: process(text, conv, live_context=live_ctx)
    )

    conv.append({"role": "user",      "content": text})
    conv.append({"role": "assistant", "content": packet.raw_response})

    return {
        "response":   packet.raw_response,
        "task_type":  packet.task_type,
        "model":      packet.worker_model,
        "verified":   packet.verified,
        "confidence": round(packet.confidence, 2),
    }

# ─── REST: Clear history ──────────────────────────────────────────────────────
@app.post("/clear-history")
async def clear_history():
    _state["conversation"].clear()
    return {"status": "cleared"}

# ─── LIVE DATA: Flights — OpenSky Network ────────────────────────────────────
def _classify_flight(callsign: str) -> str:
    cs  = callsign.upper().strip()
    mil = ["FORTE","DUKE","JAKE","MARLIN","LAGR","REACH","HOMER","BOXER","RAIDR","VIPER","COBRA"]
    sur = ["RECON","IRON","AWACS","JSTAR","RIVET","SIGNT"]
    cgo = ["UPS","FDX","GTI","CLX","ABX","ATN","SWQ","CKS"]
    for p in mil:
        if cs.startswith(p): return "MIL"
    for p in sur:
        if cs.startswith(p): return "SURV"
    for p in cgo:
        if cs.startswith(p): return "CARGO"
    return "COM"

def _parse_opensky(data: dict) -> list[dict]:
    flights = []
    for s in (data.get("states") or []):
        callsign  = (s[1] or "").strip()
        lng       = s[5]
        lat       = s[6]
        on_ground = s[8]
        if not callsign or lng is None or lat is None or on_ground:
            continue
        alt_m  = s[7] or s[13] or 0
        alt_ft = int(alt_m * 3.28084) if alt_m else 0
        spd_ms = s[9] or 0
        flights.append({
            "id":       s[0],
            "callsign": callsign,
            "lat":      lat,
            "lng":      lng,
            "alt":      f"{alt_ft:,}ft",
            "heading":  float(s[10] or 0),
            "speed":    f"{int(spd_ms * 1.944)}kts",
            "origin":   s[2] or "?",
            "type":     _classify_flight(callsign),
        })
    return flights


def _parse_adsbexchange(data: dict) -> list[dict]:
    flights = []
    for ac in (data.get("ac") or []):
        callsign = (ac.get("flight") or ac.get("r") or "").strip()
        lat      = ac.get("lat")
        lng      = ac.get("lon")
        if not callsign or lat is None or lng is None:
            continue
        alt_baro = ac.get("alt_baro")
        alt_geom = ac.get("alt_geom")
        if alt_baro == "ground" or ac.get("gnd") in (True, 1, "1"):
            continue
        alt_src = alt_baro if isinstance(alt_baro, (int, float)) else alt_geom if isinstance(alt_geom, (int, float)) else 0
        alt_ft  = int(alt_src)
        spd_kt  = int(ac.get("gs") or 0)
        flights.append({
            "id":       ac.get("hex", callsign),
            "callsign": callsign,
            "lat":      float(lat),
            "lng":      float(lng),
            "alt":      f"{alt_ft:,}ft",
            "heading":  float(ac.get("track") or 0),
            "speed":    f"{spd_kt}kts",
            "origin":   ac.get("r", "?"),
            "type":     "MIL" if ((ac.get("dbFlags") or 0) & 1) else _classify_flight(callsign),
        })
    return flights


# Set ADSB_EXCHANGE_API_KEY env var to enable ADS-B Exchange (RapidAPI key).
# Without a key the endpoint falls back gracefully to OpenSky-only.
_ADSB_EXCHANGE_KEY = os.environ.get("ADSB_EXCHANGE_API_KEY", "")
_ADSB_EXCHANGE_URL = "https://adsbexchange-com1.p.rapidapi.com/v2/all/"


@app.get("/api/flights")
async def get_flights():
    cached = cache_get("flights", ttl=15)
    if cached:
        return cached

    flights: list[dict] = []
    source = "none"

    # ── Primary: OpenSky Network ──────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://opensky-network.org/api/states/all")
            r.raise_for_status()
            flights = _parse_opensky(r.json())
            source  = "opensky"
            print(f"[NEXUS] OpenSky: {len(flights)} aircraft")
    except Exception as e:
        print(f"[NEXUS] OpenSky failed: {e}")

    # ── Fallback 1: ADS-B.lol (keyless public mirror, military aircraft) ──────
    if not flights:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get("https://api.adsb.lol/v2/mil")
                r.raise_for_status()
                flights = _parse_adsbexchange(r.json())
                source  = "adsblol"
                print(f"[NEXUS] ADS-B.lol: {len(flights)} aircraft")
        except Exception as e:
            print(f"[NEXUS] ADS-B.lol failed: {e}")

    # ── Fallback 2: ADS-B Exchange (RapidAPI, requires key) ───────────────────
    if not flights and _ADSB_EXCHANGE_KEY:
        try:
            headers = {
                "x-rapidapi-host": "adsbexchange-com1.p.rapidapi.com",
                "x-rapidapi-key":  _ADSB_EXCHANGE_KEY,
            }
            async with httpx.AsyncClient(timeout=10, headers=headers) as client:
                r = await client.get(_ADSB_EXCHANGE_URL)
                r.raise_for_status()
                flights = _parse_adsbexchange(r.json())
                source  = "adsbexchange"
                print(f"[NEXUS] ADS-B Exchange: {len(flights)} aircraft")
        except Exception as e:
            print(f"[NEXUS] ADS-B Exchange failed: {e}")

    # ── Last resort: stale cache ──────────────────────────────────────────────
    if not flights:
        stale = cache_get("flights", ttl=300)
        if stale:
            print("[NEXUS] Serving stale flight cache")
            return {**stale, "stale": True}
        return {"flights": [], "total": 0, "error": "all flight sources unavailable", "source": source}

    result = {
        "flights": flights[:200],
        "total":   len(flights),
        "source":  source,
        "updated": datetime.utcnow().isoformat(),
    }
    return cache_set("flights", result)


# ─── LIVE DATA: Flight detail enrichment via ADSBdb ──────────────────────────
@app.get("/api/flight/{hex_id}")
async def get_flight_detail(hex_id: str, callsign: str = ""):
    hex_up = hex_id.strip().upper()
    cs_up  = callsign.strip().upper()
    cache_key = f"flight_detail:{hex_up}:{cs_up}"
    cached = cache_get(cache_key, ttl=900)  # 15min
    if cached:
        return cached

    aircraft: Optional[dict] = None
    route:    Optional[dict] = None

    async with httpx.AsyncClient(timeout=8) as client:
        try:
            r = await client.get(f"https://api.adsbdb.com/v0/aircraft/{hex_up}")
            if r.status_code == 200:
                body = r.json().get("response")
                if isinstance(body, dict):
                    aircraft = body.get("aircraft")
        except Exception as e:
            print(f"[NEXUS] ADSBdb aircraft lookup failed for {hex_up}: {e}")

        if cs_up:
            try:
                r = await client.get(f"https://api.adsbdb.com/v0/callsign/{cs_up}")
                if r.status_code == 200:
                    body = r.json().get("response")
                    if isinstance(body, dict):
                        route = body.get("flightroute")
            except Exception as e:
                print(f"[NEXUS] ADSBdb callsign lookup failed for {cs_up}: {e}")

    result = {"hex": hex_up, "callsign": cs_up or None, "aircraft": aircraft, "route": route}
    return cache_set(cache_key, result)


# ─── LIVE DATA: Markets — Yahoo Finance ──────────────────────────────────────
MARKET_SYMBOLS = {
    "^GSPC":    {"sym": "SPX", "name": "S&P 500"},
    "^NDX":     {"sym": "NDQ", "name": "NASDAQ"},
    "BTC-USD":  {"sym": "BTC", "name": "Bitcoin"},
    "ETH-USD":  {"sym": "ETH", "name": "Ethereum"},
    "EURUSD=X": {"sym": "EUR", "name": "EUR/USD"},
    "BZ=F":     {"sym": "OIL", "name": "Brent Crude"},
    "GC=F":     {"sym": "GLD", "name": "Gold"},
    "^VIX":     {"sym": "VIX", "name": "VIX"},
    "DX-Y.NYB": {"sym": "DXY", "name": "Dollar Index"},
    "^TNX":     {"sym": "UST", "name": "US 10Y Yield"},
}

@app.get("/api/markets")
async def get_markets():
    cached = cache_get("markets", ttl=30)
    if cached:
        return cached

    results = []
    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"}

    async with httpx.AsyncClient(timeout=12, headers=headers) as client:
        for ticker, meta in MARKET_SYMBOLS.items():
            try:
                r = await client.get(
                    f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}",
                    params={"interval": "1d", "range": "2d"},
                )
                d     = r.json()
                m     = d["chart"]["result"][0]["meta"]
                price = m.get("regularMarketPrice") or m.get("chartPreviousClose", 0)
                prev  = m.get("previousClose") or m.get("chartPreviousClose") or price
                if not price:
                    continue

                chg_pct = ((price - prev) / prev * 100) if prev else 0
                up      = chg_pct >= 0

                if ticker in ("BTC-USD", "ETH-USD"):
                    val = f"{price:,.0f}"
                elif "=X" in ticker:
                    val = f"{price:.4f}"
                elif ticker == "^TNX":
                    val = f"{price:.2f}%"
                else:
                    val = f"{price:,.2f}"

                results.append({
                    "sym":  meta["sym"],
                    "name": meta["name"],
                    "val":  val,
                    "chg":  f"{'+' if up else ''}{chg_pct:.2f}%",
                    "up":   up,
                })
            except Exception as e:
                print(f"[NEXUS] Markets {ticker}: {e}")

    result = {"markets": results, "updated": datetime.utcnow().isoformat()}
    return cache_set("markets", result)

# ─── LIVE DATA: News — GDELT 2.0 ─────────────────────────────────────────────
# GDELT artlist JSON never returns a tone field, so we estimate it from the title.
_TONE_HIGH   = ["war","attack","kill","dead","bomb","terror","explosion","massacre",
                "conflict","nuclear","missile","invasion","genocide","hostage","coup"]
_TONE_MEDIUM = ["protest","tension","warning","sanctions","threat","crisis","violence",
                "arrested","strike","shootin","wound","casualt","disput","escalat"]

# Pre-filter GDELT results to trusted sources via the API's domain: operator.
# Fallback query (no domain filter) is used only when trusted query returns < 5 articles.
_GDELT_TRUSTED_QUERY = (
    "sourcelang:english "
    "(domain:reuters.com OR domain:apnews.com OR domain:bbc.com OR domain:bbc.co.uk "
    "OR domain:aljazeera.com OR domain:cnn.com OR domain:nytimes.com "
    "OR domain:theguardian.com OR domain:bloomberg.com OR domain:wsj.com "
    "OR domain:nbcnews.com OR domain:foxnews.com OR domain:cbsnews.com "
    "OR domain:washingtonpost.com OR domain:npr.org OR domain:politico.com "
    "OR domain:ft.com OR domain:axios.com OR domain:time.com OR domain:espn.com "
    "OR domain:cnbc.com OR domain:abcnews.go.com OR domain:news.sky.com "
    "OR domain:france24.com OR domain:dw.com OR domain:independent.co.uk "
    "OR domain:theatlantic.com OR domain:militarytimes.com OR domain:defensenews.com)"
)
_GDELT_BROAD_QUERY = "sourcelang:english"

def _estimate_tone(title: str) -> float:
    lower = title.lower()
    score = 0.0
    for w in _TONE_HIGH:
        if w in lower:
            score -= 3.0
    for w in _TONE_MEDIUM:
        if w in lower:
            score -= 1.5
    return round(score, 1)

async def _gdelt_fetch(query: str, limit: int) -> Optional[dict]:
    """Fetch from GDELT with one 429-backoff retry. Returns parsed JSON or None."""
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    "https://api.gdeltproject.org/api/v2/doc/doc",
                    params={
                        "query":      query,
                        "mode":       "artlist",
                        "maxrecords": limit,
                        "format":     "json",
                        "timespan":   "2h",
                        "sort":       "toneneg",
                    },
                )
                if r.status_code == 429:
                    if attempt == 0:
                        print("[NEXUS] GDELT rate limited (429) — backing off 8s")
                        await asyncio.sleep(8)
                        continue
                    return None
                body = r.text.strip()
                if not body:
                    return None
                return r.json()
        except Exception as e:
            print(f"[NEXUS] GDELT attempt {attempt + 1} failed: {e}")
            if attempt == 0:
                await asyncio.sleep(2)
    return None

@app.get("/api/news")
async def get_news(limit: int = 25):
    key    = f"news_{limit}"
    cached = cache_get(key, ttl=120)
    if cached:
        return cached

    # Try trusted-source query first; fall back to broad if too few results.
    data = await _gdelt_fetch(_GDELT_TRUSTED_QUERY, limit)
    trusted_count = len((data or {}).get("articles") or [])

    if trusted_count < 5:
        print(f"[NEXUS] Trusted GDELT returned {trusted_count} — trying broad query")
        await asyncio.sleep(6)  # respect rate limit before second call
        data = await _gdelt_fetch(_GDELT_BROAD_QUERY, limit)

    if not data:
        return {"articles": [], "error": "GDELT unreachable"}

    raw = [a for a in (data.get("articles") or []) if a.get("title")]
    print(f"[NEXUS] News: {trusted_count} trusted / {len(raw)} from query used")

    articles = [
        {
            "title":         a.get("title", ""),
            "url":           a.get("url", ""),
            "domain":        a.get("domain", ""),
            "seendate":      a.get("seendate", ""),
            "sourcecountry": a.get("sourcecountry", ""),
            "tone":          _estimate_tone(a.get("title", "")),
        }
        for a in raw[:limit]
    ]

    if not articles:
        return {"articles": [], "error": "no articles in GDELT response"}

    result = {"articles": articles, "updated": datetime.utcnow().isoformat()}
    return cache_set(key, result)

# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )