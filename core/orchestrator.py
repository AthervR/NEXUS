import time
import yaml
from pathlib import Path
from core.packet import NexusPacket
from core.lm_client import ask_main, ask_fast, ask_verify, VERIFY_THRESHOLD

# ── Task classification keywords ──────────────────────────────────
FAST_KEYWORDS = [
    "remind", "timer", "note", "add", "set", "when", "what time",
    "thanks", "ok", "yes", "no", "confirm", "cancel", "stop", "start",
    "hello", "hi ", "hey", "how are", "what's up",
]

VERIFY_KEYWORDS = [
    "calculate", "compute", "math", "formula", "equation", "circuit",
    "voltage", "current", "resistance", "power", "frequency", "ohm",
    "verify", "check", "confirm", "is this correct", "double check",
    "watts", "amps", "volts", "hertz", "capacitor", "resistor",
]

MAIN_KEYWORDS = [
    "research", "explain", "design", "build", "code", "write", "generate",
    "debug", "analyze", "schematic", "arduino", "python", "sensor",
    "component", "datasheet", "project", "how do i", "what is",
    "help me", "create", "implement", "integrate",
]

# ── Task classifier ───────────────────────────────────────────────
def classify_task(text: str) -> tuple[str, str]:
    """
    Returns (task_type, worker_model) based on input text.
    Priority: fast > verify > main (default)
    """
    lower = text.lower()

    # Short inputs almost always want fast response
    if len(text.split()) <= 4:
        return "quick", "fast"

    # Check fast keywords first — these need no heavy reasoning
    for kw in FAST_KEYWORDS:
        if kw in lower:
            return "quick", "fast"

    # Check if it's a calculation/verification task
    for kw in VERIFY_KEYWORDS:
        if kw in lower:
            return "calculation", "verify"

    # Default to main brain for everything else
    return "lab_research", "main"


def needs_verification(task_type: str, confidence: float) -> bool:
    """
    Decide if a response needs routing to the verifier.
    Calculations always get verified. Low confidence triggers it too.
    """
    if task_type == "calculation":
        return True
    if confidence < VERIFY_THRESHOLD:
        return True
    return False


# ── Main orchestration function ───────────────────────────────────
def process(user_input: str, modality: str = "text") -> NexusPacket:
    """
    Full NEXUS processing pipeline:
    Input → Classify → Route → Execute → Verify? → Return
    """
    packet = NexusPacket(
        raw_input=user_input,
        input_modality=modality,
        timestamp=time.time(),
    )

    # ── Step 1: Classify ──────────────────────────────────────────
    task_type, worker = classify_task(user_input)
    packet.task_type    = task_type
    packet.worker_model = worker

    print(f"\n[NEXUS] Input    : {user_input[:80]}")
    print(f"[NEXUS] Task     : {task_type}")
    print(f"[NEXUS] Routing  → {worker} model")

 # ── Step 2: Execute ───────────────────────────────────────────
    start = time.time()

    if worker == "fast":
        response, confidence = ask_fast(user_input)

    elif worker == "verify":
        # Calculations: main brain computes FIRST, then verifier checks
        print(f"[NEXUS] Computing via main model first...")
        response, confidence = ask_main(user_input)
        elapsed = round(time.time() - start, 2)
        print(f"[NEXUS] Response : {response[:100]}...")
        print(f"[NEXUS] Confidence: {confidence:.2f}  |  Time: {elapsed}s")

        # Now send to verifier
        print(f"[NEXUS] Verifying calculation...")
        verified_response, v_confidence = ask_verify(response, user_input)
        packet.verified = True

        if "[CORRECTED]" in verified_response:
            print("[NEXUS] ⚠️  Correction found — using verified response")
            response = verified_response
            confidence = v_confidence
        else:
            print("[NEXUS] ✅ Calculation verified")

    else:
        response, confidence = ask_main(user_input)

    elapsed = round(time.time() - start, 2)
    packet.raw_response = response
    packet.confidence   = confidence

    print(f"[NEXUS] Response : {response[:100]}...")
    print(f"[NEXUS] Confidence: {confidence:.2f}  |  Time: {elapsed}s")

# ── Step 3: Verify if needed (non-calculation tasks only) ─────
    if needs_verification(task_type, confidence) and worker != "verify":
        print(f"[NEXUS] Verifying response (conf={confidence:.2f})...")
        verified_response, _ = ask_verify(response, user_input)
        packet.verified = True

        if "[CORRECTED]" in verified_response:
            print("[NEXUS] ⚠️  Correction found — using verified response")
            packet.raw_response = verified_response
        else:
            print("[NEXUS] ✅ Response verified")

    # ── Step 4: Package output ────────────────────────────────────
    packet.tts_text      = packet.raw_response
    packet.display_content = packet.raw_response

    return packet


# ── Quick test harness ────────────────────────────────────────────
if __name__ == "__main__":
    test_inputs = [
        "Hey NEXUS, what's up?",
        "What is a MOSFET and how does it work?",
        "Calculate the resistance if voltage is 12V and current is 0.5A",
    ]

    for test in test_inputs:
        packet = process(test)
        print(packet.summary())
        print()