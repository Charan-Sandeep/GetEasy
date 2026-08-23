"""
Generates topic explanations / question answers grounded in retrieved
chunks using Groq.
"""
from groq import Groq

from app.config import settings

SYSTEM_PROMPT = """You are an academic subject guide assistant. You answer
student questions using ONLY the provided source material (notes,
textbooks, question papers, lab manuals). For every answer:
1. Give a clear, complete explanation combining all relevant sources.
2. Include examples if the sources contain them.
3. If the question resembles a past exam question, structure the answer
   the way a full-marks answer would be structured.
4. If the sources don't fully cover the question, say so explicitly
   rather than making things up.
5. Cite which source file(s) each part of your answer draws from.
"""


def generate_answer(question: str, retrieved_chunks: list[str],
                     retrieved_metadatas: list[dict]) -> str:
    if not retrieved_chunks:
        return ("I couldn't find relevant material in your uploaded documents "
                "for this subject yet. Try uploading notes or a textbook "
                "covering this topic.")

    if not settings.groq_api_key:
        return ("The answer service is not configured. Add GROQ_API_KEY to "
                "the backend .env file and restart the backend.")

    context_blocks = []
    for chunk, meta in zip(retrieved_chunks, retrieved_metadatas):
        source = f"[Source: {meta.get('filename')} ({meta.get('content_type')})]"
        context_blocks.append(f"{source}\n{chunk}")

    context = "\n\n---\n\n".join(context_blocks)

    user_message = f"""Question: {question}

Relevant material from uploaded documents:

{context}

Answer the question comprehensively using the material above."""

    client = Groq(api_key=settings.groq_api_key)
    response = client.chat.completions.create(
        model=settings.groq_model,
        max_completion_tokens=1500,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
    )

    return response.choices[0].message.content or "The model returned an empty answer."
