# nexus/voice/listener.py
import threading
from typing import Callable
import numpy as np

class VoiceListener:
    SAMPLE_RATE = 48000          # AIRHUG native rate
    WHISPER_RATE = 16000         # Whisper expects 16000
    CHUNK_MS = 100
    SILENCE_DURATION = 1.5
    ENERGY_THRESHOLD = 0.002
    MIN_SPEECH_DURATION = 0.4
    MAX_UTTERANCE_DURATION = 30
    DEVICE = 5                   # AIRHUG 21

    def __init__(self, stt):
        self.stt = stt
        self.is_active = False
        self._thread = None
        self._callback = None
        self._stop_event = threading.Event()

    def start(self, callback: Callable) -> None:
        if self.is_active:
            return
        self._callback = callback
        self._stop_event.clear()
        self.is_active = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()
        print("[Listener] Started — waiting for speech")

    def stop(self) -> None:
        self.is_active = False
        self._stop_event.set()
        print("[Listener] Stopped")

    def _fire(self, event: dict) -> None:
        if self._callback:
            try:
                self._callback(event)
            except Exception as e:
                print(f"[Listener] Callback error: {e}")

    def _downsample(self, audio: np.ndarray) -> np.ndarray:
        """Downsample from 48000 Hz to 16000 Hz (factor of 3)."""
        return audio[::3]

    def _listen_loop(self) -> None:
        try:
            import sounddevice as sd
        except ImportError:
            print("[Listener] ERROR: sounddevice not installed")
            return

        chunk_size = int(self.SAMPLE_RATE * self.CHUNK_MS / 1000)
        silence_chunks_needed = int(self.SILENCE_DURATION / (self.CHUNK_MS / 1000))
        max_chunks = int(self.MAX_UTTERANCE_DURATION / (self.CHUNK_MS / 1000))

        audio_buffer = []
        silence_count = 0
        is_speaking = False

        def audio_callback(indata, frames, time, status):
            nonlocal audio_buffer, silence_count, is_speaking

            if not self.is_active:
                return

            chunk = indata[:, 0].copy()
            rms = float(np.sqrt(np.mean(chunk ** 2)))
            is_loud = rms > self.ENERGY_THRESHOLD

            if is_loud:
                if not is_speaking:
                    is_speaking = True
                    self._fire({"type": "voice_status", "status": "RECORDING"})
                audio_buffer.append(chunk)
                silence_count = 0

                if len(audio_buffer) >= max_chunks:
                    self._flush(audio_buffer.copy())
                    audio_buffer = []
                    silence_count = 0
                    is_speaking = False

            elif is_speaking:
                audio_buffer.append(chunk)
                silence_count += 1

                if silence_count >= silence_chunks_needed:
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
                device=self.DEVICE,
            ):
                self._stop_event.wait()

        except Exception as e:
            print(f"[Listener] Audio stream error: {e}")
            self.is_active = False

    def _flush(self, audio_chunks: list) -> None:
        self._fire({"type": "voice_status", "status": "TRANSCRIBING"})

        audio_48k = np.concatenate(audio_chunks)
        audio_16k = self._downsample(audio_48k)

        transcript = self.stt.transcribe(audio_16k)

        if transcript:
            print(f"[Listener] Transcript: '{transcript}'")
            self._fire({"type": "voice_transcript", "text": transcript})
        else:
            self._fire({"type": "voice_status", "status": "LISTENING"})