from groq import Groq
import os
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def detect_subject(text: str) -> str:
    sample = text[:16000]

    prompt = f"""
You are an academic subject classifier for a study application.

Your job is to identify the MOST SPECIFIC academic subject represented by
the study material.

IMPORTANT:
- Classify based ONLY on the CONTENT.
- NEVER use the filename.
- Do NOT automatically classify Linux-related material as Operating Systems.
- Prefer a specific subject over a broad subject.

Use these rules:

1. Return "Linux Programming" when the material primarily covers:
   - Linux commands
   - Bash / shell scripting
   - shell programs
   - awk
   - sed
   - grep
   - file and directory commands
   - permissions
   - users and groups
   - pipes and redirection
   - shell scripting
   - Linux utilities
   - Linux programming exercises
   - Linux command-line programming

2. Return "Operating Systems" when the material primarily covers:
   - processes
   - process scheduling
   - CPU scheduling
   - process states
   - PCB
   - threads
   - synchronization
   - semaphores
   - deadlocks
   - Banker's algorithm
   - memory management
   - paging
   - segmentation
   - page replacement
   - virtual memory
   - file system concepts
   - OS architecture
   - system calls as OS concepts

3. If Linux commands or shell scripting are the main focus,
   choose "Linux Programming" even if the material also mentions
   operating-system concepts.

4. If theoretical operating-system concepts are the main focus,
   choose "Operating Systems" even if examples use Linux.

5. Other possible subjects include:
   - Database Management Systems
   - Machine Learning
   - Computer Networks
   - Data Structures
   - Artificial Intelligence
   - Computer Organization
   - Mathematics
   - Web Development
   - Java Programming
   - Python Programming

Return ONLY ONE subject name.
Do not explain your answer.
Do not return Markdown.
Do not return multiple subjects.

Study material:

{sample}
"""

    response = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0
    )

    subject = response.choices[0].message.content.strip()

    return subject.strip(" .:-")