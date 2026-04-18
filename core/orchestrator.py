# ~/nexus/core/orchestrator.py
import time
import sys
from core.packet import NexusPacket
from core.lm_client import ask_main, ask_fast, ask_verify, VERIFY_THRESHOLD

# ── Task classification keywords ──────────────────────────────────────────────
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


# ── Task classifier ───────────────────────────────────────────────────────────
def classify_task(text: str) -> tuple[str, str]:
    lower = text.lower()

    if len(text.split()) <= 4:
        return "quick", "fast"

    for kw in FAST_KEYWORDS:
        if kw in lower:
            return "quick", "fast"

    for kw in VERIFY_KEYWORDS:
        if kw in lower:
            return "calculation", "verify"

    return "lab_research", "main"


def needs_verification(task_type: str, confidence: float) -> bool:
    if task_type == "calculation":
        return True
    if confidence < VERIFY_THRESHOLD:
        return True
    return False


# ── Core processing pipeline ──────────────────────────────────────────────────
def process(user_input: str, history: list[dict], modality: str = "text") -> NexusPacket:
    """
    Full NEXUS processing pipeline with conversation history.
    History is a list of {"role": "user"/"assistant", "content": "..."} dicts.
    """
    packet = NexusPacket(
        raw_input=user_input,
        input_modality=modality,
        timestamp=time.time(),
    )

    task_type, worker = classify_task(user_input)
    packet.task_type    = task_type
    packet.worker_model = worker

    _divider()
    print(f"  Task     : {task_type}")
    print(f"  Routing  : {_model_label(worker)}")
    _divider()

    start = time.time()

    if worker == "fast":
        response, confidence = ask_fast(user_input, history=history)

    elif worker == "verify":
        print(f"\n  [Step 1] Computing answer via main model...")
        response, confidence = ask_main(user_input, history=history)
        elapsed = round(time.time() - start, 2)
        _print_response("MAIN MODEL ANSWER", response, elapsed, confidence)

        print(f"\n  [Step 2] Verifying with DeepSeek R1...")
        verified_response, v_confidence = ask_verify(response, user_input, history=history)
        packet.verified = True

        if "[CORRECTED]" in verified_response:
            print("\n  ⚠  Correction found — using verified response")
            response = verified_response
            confidence = v_confidence
        else:
            print("\n  ✓  Calculation verified")

    else:
        response, confidence = ask_main(user_input, history=history)

    elapsed = round(time.time() - start, 2)
    packet.raw_response    = response
    packet.confidence      = confidence
    packet.tts_text        = response
    packet.display_content = response

    if needs_verification(task_type, confidence) and worker != "verify":
        print(f"\n  [Confidence {confidence:.2f} < threshold] Verifying response...")
        verified_response, _ = ask_verify(response, user_input, history=history)
        packet.verified = True

        if "[CORRECTED]" in verified_response:
            print("  ⚠  Correction found — using verified response")
            packet.raw_response = verified_response
            response = verified_response
        else:
            print("  ✓  Response verified")

    return packet


# ── Helpers ───────────────────────────────────────────────────────────────────
def _divider():
    print("─" * 50)

def _model_label(worker: str) -> str:
    labels = {
        "fast":   "Llama 3.2 3B  (fast)",
        "main":   "Llama 3.1 8B  (main brain)",
        "verify": "Main → DeepSeek R1  (calculate + verify)",
    }
    return labels.get(worker, worker)

def _print_response(label: str, response: str, elapsed: float, confidence: float):
    print(f"\n  [{label}]")
    print(f"  Time: {elapsed}s  |  Confidence: {confidence:.2f}")
    print()
    for line in response.splitlines():
        print(f"  {line}")


# ── Interactive terminal loop ─────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    from voice.stt import listen_once
    from voice.tts import speak

    VOICE_MODE = "--voice" in sys.argv

    print("\n" + "=" * 50)
    print("  NEXUS — LOCAL AI ASSISTANT")
    mode_str = "VOICE + TEXT" if VOICE_MODE else "TEXT ONLY"
    print(f"  Mode: {mode_str}")
    print("  Type 'exit' to quit" + (" | Say 'goodbye' to quit" if VOICE_MODE else ""))
    print("=" * 50 + "\n")

    history: list[dict] = []

    greeting, _ = ask_fast(
        "Greet the user warmly and ask what you can help with. One sentence.",
        history=history,
    )
    print(f"[NEXUS] {greeting}\n")
    if VOICE_MODE:
        speak(greeting)

    while True:
        if VOICE_MODE:
            user_input = listen_once(timeout=15.0)
            if not user_input:
                print("[NEXUS] (no input detected — listening again)")
                continue
            print(f"You: {user_input}")
        else:
            try:
                user_input = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\n[NEXUS] Shutting down.")
                sys.exit(0)

        if not user_input:
            continue

        if user_input.lower() in {"exit", "quit", "bye", "goodbye"}:
            farewell, _ = ask_fast("Say a brief friendly goodbye.", history=history)
            print(f"\n[NEXUS] {farewell}\n")
            if VOICE_MODE:
                speak(farewell)
            sys.exit(0)

        print()
        packet = process(user_input, history=history)

        print()
        _divider()
        print(f"  NEXUS RESPONSE")
        _divider()
        print()
        for line in packet.raw_response.splitlines():
            print(f"  {line}")
        print()

        if VOICE_MODE:
            speak(packet.raw_response)

        history.append({"role": "user",      "content": user_input})
        history.append({"role": "assistant", "content": packet.raw_response})