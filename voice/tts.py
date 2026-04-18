# nexus/voice/tts.py
"""
TTSPipeline — Piper TTS for local offline speech synthesis.

Uses the piper CLI binary installed to /usr/local/bin/piper.
Voice: en_US-lessac-medium (natural, neutral American English)

Fallback chain:
  1. Piper (best quality, fully offline)
  2. espeak-ng (robotic but always available on Ubuntu)
"""

import os
import shutil
import subprocess
import tempfile


class TTSPipeline:
    PIPER_MODEL = os.path.expanduser(
        "~/.local/share/piper/en_US-lessac-medium.onnx"
    )

    def __init__(self):
        self.piper_ok = self._check_piper()
        self.espeak_ok = shutil.which("espeak-ng") is not None

        if self.piper_ok:
            print("[TTS] Piper ready — en_US-lessac-medium")
        elif self.espeak_ok:
            print("[TTS] Piper not found — falling back to espeak-ng")
        else:
            print("[TTS] WARNING: No TTS engine found. Audio output disabled.")

    def _check_piper(self) -> bool:
        return (
            shutil.which("piper") is not None
            and os.path.exists(self.PIPER_MODEL)
        )

    def speak(self, text: str) -> None:
        """Synthesize and play text. Blocking call — returns after audio finishes."""
        text = text.strip()
        if not text:
            return

        # Strip markdown that sounds bad when spoken
        text = self._clean_for_speech(text)

        if self.piper_ok:
            self._speak_piper(text)
        elif self.espeak_ok:
            self._speak_espeak(text)

    def _clean_for_speech(self, text: str) -> str:
        """Remove markdown and code blocks before speaking."""
        import re
        # Remove code fences
        text = re.sub(r"```[\s\S]*?```", "[code block]", text)
        # Remove inline code
        text = re.sub(r"`[^`]+`", lambda m: m.group()[1:-1], text)
        # Remove bold/italic
        text = re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", text)
        # Remove headers
        text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
        # Collapse multiple spaces
        text = re.sub(r"  +", " ", text)
        # Trim
        return text.strip()

    def _speak_piper(self, text: str) -> None:
        """Synthesize with Piper, play with aplay (no extra dependencies)."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            wav_path = f.name

        try:
            result = subprocess.run(
                [
                    "piper",
                    "--model", self.PIPER_MODEL,
                    "--output_file", wav_path,
                ],
                input=text.encode("utf-8"),
                capture_output=True,
                timeout=30,
            )

            if result.returncode == 0 and os.path.exists(wav_path):
                # Use aplay (ALSA — always available on Ubuntu, no extra deps)
                subprocess.run(
                    ["aplay", "-q", wav_path],
                    capture_output=True,
                    timeout=60,
                )
            else:
                print(f"[TTS] Piper error: {result.stderr.decode()}")
                self._speak_espeak(text)  # Fallback

        except subprocess.TimeoutExpired:
            print("[TTS] Piper timed out — skipping audio")
        finally:
            if os.path.exists(wav_path):
                os.unlink(wav_path)

    def _speak_espeak(self, text: str) -> None:
        """Fallback: espeak-ng (robotic but always works)."""
        try:
            subprocess.run(
                ["espeak-ng", "-s", "150", "-v", "en-us", text],
                capture_output=True,
                timeout=30,
            )
        except Exception as e:
            print(f"[TTS] espeak-ng error: {e}")