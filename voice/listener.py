# nexus/voice/listener.py
"""
VoiceListener — continuous microphone capture with energy-based VAD.

Flow:
  mic → 100ms audio chunks → energy check → 
  if speech detected: accumulate → 
  if 1.5s silence after speech: flush to STT → transcript → callback

This runs in a daemon thread so it never blocks the FastAPI event loop.
"""

import threading
from typing import Callable

import numpy as np


class VoiceListener:
    # ── Tuning parameters ─────────────────────────────────────────────────────
    SAMPLE_RATE = 16000
    CHUNK_MS = 100               # Audio chunk size (100ms)
    SILENCE_DURATION = 1.5       # Seconds of silence to end an utterance
    ENERGY_THRESHOLD = 0.008     # RMS energy to classify as speech (tune if needed)
    MIN_SPEECH_DURATION = 0.4    # Ignore utterances shorter than this (seconds)
    MAX_UTTERANCE_DURATION = 30  # Hard cap — auto-flush after 30s

    def __init__(self, stt):
        self.stt = stt
        self.is_active = False
        self._thread: threading.Thread | None = None
        self._callback: Callable | None = None
        self._stop_event = threading.Event()

    def start(self, callback: Callable) -> None:
        """Start continuous listening in background thread."""
        if self.is_active:
            return  # Already running

        self._callback = callback
        self._stop_event.clear()
        self.is_active = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()
        print("[Listener] Started — waiting for speech")

    def stop(self) -> None:
        """Signal the listener to stop after current chunk."""
        self.is_active = False
        self._stop_event.set()
        print("[Listener] Stopped")

    def _fire(self, event: dict) -> None:
        """Fire callback event (thread-safe — callback handles scheduling)."""
        if self._callback:
            try:
                self._callback(event)
            except Exception as e:
                print(f"[Listener] Callback error: {e}")

    def _listen_loop(self) -> None:
        """Main listen loop — runs in daemon thread."""
        try:
            import sounddevice as sd
        except ImportError:
            print("[Listener] ERROR: sounddevice not installed. Run: pip install sounddevice")
            return

        chunk_size = int(self.SAMPLE_RATE * self.CHUNK_MS / 1000)
        silence_chunks_needed = int(self.SILENCE_DURATION / (self.CHUNK_MS / 1000))
        max_chunks = int(self.MAX_UTTERANCE_DURATION / (self.CHUNK_MS / 1000))

        audio_buffer: list[np.ndarray] = []
        silence_count = 0
        is_speaking = False

        def audio_callback(indata: np.ndarray, frames, time, status):
            nonlocal audio_buffer, silence_count, is_speaking

            if not self.is_active:
                return

            chunk = indata[:, 0].copy()  # Mono
            rms = float(np.sqrt(np.mean(chunk ** 2)))
            is_loud = rms > self.ENERGY_THRESHOLD

            if is_loud:
                if not is_speaking:
                    # Speech start
                    is_speaking = True
                    self._fire({"type": "voice_status", "status": "RECORDING"})
                audio_buffer.append(chunk)
                silence_count = 0

                # Hard cap — flush if utterance too long
                if len(audio_buffer) >= max_chunks:
                    self._flush(audio_buffer.copy())
                    audio_buffer = []
                    silence_count = 0
                    is_speaking = False

            elif is_speaking:
                # Silence after speech
                audio_buffer.append(chunk)  # Include trailing silence for natural endings
                silence_count += 1

                if silence_count >= silence_chunks_needed:
                    # End of utterance
                    total_speech_chunks = len(audio_buffer) - silence_count
                    speech_duration = total_speech_chunks * self.CHUNK_MS / 1000

                    if speech_duration >= self.MIN_SPEECH_DURATION:
                        self._flush(audio_buffer.copy())
                    else:
                        print(f"[Listener] Too short ({speech_duration:.1f}s) — discarding")

                    audio_buffer = []
                    silence_count = 0
                    is_speaking = False

        try:
            with sd.InputStream(
                samplerate=self.SAMPLE_RATE,
                channels=1,
                dtype="float32",
                blocksize=chunk_size,
                callback=audio_callback,
            ):
                self._stop_event.wait()  # Block until stop() is called

        except Exception as e:
            print(f"[Listener] Audio stream error: {e}")
            self.is_active = False

    def _flush(self, audio_chunks: list[np.ndarray]) -> None:
        """Transcribe accumulated audio and fire transcript event."""
        self._fire({"type": "voice_status", "status": "TRANSCRIBING"})

        audio = np.concatenate(audio_chunks)
        transcript = self.stt.transcribe(audio)

        if transcript:
            print(f"[Listener] Transcript: '{transcript}'")
            self._fire({"type": "voice_transcript", "text": transcript})
        else:
            # Nothing heard — go back to listening
            self._fire({"type": "voice_status", "status": "LISTENING"})