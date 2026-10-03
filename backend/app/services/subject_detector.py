"""Optional Groq-powered subject detection for automatic course organization."""
import re

from groq import Groq

from app.config import settings


def detect_subject(text: str) -> str:
    if not settings.groq_api_key:
        raise ValueError("Automatic subject detection requires GROQ_API_KEY in backend/.env.")
    prompt = f"""Identify the single most specific academic subject represented by this study material.
Return only a concise subject name, with no explanation or markdown.

Examples: Database Management Systems, Operating Systems, Computer Networks,
Machine Learning, Automata and Compiler Design, Linux Programming.

Study material:
{text[:16000]}"""
    response = Groq(api_key=settings.groq_api_key).chat.completions.create(
        model=settings.groq_model,
        temperature=0,
        max_completion_tokens=40,
        messages=[{"role": "user", "content": prompt}],
    )
    value = (response.choices[0].message.content or "").strip()
    value = re.sub(r"[^A-Za-z0-9 &/()_-]", "", value).strip()
    if not value:
        raise ValueError("Could not determine a subject from this document.")
    return value[:100]
