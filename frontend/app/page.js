"use client";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const [subjectId, setSubjectId] = useState("");
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleUpload() {
    if (!file || !subjectId) return;
    setUploadStatus("Uploading...");
    const formData = new FormData();
    formData.append("subject_id", subjectId);
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/documents/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setUploadStatus(
      res.ok
        ? `Uploaded: ${data.filename} (${data.chunks_created} chunks, tagged as ${data.content_type})`
        : `Error: ${data.detail}`
    );
  }

  async function handleAsk() {
    if (!question || !subjectId) return;
    setLoading(true);
    setAnswer(null);

    const res = await fetch(`${API_BASE}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject_id: subjectId, question }),
    });
    const data = await res.json();
    setAnswer(data);
    setLoading(false);
  }

  return (
    <main className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">Subject Guide Assistant</h1>

      <section className="space-y-2">
        <label className="block text-sm font-medium">Subject ID</label>
        <input
          className="border rounded px-3 py-2 w-full"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          placeholder="paste a subject id (create one via /subjects endpoint)"
        />
      </section>

      <section className="space-y-2 border-t pt-6">
        <h2 className="font-semibold">Upload a document</h2>
        <input type="file" onChange={(e) => setFile(e.target.files[0])} />
        <button
          onClick={handleUpload}
          className="bg-black text-white px-4 py-2 rounded"
        >
          Upload
        </button>
        {uploadStatus && <p className="text-sm text-gray-600">{uploadStatus}</p>}
      </section>

      <section className="space-y-2 border-t pt-6">
        <h2 className="font-semibold">Ask a question</h2>
        <textarea
          className="border rounded px-3 py-2 w-full"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='e.g. "Explain Database Normalization with examples"'
        />
        <button
          onClick={handleAsk}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {loading ? "Thinking..." : "Ask"}
        </button>

        {answer && (
          <div className="mt-4 p-4 bg-gray-50 rounded space-y-2">
            <p className="whitespace-pre-wrap">{answer.answer}</p>
            {answer.sources?.length > 0 && (
              <p className="text-xs text-gray-500">
                Sources: {answer.sources.join(", ")}
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
