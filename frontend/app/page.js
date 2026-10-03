"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://geteasy-gjeb.onrender.com";

function Markdown({ text }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || "No answer was returned."}</ReactMarkdown>;
}

function subjectIcon(name = "") {
  return name.trim().slice(0, 1).toUpperCase() || "S";
}

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
  const [autoOrganize, setAutoOrganize] = useState(false);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("explain");
  const [level, setLevel] = useState("intermediate");
  const [chat, setChat] = useState([]);
  const [batchAnswers, setBatchAnswers] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [graph, setGraph] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [subjectMenuId, setSubjectMenuId] = useState("");
  const [documentMenuId, setDocumentMenuId] = useState("");
  const [expandedSubjectId, setExpandedSubjectId] = useState("");
  const [theme, setTheme] = useState("light");
  const uploadInputRef = useRef(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("subject-guide-token");
    if (saved) setToken(saved);
    const savedTheme = window.localStorage.getItem("subject-guide-theme");
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("subject-guide-theme", theme);
  }, [theme]);
  useEffect(() => { if (token) loadSubjects(); }, [token]);
  useEffect(() => {
    if (token && subjectId) {
      setChat([]); setBatchAnswers(null); loadDocuments(); loadInsights();
    }
  }, [token, subjectId]);

  const headers = (json = true) => ({ ...(json ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` });
  const activeSubject = subjects.find((subject) => subject.id === subjectId);

  async function request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, options);
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
      window.localStorage.setItem("subject-guide-token", data.access_token);
      setToken(data.access_token); setNotice(`Signed in as ${data.user.email}.`);
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function createSubject(event) {
    event.preventDefault();
    if (!subjectName.trim()) return;
    setBusy(true);
    try {
      const data = await request("/subjects", { method: "POST", headers: headers(), body: JSON.stringify({ name: subjectName }) });
      setSubjectName(""); setSubjectId(data.id); await loadSubjects();
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function upload(selectedFiles = files, automatic = autoOrganize) {
    if (!selectedFiles.length || (!subjectId && !automatic)) return setNotice("Choose a subject, or enable automatic organization, before uploading.");
    setBusy(true); setNotice("Preparing your study materials…");
    try {
      const completed = [];
      let lastSubjectId = subjectId;
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        setNotice(`Indexing ${index + 1} of ${selectedFiles.length}: ${file.name}`);
        const form = new FormData();
        if (!automatic) form.append("subject_id", subjectId);
        form.append("auto_detect", String(automatic)); form.append("file", file);
        const data = await request("/documents/upload", { method: "POST", headers: headers(false), body: form });
        completed.push(data.filename);
        if (data.subject_id) lastSubjectId = data.subject_id;
      }
      setFiles([]); await loadSubjects();
      if (lastSubjectId !== subjectId) setSubjectId(lastSubjectId);
      else { await loadDocuments(); await loadInsights(); }
      setNotice(`Uploaded and indexed ${completed.length} file${completed.length === 1 ? "" : "s"}.`);
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function removeDocument(id) {
    if (!window.confirm("Delete this document and its indexed chunks?")) return;
    try { await request(`/documents/${id}`, { method: "DELETE", headers: headers() }); await loadDocuments(); await loadInsights(); } catch (error) { setNotice(error.message); }
  }
  async function removeSubject(id, name) {
    if (!window.confirm(`Delete ${name} and every uploaded document, vector, topic, and question mapping in it? This cannot be undone.`)) return;
    try {
      await request(`/subjects/${id}`, { method: "DELETE", headers: headers() });
      const remaining = subjects.filter((subject) => subject.id !== id);
      setSubjects(remaining);
      if (subjectId === id) { setSubjectId(remaining[0]?.id || ""); setDocuments([]); setChat([]); setBatchAnswers(null); }
      setNotice(`Deleted ${name}.`);
    } catch (error) { setNotice(error.message); }
  }
  async function solveQuestionBank(documentId) {
    setBusy(true); setBatchAnswers(null); setNotice("Solving each numbered question. A full paper can take a few minutes…");
    try {
      const data = await request("/query/question-bank/solve", { method: "POST", headers: headers(), body: JSON.stringify({ subject_id: subjectId, document_id: documentId, level }) });
      setBatchAnswers(data); setNotice(`Solved ${data.questions_detected} questions from ${data.document}.`);
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function ask() {
    if (!question.trim() || !subjectId) return setNotice("Select a subject and write a question first.");
    const requestForAllQuestions = /^\s*(answer|solve)(?:\s+all|\s+the)?\s+questions?/i.test(question);
    const questionPaper = documents.filter((document) => document.content_type === "questions").sort((a, b) => Number(b.chunk_count) - Number(a.chunk_count))[0];
    if (requestForAllQuestions && questionPaper) { setQuestion(""); return solveQuestionBank(questionPaper.id); }
    const askedQuestion = question;
    setBusy(true); setQuestion("");
    try {
      const history = chat.flatMap((message) => [{ role: "user", content: message.question }, { role: "assistant", content: message.answer }]);
      const data = await request("/query", { method: "POST", headers: headers(), body: JSON.stringify({ subject_id: subjectId, question: askedQuestion, mode, level, top_k: 7, history }) });
      setChat((current) => [...current, { question: askedQuestion, answer: data.answer, sources: data.sources, prerequisites: data.prerequisites }]);
    } catch (error) { setQuestion(askedQuestion); setNotice(error.message); } finally { setBusy(false); }
  }
  function startNewChat() { setChat([]); setBatchAnswers(null); setQuestion(""); setNotice(""); }
  function openFilePicker() { uploadInputRef.current?.click(); }
  function quickUpload(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (selected.length) upload(selected, false);
  }
  function signOut() { window.localStorage.removeItem("subject-guide-token"); setToken(""); setSubjects([]); setSubjectId(""); setDocuments([]); }

  if (!token) return <main className="auth-page"><section className="auth-card"><div className="brand-mark">SG</div><h1>Subject Guide</h1><p>Your personal learning workspace for documents, question banks, and grounded answers.</p><form onSubmit={authenticate}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="8" required /></label><button disabled={busy}>{busy ? "Please wait…" : authMode === "login" ? "Continue" : "Create account"}</button></form><button className="text-button" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button>{notice && <p className="toast">{notice}</p>}</section></main>;

  return <main className="app-shell">
    <input ref={uploadInputRef} className="hidden-file-input" type="file" accept=".pdf,.docx,.pptx,.txt" multiple onChange={quickUpload} />
    <aside className="sidebar">
      <div className="sidebar-brand"><span className="brand-mark">SG</span><span>Subject Guide</span></div>
      <button className="new-chat" onClick={startNewChat}><span>＋</span> New chat</button>
      <div className="sidebar-section"><span>Your subjects</span><button className="icon-button" title="Create subject" onClick={() => document.getElementById("subject-name")?.focus()}>＋</button></div>
      <nav className="subject-list">{subjects.map((subject) => <div key={subject.id} className={subject.id === subjectId ? "subject-row active" : "subject-row"}><button className="subject" onClick={() => { setSubjectId(subject.id); setSubjectMenuId(""); setDocumentMenuId(""); setExpandedSubjectId(subject.id); }}><i>{subjectIcon(subject.name)}</i><span>{subject.name}</span></button><button className="subject-menu-button" title={`${subject.name} options`} onClick={() => setSubjectMenuId(subjectMenuId === subject.id ? "" : subject.id)}>•••</button>{subjectMenuId === subject.id && <div className="subject-menu"><button onClick={() => { setSubjectMenuId(""); removeSubject(subject.id, subject.name); }}>Delete subject</button></div>}{expandedSubjectId === subject.id && subjectId === subject.id && <div className="subject-documents"><div className="subject-documents-title">Files in this subject</div>{documents.length ? documents.map((document) => <div className="sidebar-document" key={document.id}><span title={document.filename}>{document.filename}</span><button className="document-menu-button" title={`${document.filename} options`} onClick={() => setDocumentMenuId(documentMenuId === document.id ? "" : document.id)}>•••</button>{documentMenuId === document.id && <div className="document-menu"><button onClick={() => { setDocumentMenuId(""); removeDocument(document.id); }}>Delete file</button></div>}</div>) : <p>No files uploaded.</p>}</div>}</div>)}{!subjects.length && <p className="empty-side">Upload a file or create a subject to get started.</p>}</nav>
      <form className="quick-subject" onSubmit={createSubject}><input id="subject-name" value={subjectName} onChange={(event) => setSubjectName(event.target.value)} placeholder="New subject" /><button title="Create subject" disabled={busy}>＋</button></form>
      <div className="sidebar-footer"><button onClick={() => setLibraryOpen(!libraryOpen)}>⌁ Library</button><button onClick={() => setInsightsOpen(!insightsOpen)}>◌ Insights</button><button onClick={signOut}>↪ Sign out</button></div>
    </aside>

    <section className="chat-workspace">
      <header className="chat-header"><div><span className="eyebrow">STUDY WORKSPACE</span><h1>{activeSubject?.name || "Subject Guide Assistant"}</h1></div><button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Switch colour theme">{theme === "dark" ? "☀ Light" : "◐ Dark"}</button></header>

      {notice && <div className="toast workspace-toast">{notice}<button onClick={() => setNotice("")}>×</button></div>}

      {libraryOpen && <section className="utility-panel"><div className="utility-heading"><div><span className="eyebrow">LIBRARY</span><h2>Upload study materials</h2></div><button className="icon-button" onClick={() => setLibraryOpen(false)}>×</button></div><div className="upload-row"><input type="file" accept=".pdf,.docx,.pptx,.txt" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><label className="folder-picker">Choose folder<input type="file" accept=".pdf,.docx,.pptx,.txt" multiple webkitdirectory="" directory="" onChange={(event) => setFiles(Array.from(event.target.files || []))} /></label><button onClick={upload} disabled={busy}>{busy ? "Indexing…" : "Upload"}</button></div><label className="auto-toggle"><input type="checkbox" checked={autoOrganize} onChange={(event) => setAutoOrganize(event.target.checked)} /> Automatically detect the subject</label>{files.length > 0 && <p className="muted">Selected: {files.map((file) => file.webkitRelativePath || file.name).join(", ")}</p>}<div className="document-list">{documents.map((document) => <div key={document.id} className="document-row"><span><strong>{document.filename}</strong><small>{document.content_type} · {document.chunk_count} chunks</small></span><span>{document.content_type === "questions" && <button className="small-button" onClick={() => solveQuestionBank(document.id)} disabled={busy}>Solve all</button>}<button className="delete-button" onClick={() => removeDocument(document.id)}>Delete</button></span></div>)}{subjectId && !documents.length && <p className="muted">No documents in this subject yet.</p>}</div><p className="muted">Type “answer all questions” in chat or use Solve all on a question paper. With no notes/answer keys, answers are labelled as general academic knowledge.</p></section>}

      {insightsOpen && <section className="utility-panel insights"><div className="utility-heading"><div><span className="eyebrow">WEEK 4</span><h2>Learning insights</h2></div><button className="icon-button" onClick={() => setInsightsOpen(false)}>×</button></div>{analytics ? <div className="insight-grid"><article><strong>{analytics.documents}</strong><span>documents</span></article><article><strong>{analytics.chunks}</strong><span>chunks</span></article><article><strong>{analytics.topics}</strong><span>topics</span></article><article><strong>{analytics.question_mappings}</strong><span>question links</span></article></div> : <p className="muted">Select a subject to see insights.</p>}{graph?.nodes?.length ? <p className="muted">Topic graph: {graph.nodes.slice(0, 8).map((node) => node.name).join(" · ")}</p> : null}</section>}

      <div className="conversation" aria-live="polite">{!subjectId ? <div className="welcome"><div className="welcome-icon">✦</div><h2>What would you like to study?</h2><p>Create a subject from the sidebar, or open Library to upload material and organize it automatically.</p><div className="welcome-cards"><button onClick={() => setLibraryOpen(true)}>Upload my notes <span>→</span></button><button onClick={() => { setLibraryOpen(true); setAutoOrganize(true); }}>Organize a folder <span>→</span></button></div></div> : !chat.length && !batchAnswers ? <div className="welcome"><div className="welcome-icon">✦</div><h2>How can I help with {activeSubject?.name}?</h2><p>Ask about your uploaded materials, solve an exam question, or ask for a study plan.</p><div className="welcome-cards"><button onClick={() => setQuestion("Explain the most important concepts in my uploaded materials.")}>Explain key topics <span>→</span></button><button onClick={() => setQuestion("Create a concise exam revision plan from my materials.")}>Plan my revision <span>→</span></button></div></div> : null}
        {chat.map((message, index) => <div className="message-pair" key={index}><div className="message user-message"><div className="avatar">You</div><p>{message.question}</p></div><div className="message assistant-message"><div className="avatar ai">SG</div><div className="markdown"><Markdown text={message.answer} />{message.prerequisites?.length > 0 && <p className="prerequisites"><strong>Suggested prerequisites:</strong> {message.prerequisites.join(", ")}</p>}{message.sources?.length > 0 && <div className="sources">{message.sources.map((source) => <span key={source}>⌁ {source}</span>)}</div>}</div></div></div>)}
        {batchAnswers && <section className="batch-results"><h2>{batchAnswers.questions_detected} answers from {batchAnswers.document}</h2>{batchAnswers.answers.map((item, index) => <article key={index}><h3>Question {index + 1}</h3><p>{item.question}</p><div className="markdown"><Markdown text={item.answer} /></div><div className="sources">{item.sources.map((source) => <span key={source}>⌁ {source}</span>)}</div></article>)}</section>}
      </div>

      {subjectId && <footer className="composer-wrap"><div className="composer"><textarea rows="1" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(); } }} placeholder={`Message ${activeSubject?.name || "your subject"}…`} /><div className="composer-footer"><button className="library-link" onClick={openFilePicker}>＋ Add files</button><select className="composer-select" value={mode} onChange={(event) => setMode(event.target.value)}><option value="explain">Explain</option><option value="solve_question">Solve</option><option value="synthesize">Synthesize</option></select><select className="composer-select" value={level} onChange={(event) => setLevel(event.target.value)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select><span>Enter to send · Shift+Enter for a new line</span><button className="send-button" onClick={ask} disabled={busy || !question.trim()}>{busy ? "…" : "↑"}</button></div></div></footer>}
    </section>
  </main>;
}
