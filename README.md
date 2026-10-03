# Subject Guide & Question Bank Assistant

A subject-scoped study assistant for course documents and question banks. Upload notes, textbooks, labs, and question papers; then receive grounded answers from Groq with source filenames.

## Features

- PDF, DOCX, PPTX, and TXT extraction with automatic document categorization
- Persistent ChromaDB retrieval scoped to each authenticated subject
- Account registration, login, and JWT-protected subject/document APIs
- Multi-file and folder document upload, listing, deletion, and stored chunk metadata
- Optional Groq-powered subject detection that creates or reuses the signed-in user's matching subject workspace
- Remembered study-chat follow-ups plus three study modes: adaptive topic explanation, exam-question solving, and cross-document synthesis
- Markdown-formatted answers with readable headings, lists, code, and tables
- ChatGPT-inspired dark study workspace with subject sidebar, focused chat, bottom composer, and collapsible Library/Insights panels
- Batch question-bank solving for every detected numbered question in an uploaded question-paper document
- Basic subject analytics and automatic question-topic links that refresh when related material is uploaded
- A NetworkX-backed topic graph with conservative prerequisite suggestions

## Prerequisites

- **Python 3.11** (required for this ChromaDB release on Windows)
- Node.js 18+
- Docker Desktop with its engine running
- A Groq API key from [GroqCloud](https://console.groq.com/)

> Do not use Python 3.12+ for this dependency set. It may attempt to compile ChromaDB's vector-index package on Windows.

## Run locally on Windows

### 1. Start PostgreSQL

Open PowerShell and run this once to create the database container:

```powershell
docker run --name subject-guide-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=subject_guide -p 5432:5432 -d postgres:16
```

On later runs, use:

```powershell
docker start subject-guide-db
```

Confirm it is running:

```powershell
docker ps
```

### 2. Start the backend

Open a new PowerShell window:

```powershell
cd C:\Users\<your-user>\Downloads\subject-guide-starter\subject-guide\backend
py -3.11 -m venv venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

In `.env`, set these values:

```ini
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/subject_guide
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=openai/gpt-oss-20b
JWT_SECRET_KEY=replace-with-a-long-random-secret
```

Start the API and leave that window open:

```powershell
python -m uvicorn app.main:app --reload
```

Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) to inspect the API.

### 3. Start the frontend

Open one more PowerShell window:

```powershell
cd C:\Users\<your-user>\Downloads\subject-guide-starter\subject-guide\frontend
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Use the app

1. Register an account (or sign in).
2. Create a subject/course workspace.
3. Upload one or more PDF, DOCX, PPTX, or TXT files. You can select a complete folder with **Choose folder**. Optionally enable **Automatically detect and organize subjects** to let Groq choose or create the matching subject workspace.
4. Wait for each selected document to be categorized, indexed, and added to the subject knowledge graph.
5. Select Beginner, Intermediate, or Advanced and choose a study mode.
6. Ask a topic question, request a cross-document synthesis, or paste an exam question to solve.

For a document tagged as `questions`, use **Solve all questions** beside the file name. The system extracts up to 20 numbered questions and solves each one separately against the other uploaded course materials. This is intentionally processed one question at a time, so a large question paper can take a few minutes.

If a question paper is the only uploaded material, the solver can still provide answers from Groq's general academic knowledge. Those answers are explicitly marked as general knowledge rather than source-grounded. Upload notes, textbooks, or answer keys for fully grounded answers with citations.

The Study Chat keeps recent follow-up messages, so you can ask questions such as “give an example of that” or “explain it at a beginner level” without repeating the topic. Each response still retrieves course sources before answering.

The first document upload can take longer because the embedding model is downloaded and initialized locally. Answers cite the uploaded filenames used as sources.

After pulling these changes, install the added Markdown-rendering frontend packages once:

```powershell
cd frontend
npm install
```

## Four-week milestone coverage

| Week | Delivered work |
| --- | --- |
| 1–2 | Multi-format extraction, automatic tagging, persistent ChromaDB storage, authenticated subject scoping, document management, and grounded sourced answers. |
| 3 | Topic explanation, exam-question solving, cross-document synthesis, analytics, and question-topic mapping. |
| 4 | NetworkX subject/topic graphs, prerequisite suggestions, and adaptive explanation levels. |

Topic discovery, prerequisite suggestions, and question-topic links are conservative, content-based heuristics. They improve as more relevant course materials are uploaded; they are not presented as a separately trained classifier.

## Troubleshooting

### PowerShell says scripts are disabled

Run this separately in each terminal where it is needed:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### Docker Desktop cannot start

Start Docker Desktop and wait for **Engine running**. If it reports that WSL is unavailable, run PowerShell as Administrator:

```powershell
wsl --install --no-distribution
```

Restart Windows after that command. It enables the container platform without installing Ubuntu.

### A PDF has no extractable text

It may be scanned/image-only. Use a text-based PDF, or OCR it before upload.
