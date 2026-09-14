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
6. Return clean plain text for a simple web interface: use short section labels
   followed by normal sentences and hyphen bullets. Do NOT use Markdown tables,
   Markdown symbols (#, **, backticks), HTML tags, or escaped characters.
"""


def generate_answer(question: str, retrieved_chunks: list[str],
                     retrieved_metadatas: list[dict], mode: str = "explain",
                     level: str = "intermediate", prerequisites: list[str] | None = None,
                     history: list[dict] | None = None) -> str:
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

    mode_instructions = {
        "explain": "Give a structured topic explanation with definition, core ideas, and an example.",
        "solve_question": "Write a clear exam-ready solution: identify the demand, show steps, and finish with a concise final answer.",
        "synthesize": "Compare and synthesize the material across the provided sources. Point out agreement or differences.",
    }
    level_instructions = {
        "beginner": "Use plain language, introduce every technical term, and use an intuitive analogy where useful.",
        "intermediate": "Assume basic familiarity and balance intuition with correct technical detail.",
        "advanced": "Use precise terminology, assumptions, mechanisms, trade-offs, and implementation-level detail where supported.",
    }
    prerequisite_note = ", ".join(prerequisites or []) or "None identified from uploaded material"
    history_text = "\n".join(
        f"{item.get('role', 'student').title()}: {item.get('content', '')}" for item in (history or [])[-6:]
    ) or "No earlier chat messages."
    user_message = f"""Question: {question}

Study mode: {mode}. {mode_instructions.get(mode, mode_instructions['explain'])}
Explanation level: {level}. {level_instructions.get(level, level_instructions['intermediate'])}
Suggested prerequisite topics: {prerequisite_note}

Recent conversation (use this only to understand follow-up references such as "that topic"; keep every factual claim grounded in the sources below):
{history_text}

Relevant material from uploaded documents:

{context}

    Answer the question comprehensively using the material above. Cite source filenames inline.
Keep the response readable in plain text: avoid Markdown tables and formatting symbols."""

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
