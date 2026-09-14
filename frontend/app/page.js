"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [documents, setDocuments] = useState([]);
  const [files, setFiles] = useState([]);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("explain");
  const [level, setLevel] = useState("intermediate");
  const [answer, setAnswer] = useState(null);
  const [chat, setChat] = useState([]);
  const [batchAnswers, setBatchAnswers] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [graph, setGraph] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("subject-guide-token");
    if (saved) setToken(saved);
  }, []);
  useEffect(() => { if (token) loadSubjects(); }, [token]);
  useEffect(() => { if (token && subjectId) { setChat([]); setAnswer(null); setBatchAnswers(null); loadDocuments(); loadInsights(); } }, [token, subjectId]);

  const headers = (json = true) => ({ ...(json ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` });
  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, options);
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Request failed.");
    return data;
  }
  async function loadSubjects() {
    try { setSubjects(await request("/subjects", { headers: headers() })); } catch (error) { setNotice(error.message); }
  }
  async function loadDocuments() {
    try { setDocuments(await request(`/documents/subject/${subjectId}`, { headers: headers() })); } catch (error) { setNotice(error.message); }
  }
  async function loadInsights() {
    try {
      const [nextAnalytics, nextGraph] = await Promise.all([
        request(`/subjects/${subjectId}/analytics`, { headers: headers() }),
        request(`/subjects/${subjectId}/knowledge-graph`, { headers: headers() }),
      ]);
      setAnalytics(nextAnalytics); setGraph(nextGraph);
    } catch (error) { setNotice(error.message); }
  }
  async function authenticate(event) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const data = await request(`/auth/${authMode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      window.localStorage.setItem("subject-guide-token", data.access_token); setToken(data.access_token); setNotice(`Signed in as ${data.user.email}.`);
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function createSubject(event) {
    event.preventDefault(); if (!subjectName.trim()) return; setBusy(true);
    try {
      const data = await request("/subjects", { method: "POST", headers: headers(), body: JSON.stringify({ name: subjectName }) });
      setSubjectName(""); setSubjectId(data.id); await loadSubjects(); setNotice(`Created ${data.name}.`);
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function upload() {
    if (!files.length || !subjectId) return setNotice("Choose a subject and one or more PDF, DOCX, PPTX, or TXT files first.");
    setBusy(true); setNotice("Uploading and indexing your document…");
    try {
      const completed = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setNotice(`Uploading ${index + 1} of ${files.length}: ${file.name}…`);
        const form = new FormData(); form.append("subject_id", subjectId); form.append("file", file);
        const data = await request("/documents/upload", { method: "POST", headers: headers(false), body: form });
        completed.push(`${data.filename} (${data.content_type})`);
      }
      setNotice(`Uploaded ${completed.length} file(s): ${completed.join(", ")}.`); setFiles([]); await loadDocuments(); await loadInsights();
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function removeDocument(id) {
    if (!window.confirm("Delete this document and its indexed chunks?")) return;
    try { await request(`/documents/${id}`, { method: "DELETE", headers: headers() }); await loadDocuments(); await loadInsights(); setNotice("Document deleted."); } catch (error) { setNotice(error.message); }
  }
  async function ask() {
    if (!question.trim() || !subjectId) return setNotice("Choose a subject and enter a question.");
    setBusy(true); setAnswer(null);
    try {
      const history = chat.flatMap((message) => [{ role: "user", content: message.question }, { role: "assistant", content: message.answer }]);
      const data = await request("/query", { method: "POST", headers: headers(), body: JSON.stringify({ subject_id: subjectId, question, mode, level, top_k: 7, history }) });
      setAnswer(data); setChat((current) => [...current, { question, answer: data.answer, sources: data.sources, prerequisites: data.prerequisites }]); setQuestion("");
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function solveQuestionBank(documentId) {
    setBusy(true); setBatchAnswers(null); setNotice("Finding and solving each numbered question. This can take a few minutes for a full paper…");
    try {
      const data = await request("/query/question-bank/solve", { method: "POST", headers: headers(), body: JSON.stringify({ subject_id: subjectId, document_id: documentId, level }) });
      setBatchAnswers(data); setNotice(`Solved ${data.questions_detected} questions from ${data.document}.`);
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  function signOut() { window.localStorage.removeItem("subject-guide-token"); setToken(""); setSubjects([]); setSubjectId(""); setDocuments([]); }

  if (!token) return <main className="shell auth"><h1>Subject Guide Assistant</h1><p>Upload course material, study topics, and solve question-bank problems with sourced answers.</p><form onSubmit={authenticate} className="card"><h2>{authMode === "login" ? "Sign in" : "Create account"}</h2><input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required /><input type="password" placeholder="Password (at least 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength="8" /><button disabled={busy}>{busy ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}</button><button type="button" className="link" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "Need an account? Register" : "Already registered? Sign in"}</button></form>{notice && <p className="notice">{notice}</p>}</main>;

  return <main className="shell"><header><div><h1>Subject Guide Assistant</h1><p>Grounded study support across your notes, textbooks, labs, and question papers.</p></div><button className="secondary" onClick={signOut}>Sign out</button></header>{notice && <p className="notice">{notice}</p>}
    <section className="card"><h2>1. Course workspace</h2><div className="row"><select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Select a subject…</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><form onSubmit={createSubject} className="row"><input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="New subject name" /><button disabled={busy}>Create subject</button></form></div></section>
    {subjectId && <><section className="card"><h2>2. Documents</h2><div className="row"><input type="file" accept=".pdf,.docx,.pptx,.txt" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} /><button onClick={upload} disabled={busy}>{busy ? "Working…" : "Upload & index"}</button></div>{files.length > 0 && <p className="hint">Selected: {files.map((file) => file.name).join(", ")}</p>}<p className="hint">Supported: PDF, DOCX, PPTX, TXT. You can choose multiple files; they are uploaded one at a time and indexed per subject.</p><ul>{documents.map((document) => <li key={document.id}><span><strong>{document.filename}</strong> · {document.content_type} · {document.chunk_count} chunks</span><span className="row">{document.content_type === "questions" && <button className="secondary" onClick={() => solveQuestionBank(document.id)} disabled={busy}>Solve all questions</button>}<button className="danger" onClick={() => removeDocument(document.id)}>Delete</button></span></li>)}{!documents.length && <li>No documents uploaded yet.</li>}</ul></section>
    <section className="card"><h2>3. Study chat</h2><div className="row"><select value={mode} onChange={(e) => setMode(e.target.value)}><option value="explain">Topic explanation</option><option value="solve_question">Question solver</option><option value="synthesize">Cross-document synthesis</option></select><select value={level} onChange={(e) => setLevel(e.target.value)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select><button className="secondary" onClick={() => { setChat([]); setAnswer(null); }}>Clear chat</button></div><p className="hint">Follow-up questions remember this conversation while every factual answer remains grounded in your uploaded sources.</p><textarea rows="4" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Example: Explain normalization and solve a 10-mark question on it." /><button onClick={ask} disabled={busy}>{busy ? "Thinking…" : "Send"}</button>{chat.map((message, index) => <article className="answer" key={index}><h3>You</h3><p className="prewrap">{message.question}</p><h3>Assistant</h3><p className="prewrap">{message.answer}</p>{message.prerequisites?.length > 0 && <p><strong>Suggested prerequisites:</strong> {message.prerequisites.join(", ")}</p>}<p className="hint"><strong>Sources:</strong> {message.sources?.join(", ") || "No sources"}</p></article>)}</section>
    {batchAnswers && <section className="card"><h2>Question-bank answers: {batchAnswers.document}</h2><p>{batchAnswers.questions_detected} numbered questions detected.</p>{batchAnswers.answers.map((item, index) => <article className="answer" key={index}><h3>Question {index + 1}</h3><p className="prewrap">{item.question}</p><h3>Answer</h3><p className="prewrap">{item.answer}</p><p className="hint"><strong>Sources:</strong> {item.sources.join(", ") || "No supporting source found"}</p></article>)}</section>}
    <section className="grid"><article className="card"><h2>Learning analytics</h2>{analytics ? <><p><strong>{analytics.documents}</strong> documents · <strong>{analytics.chunks}</strong> chunks</p><p>Categories: {Object.entries(analytics.by_content_type || {}).map(([key, value]) => `${key}: ${value}`).join(", ") || "none"}</p><p>{analytics.topics} mapped topics · {analytics.question_mappings} question-topic links</p></> : <p>Loading…</p>}</article><article className="card"><h2>Knowledge graph</h2>{graph?.nodes?.length ? <><p>{graph.nodes.length} topics and {graph.edges.length} relationships. Prerequisite edges use a conservative ordering inference from your material.</p><ul>{graph.nodes.slice(0, 8).map((node) => <li key={node.id}>{node.name} <span className="hint">({node.frequency} mentions)</span></li>)}</ul></> : <p>Upload material to build the subject topic graph.</p>}</article></section></>}</main>;
}
