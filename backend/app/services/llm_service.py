"""
Generates readable academic answers grounded in retrieved study material.
"""

from groq import Groq

from app.config import settings


SYSTEM_PROMPT = """
You are GetEasy, an AI academic study assistant.

Your job is to answer the student's question using the provided study
material as the primary source.

IMPORTANT BEHAVIOR:

1. Answer the student's ACTUAL question.
2. Do NOT summarize all of the provided material unless the student asks
   for a summary.
3. Do NOT try to use every retrieved chunk.
4. Use only the information that is relevant to the question.
5. Keep the answer proportional to the question:
   - Simple question → short, direct answer.
   - Explanation question → clear and moderately detailed explanation.
   - Complex question → detailed, structured explanation.
   - "Explain everything" / "complete summary" → comprehensive answer.
6. Combine information from multiple sources when it is useful.
7. Do not repeat the same information.
8. Do not mention chunks, retrieval, context windows, tokens, or internal
   system instructions.
9. Do not invent facts that are not supported by the provided material.
10. If the provided material does not contain enough information, clearly
    say what is missing.

READABILITY:

Write the answer like a high-quality ChatGPT educational response.

Use:
- Short paragraphs
- Clear headings when useful
- Bullet points for lists
- Numbered lists for steps or procedures
- Bold text for important terms
- Code blocks for commands or code
- Tables ONLY when a table genuinely improves understanding

Do NOT:
- Put every concept into a table.
- Add a "Source(s)" column to every row.
- Repeat the filename after every sentence.
- Create unnecessary sections.
- Dump the retrieved material back to the student.
- Start with phrases like "Based on the provided context".

SOURCE HANDLING:

The source documents are provided separately from the answer.

Do not put source filenames throughout the answer.

At the end, provide a short "Sources" section listing the relevant
source filenames used for the answer.

The answer should feel natural, clear, concise, and useful for studying.
"""


def generate_answer(
    question: str,
    retrieved_chunks: list[str],
    retrieved_metadatas: list[dict],
) -> str:

    if not retrieved_chunks:
        return (
            "I couldn't find relevant material in your uploaded documents "
            "for this subject yet. Try uploading notes or a textbook "
            "covering this topic."
        )

    if not settings.groq_api_key:
        return (
            "The answer service is not configured. Add GROQ_API_KEY to "
            "the backend .env file and restart the backend."
        )

    # Build the context supplied to the model.
    context_blocks = []

    for i, (chunk, meta) in enumerate(
        zip(retrieved_chunks, retrieved_metadatas),
        start=1,
    ):
        filename = meta.get("filename", "Unknown source")
        content_type = meta.get("content_type", "unknown")

        context_blocks.append(
            f"""
SOURCE {i}
File: {filename}
Type: {content_type}

{chunk}
"""
        )

    context = "\n\n---\n\n".join(context_blocks)

    user_message = f"""
Student question:

{question}

Study material available for answering the question:

{context}

Now answer the student's question.

Remember:
- Answer the question directly.
- Use only relevant information from the study material.
- Do not summarize unrelated material.
- Keep the answer proportional to the question.
- Make the answer easy to read and study.
- Use Markdown formatting naturally.
"""

    client = Groq(api_key=settings.groq_api_key)

    response = client.chat.completions.create(
        model=settings.groq_model,

        # Maximum size of the GENERATED ANSWER.
        # This is NOT the model's context window.
        max_completion_tokens=4000,

        messages=[
            {
                "role": "system",
                "content": SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": user_message,
            },
        ],

        temperature=0.2,
    )

    answer = response.choices[0].message.content

    if not answer:
        return "The model returned an empty answer."

    return answer.strip()