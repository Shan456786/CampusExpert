import os

import httpx
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("OPENROUTER_API_KEY")
model = os.getenv("OPENROUTER_MODEL")

if not api_key:
    raise RuntimeError("OPENROUTER_API_KEY was not found.")

if not model:
    raise RuntimeError("OPENROUTER_MODEL was not found.")

response = httpx.post(
    "https://openrouter.ai/api/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    },
    json={
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": "Reply with exactly: Campus Expert Gemma connection successful",
            }
        ],
        "temperature": 0,
        "max_tokens": 50,
    },
    timeout=60.0,
)

print("Status:", response.status_code)

if response.is_success:
    data = response.json()
    print("Gemma:", data["choices"][0]["message"]["content"])
else:
    print("OpenRouter error:")
    print(response.text)