# nexus/voice/stt.py
"""
STTPipeline — faster-whisper based speech-to-text.

Model choices (set in __init__):
  tiny.en   ~0.3s/utterance  — lowest quality, fastest
  base.en   ~0.8s/utterance  — recommended default
  small.en  ~1.5s/utterance  — best quality, still realtime on Ryzen 7

All run on CPU with int8 quantization (AMD 780M has no CUDA).
CTranslate2 int8 is ~3-4x faster than original Whisper on CPU.
"""

import numpy as np


class STTPipeline:
    def __init__(
        self,
        model_size: str = "base.en",
        device: str = "cpu",
        compute_type: str = "int8",
    ):
        print(f"[STT] Loading Whisper {model_size} ({device}/{compute_type})...")
        # Import here so the server starts fast even if model isn't loaded yet
        from faster_whisper import WhisperModel
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
        self.model_size = model_size
        print(f"[STT] Whisper {model_size} ready")

    def transcribe(self, audio: np.ndarray, language: str = "en") -> str:
        """
        Transcribe a float32 numpy array (sample_rate=16000) to text.
        Returns empty string if nothing was detected or confidence is too low.
        """
        if audio is None or len(audio) == 0:
            return ""

        # Normalize to [-1, 1] if needed
        if audio.max() > 1.0 or audio.min() < -1.0:
            audio = audio / np.max(np.abs(audio))

        segments, info = self.model.transcribe(
            audio,
            language=language,
            beam_size=5,
            vad_filter=True,              # Built-in Silero VAD — filters non-speech
            vad_parameters={
                "min_silence_duration_ms": 300,
                "speech_pad_ms": 100,
            },
        )

        # Collect all segments
        parts = []
        for seg in segments:
            # Skip very low confidence segments (no_speech_prob threshold)
            if seg.no_speech_prob < 0.6:
                parts.append(seg.text.strip())

        text = " ".join(parts).strip()

        # Filter out whisper hallucinations (common on silence)
        hallucinations = {
            "thank you", "thanks for watching", "you", ".", "..", "...",
            "thanks", "bye", "okay", "ok",
        }
        if text.lower() in hallucinations:
            return ""

        return text