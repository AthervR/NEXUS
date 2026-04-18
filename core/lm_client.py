# ~/nexus/core/lm_client.py
import requests
import json
import yaml
from pathlib import Path

# ── Load config ───────────────────────────────────────────────────
CONFIG_PATH = Path(__file__).parent.parent / "config" / "models.yaml"

def load_config() -> dict:
    with open(CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)

CONFIG           = load_config()
SERVER_URL       = CONFIG["server"]["url"]
TIMEOUT          = CONFIG["server"]["timeout"]
VERIFY_TIMEOUT   = CONFIG["server"].get("verify_timeout", 300)
VERIFY_THRESHOLD = CONFIG["confidence"]["verification_threshold"]

# ── Convenience accessors ─────────────────────────────────────────
def get_model_id(role: str) -> str:
    return CONFIG["models"][role]["model_id"]

def get_temperature(role: str) -> float:
    return CONFIG["models"][role]["temperature"]

def get_max_tokens(role: str) -> int:
    return CONFIG["models"][role]["max_tokens"]

# ── System prompts ────────────────────────────────────────────────
SYSTEM_PROMPTS = {
    "main": """You are NEXUS, an advanced AI lab and life assistant.
You specialize in electrical engineering, mechanical engineering, computer science,
and software development. You are precise, technically accurate, and concise.
When answering lab questions, always consider safety and real-world constraints.
Never guess — if you are uncertain, say so clearly.""",

    "fast": """You are NEXUS, a fast-response AI assistant.
Keep all responses brief and direct. You handle quick tasks: confirmations,
reminders, short factual answers, and simple commands. One to three sentences max
unless the user explicitly asks for more detail.""",

    "verify": """You are NEXUS Verifier, a rigorous checking system.
You receive a previous AI response and must critically evaluate it.
Check for: logical errors, incorrect calculations, unsafe recommendations,
and factual mistakes. Be blunt. If the response is correct, confirm it.
If it has errors, clearly state what is wrong and provide the correction.
Always end your response with either [VERIFIED] or [CORRECTED].""",
}

# ── Core query function ───────────────────────────────────────────
def query_model(
    role: str,
    user_message: str,
    system_override: str = None,
    history: list[dict] = None,
) -> tuple[str, float]:
    model_id    = get_model_id(role)
    temperature = get_temperature(role)
    max_tokens  = get_max_tokens(role)
    system      = system_override or SYSTEM_PROMPTS[role]
    final_message = user_message

    # Build messages: system + history + current user message
    messages = [{"role": "system", "content": system}]
    if history:
        messages.extend(history[-10:])  # cap at last 10 exchanges
    messages.append({"role": "user", "content": final_message})

    payload = {
        "model": model_id,
        "messages": messages,
        "temperature": temperature,
        "max_tokens":  max_tokens,
        "top_p":       CONFIG["models"][role].get("top_p", 0.95),
    }

    request_timeout = VERIFY_TIMEOUT if role == "verify" else TIMEOUT

    try:
        response = requests.post(
            SERVER_URL,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=request_timeout,
        )
        response.raise_for_status()
        data = response.json()

        text          = data["choices"][0]["message"]["content"].strip()
        finish_reason = data["choices"][0].get("finish_reason", "stop")
        confidence    = 0.95 if finish_reason == "stop" else 0.60

        return text, confidence

    except requests.exceptions.ConnectionError:
        return "[ERROR] LM Studio is not running or unreachable.", 0.0
    except requests.exceptions.Timeout:
        return "[ERROR] Model timed out — try a smaller model or shorter prompt.", 0.0
    except Exception as e:
        return f"[ERROR] Unexpected error: {str(e)}", 0.0


def ask_main(prompt: str, history: list[dict] = None) -> tuple[str, float]:
    return query_model("main", prompt, history=history)

def ask_fast(prompt: str, history: list[dict] = None) -> tuple[str, float]:
    return query_model("fast", prompt, history=history)

def ask_verify(original_response: str, original_prompt: str, history: list[dict] = None) -> tuple[str, float]:
    verify_prompt = (
        f"Original question: {original_prompt}\n\n"
        f"Response to verify:\n{original_response}"
    )
    return query_model("verify", verify_prompt, history=history)