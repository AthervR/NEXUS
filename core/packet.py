# ~/nexus/core/packet.py
from dataclasses import dataclass, field
from typing import Optional
import time

@dataclass
class NexusPacket:
    # ── Input ────────────────────────────────────────────────
    raw_input: str
    input_modality: str = "text"          # "text" | "voice" | "visual"

    # ── Orchestrator Decisions ───────────────────────────────
    task_type: str = "unknown"
    worker_model: str = "qwen2.5:14b"
    needs_verification: bool = False
    injected_context: list[str] = field(default_factory=list)
    tool_calls: list[str] = field(default_factory=list)

    # ── Worker Output ────────────────────────────────────────
    raw_response: str = ""
    confidence: float = 1.0
    verified: bool = False

    # ── Final Output ─────────────────────────────────────────
    tts_text: str = ""                    # what NEXUS will speak
    display_content: str = ""            # what appears on GUI

    # ── Metadata ─────────────────────────────────────────────
    timestamp: float = field(default_factory=time.time)
    session_id: str = "default"
    error: Optional[str] = None

    def summary(self) -> str:
        return (
            f"\n{'='*50}"
            f"\n[NEXUS PACKET SUMMARY]"
            f"\n  Input      : {self.raw_input[:80]}"
            f"\n  Modality   : {self.input_modality}"
            f"\n  Task Type  : {self.task_type}"
            f"\n  Model      : {self.worker_model}"
            f"\n  Verified   : {self.verified}"
            f"\n  Confidence : {self.confidence:.2f}"
            f"\n  Response   : {self.raw_response[:120]}..."
            f"\n{'='*50}"
        )