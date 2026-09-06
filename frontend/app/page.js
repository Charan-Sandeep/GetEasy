"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState("");

  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);

  const [activeSubject, setActiveSubject] = useState(null);

  const [subjects, setSubjects] = useState([]);

  // ==========================================
  // ADD FILES
  // ==========================================

  function addFiles(newFiles) {
    const incoming = Array.from(newFiles);

    if (!incoming.length) return;

    setFiles((current) => {
      const existingKeys = new Set(
        current.map(
          (file) =>
            `${file.name}-${file.size}-${file.lastModified}`
        )
      );

      const unique = incoming.filter(
        (file) =>
          !existingKeys.has(
            `${file.name}-${file.size}-${file.lastModified}`
          )
      );

      return [...current, ...unique];
    });

    setError("");
  }

  // ==========================================
  // NORMAL FILE INPUT
  // ==========================================

  function handleFileChange(event) {
    addFiles(event.target.files);
    event.target.value = "";
  }

  // ==========================================
  // FOLDER INPUT
  // ==========================================

  function handleFolderChange(event) {
    addFiles(event.target.files);
    event.target.value = "";
  }

  // ==========================================
  // DRAG & DROP
  // ==========================================

  function handleDragOver(event) {
    event.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);

    addFiles(event.dataTransfer.files);
  }

  // ==========================================
  // REMOVE FILE
  // ==========================================

  function removeFile(index) {
    setFiles((current) =>
      current.filter((_, i) => i !== index)
    );
  }

  // ==========================================
  // CLEAR FILES
  // ==========================================

  function clearFiles() {
    if (uploading) return;

    setFiles([]);
    setResults([]);
    setError("");
  }

  // ==========================================
  // UPLOAD ALL FILES
  // ==========================================

  async function handleUploadAll() {
    if (!files.length || uploading) return;

    setUploading(true);
    setUploadProgress(0);
    setResults([]);
    setError("");

    const successfulResults = [];
    const failedResults = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      setCurrentFile(file.name);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(
          `${API_BASE}/documents/upload`,
          {
            method: "POST",
            body: formData,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.detail || "Upload failed"
          );
        }

        successfulResults.push({
          ...data,
          status: "success",
        });
      } catch (err) {
        failedResults.push({
          filename: file.name,
          status: "error",
          error: err.message,
        });
      }

      setUploadProgress(
        Math.round(((i + 1) / files.length) * 100)
      );

      setResults([
        ...successfulResults,
        ...failedResults,
      ]);
    }

    // --------------------------------------
    // UPDATE SUBJECTS
    // --------------------------------------

    const groupedSubjects = {};

    successfulResults.forEach((result) => {
      if (!groupedSubjects[result.subject_id]) {
        groupedSubjects[result.subject_id] = {
          id: result.subject_id,
          name: result.subject_name,
          documents: 0,
        };
      }

      groupedSubjects[result.subject_id].documents++;
    });

    setSubjects((current) => {
      const updated = [...current];

      Object.values(groupedSubjects).forEach(
        (newSubject) => {
          const existingIndex = updated.findIndex(
            (subject) =>
              subject.id === newSubject.id
          );

          if (existingIndex >= 0) {
            updated[existingIndex] = {
              ...updated[existingIndex],
              documents:
                updated[existingIndex].documents +
                newSubject.documents,
            };
          } else {
            updated.push(newSubject);
          }
        }
      );

      return updated;
    });

    setUploading(false);
    setCurrentFile("");
    setFiles([]);
  }

  // ==========================================
  // ASK AI
  // ==========================================

  async function handleAsk() {
    if (
      !question.trim() ||
      !activeSubject?.id ||
      asking
    ) {
      return;
    }

    setAsking(true);
    setAnswer(null);

    try {
      const response = await fetch(
        `${API_BASE}/query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject_id: activeSubject.id,
            question: question.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to generate answer."
        );
      }

      setAnswer(data);
    } catch (err) {
      setAnswer({
        answer: `Something went wrong.\n\n${err.message}`,
      });
    } finally {
      setAsking(false);
    }
  }

  // ==========================================
  // SUBJECT ICON
  // ==========================================

  function subjectIcon(name) {
    const value = name.toLowerCase();

    if (value.includes("operating")) return "⌘";
    if (value.includes("database")) return "◈";
    if (value.includes("machine")) return "✦";
    if (value.includes("network")) return "◎";
    if (value.includes("data structure")) return "◇";
    if (value.includes("artificial")) return "◉";
    if (value.includes("computer")) return "▣";
    if (value.includes("mathemat")) return "∑";

    return "◆";
  }

  // ==========================================
  // FILE SIZE
  // ==========================================

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  // ==========================================
  // FILE TYPE
  // ==========================================

  function fileIcon(filename) {
    const ext =
      filename.split(".").pop()?.toLowerCase();

    if (ext === "pdf") return "PDF";
    if (ext === "doc" || ext === "docx") return "DOC";
    if (ext === "ppt" || ext === "pptx") return "PPT";
    if (ext === "txt") return "TXT";

    return "FILE";
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-white">

      {/* ==================================================
          SIDEBAR
      ================================================== */}

      <aside className="fixed inset-y-0 left-0 hidden w-[250px] border-r border-white/[0.06] bg-[#090b10] lg:flex lg:flex-col">

        <div className="flex h-full flex-col">

          {/* Logo */}

          <div className="flex h-[76px] items-center px-6">

            <div className="flex items-center gap-3">

              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white">
                <img
                  src="/logo.png"
                  alt="GetEasy"
                  className="h-full w-full object-contain"
                />
              </div>

              <div>
                <p className="text-[15px] font-semibold">
                  GetEasy
                </p>

                <p className="text-[11px] text-white/35">
                  AI learning workspace
                </p>
              </div>

            </div>

          </div>


          {/* Navigation */}

          <div className="px-3 py-4">

            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/25">
              Workspace
            </p>

            <button className="flex w-full items-center gap-3 rounded-lg bg-white/[0.06] px-3 py-2.5 text-left text-xs text-white">
              <span>⌂</span>
              Overview
            </button>

            <button className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-white/35 transition hover:bg-white/[0.035] hover:text-white">
              <span>▦</span>
              Subjects
            </button>

            <button className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-white/35 transition hover:bg-white/[0.035] hover:text-white">
              <span>◌</span>
              Documents
            </button>

          </div>


          {/* Subject list */}

          <div className="mt-3 px-3">

            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/25">
              Your subjects
            </p>

            <div className="mt-2 space-y-1">

              {subjects.length === 0 ? (

                <p className="px-3 py-3 text-xs leading-5 text-white/25">
                  Your subjects will appear here.
                </p>

              ) : (

                subjects.map((subject) => (

                  <button
                    key={subject.id}
                    onClick={() => {
                      setActiveSubject(subject);
                      setAnswer(null);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition ${
                      activeSubject?.id === subject.id
                        ? "bg-white/[0.06] text-white"
                        : "text-white/40 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >

                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05]">
                      {subjectIcon(subject.name)}
                    </span>

                    <span className="truncate">
                      {subject.name}
                    </span>

                  </button>

                ))

              )}

            </div>

          </div>


          {/* System */}

          <div className="mt-auto p-4">

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">

              <div className="flex items-center gap-2">

                <span className="h-2 w-2 rounded-full bg-emerald-400" />

                <span className="text-xs text-white/60">
                  AI services online
                </span>

              </div>

              <p className="mt-2 text-[11px] text-white/25">
                Ready to analyze your notes.
              </p>

            </div>

          </div>

        </div>

      </aside>


      {/* ==================================================
          MAIN
      ================================================== */}

      <div className="lg:ml-[250px]">

        {/* Header */}

        <header className="border-b border-white/[0.06] bg-[#07090d]">

          <div className="flex h-[76px] items-center justify-between px-6 sm:px-10">

            <div>

              <p className="text-xs text-white/30">
                Workspace
              </p>

              <p className="mt-1 text-sm font-medium">
                Overview
              </p>

            </div>

            <div className="flex items-center gap-3">

              <div className="hidden rounded-lg border border-white/[0.06] px-3 py-2 text-xs text-white/30 sm:block">
                AI-powered learning
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] text-xs font-semibold">
                U
              </div>

            </div>

          </div>

        </header>


        <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8 sm:py-14">


          {/* ==================================================
              HERO
          ================================================== */}

          <section className="max-w-3xl">

            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/15 bg-blue-400/[0.06] px-3 py-1.5">

              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />

              <span className="text-[11px] text-blue-300">
                Your AI study workspace
              </span>

            </div>

            <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">

              Learn from your notes,

              <br />

              <span className="text-white/30">
                not from the clutter.
              </span>

            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/40">
              Upload individual files or entire folders.
              GetEasy will automatically identify subjects
              and organize everything for you.
            </p>

          </section>


          {/* ==================================================
              UPLOAD AREA
          ================================================== */}

          <section className="mt-10">

            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0c0f15]">

              <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">

                <div>

                  <h2 className="text-sm font-semibold">
                    Add study material
                  </h2>

                  <p className="mt-1 text-xs text-white/30">
                    Upload multiple files or an entire folder.
                  </p>

                </div>

                <span className="hidden text-[10px] uppercase tracking-wider text-white/20 sm:block">
                  PDF · DOCX · PPTX · TXT
                </span>

              </div>


              <div className="p-4 sm:p-6">

                {/* DROP AREA */}

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`rounded-xl border-2 border-dashed p-8 transition sm:p-12 ${
                    dragging
                      ? "border-blue-400 bg-blue-400/[0.05]"
                      : "border-white/[0.08] bg-[#080a0f]"
                  }`}
                >

                  <div className="text-center">

                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.035] text-2xl text-white/50">
                      ↑
                    </div>

                    <h3 className="mt-5 text-sm font-medium">
                      Drop your files or folder here
                    </h3>

                    <p className="mt-2 text-xs text-white/25">
                      or choose from your computer
                    </p>


                    {/* BUTTONS */}

                    <div className="mt-6 flex flex-wrap justify-center gap-3">

                      <label
                        htmlFor="file-picker"
                        className="cursor-pointer rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-black transition hover:bg-white/90"
                      >
                        Choose files
                      </label>

                      <label
                        htmlFor="folder-picker"
                        className="cursor-pointer rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        📁 Choose folder
                      </label>

                    </div>


                    {/* MULTIPLE FILE INPUT */}

                    <input
                      id="file-picker"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />


                    {/* FOLDER INPUT */}

                    <input
                      id="folder-picker"
                      type="file"
                      webkitdirectory=""
                      directory=""
                      multiple
                      className="hidden"
                      onChange={handleFolderChange}
                    />

                  </div>

                </div>


                {/* ==================================================
                    FILE QUEUE
                ================================================== */}

                {files.length > 0 && (

                  <div className="mt-5">

                    <div className="flex items-center justify-between">

                      <div>

                        <p className="text-xs font-medium">
                          Upload queue
                        </p>

                        <p className="mt-1 text-[11px] text-white/25">
                          {files.length}{" "}
                          {files.length === 1
                            ? "file"
                            : "files"}{" "}
                          selected
                        </p>

                      </div>

                      {!uploading && (

                        <button
                          onClick={clearFiles}
                          className="text-[11px] text-white/25 transition hover:text-white/60"
                        >
                          Clear all
                        </button>

                      )}

                    </div>


                    <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1">

                      {files.map((file, index) => (

                        <div
                          key={`${file.name}-${file.lastModified}-${index}`}
                          className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
                        >

                          {/* File icon */}

                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-[9px] font-bold text-white/50">
                            {fileIcon(file.name)}
                          </div>


                          {/* Info */}

                          <div className="min-w-0 flex-1">

                            <p className="truncate text-xs font-medium text-white/70">
                              {file.name}
                            </p>

                            <p className="mt-1 text-[10px] text-white/25">
                              {formatSize(file.size)}
                            </p>

                          </div>


                          {/* Remove */}

                          {!uploading && (

                            <button
                              onClick={() =>
                                removeFile(index)
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-md text-white/20 transition hover:bg-white/[0.05] hover:text-white"
                            >
                              ×
                            </button>

                          )}

                        </div>

                      ))}

                    </div>


                    {/* PROGRESS */}

                    {uploading && (

                      <div className="mt-5 rounded-xl border border-blue-400/10 bg-blue-400/[0.035] p-4">

                        <div className="flex items-center justify-between">

                          <div className="flex items-center gap-3">

                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400/20 border-t-blue-400" />

                            <div>

                              <p className="text-xs font-medium">
                                Analyzing notes...
                              </p>

                              <p className="mt-1 max-w-[300px] truncate text-[10px] text-white/25">
                                {currentFile}
                              </p>

                            </div>

                          </div>

                          <span className="text-xs font-semibold text-blue-300">
                            {uploadProgress}%
                          </span>

                        </div>


                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">

                          <div
                            className="h-full rounded-full bg-blue-400 transition-all duration-300"
                            style={{
                              width: `${uploadProgress}%`,
                            }}
                          />

                        </div>

                      </div>

                    )}


                    {/* UPLOAD */}

                    <button
                      onClick={handleUploadAll}
                      disabled={uploading}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-30"
                    >

                      {uploading ? (
                        <>
                          Uploading{" "}
                          {Math.ceil(
                            (uploadProgress /
                              100) *
                              files.length
                          )}
                          /
                          {files.length}
                        </>
                      ) : (
                        <>
                          Upload{" "}
                          {files.length}{" "}
                          {files.length === 1
                            ? "file"
                            : "files"}{" "}
                          →
                        </>
                      )}

                    </button>

                  </div>

                )}

              </div>

            </div>


            {/* Error */}

            {error && (

              <div className="mt-4 rounded-xl border border-red-400/10 bg-red-400/[0.04] px-5 py-4 text-sm text-red-300">
                {error}
              </div>

            )}

          </section>


          {/* ==================================================
              UPLOAD RESULTS
          ================================================== */}

          {results.length > 0 && (

            <section className="mt-8">

              <div className="rounded-2xl border border-white/[0.07] bg-[#0c0f15]">

                <div className="border-b border-white/[0.06] px-6 py-5">

                  <p className="text-sm font-semibold">
                    Upload results
                  </p>

                  <p className="mt-1 text-xs text-white/25">
                    Your documents have been analyzed and organized.
                  </p>

                </div>


                <div className="divide-y divide-white/[0.05]">

                  {results.map((result, index) => (

                    <div
                      key={index}
                      className="flex items-center gap-4 px-6 py-4"
                    >

                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          result.status === "success"
                            ? "bg-emerald-400/10 text-emerald-300"
                            : "bg-red-400/10 text-red-300"
                        }`}
                      >
                        {result.status === "success"
                          ? "✓"
                          : "!"}
                      </div>


                      <div className="min-w-0 flex-1">

                        <p className="truncate text-xs font-medium">
                          {result.filename}
                        </p>

                        {result.status === "success" ? (

                          <p className="mt-1 text-[11px] text-white/30">
                            Organized into{" "}
                            <span className="text-white/60">
                              {result.subject_name}
                            </span>
                          </p>

                        ) : (

                          <p className="mt-1 text-[11px] text-red-300/60">
                            {result.error}
                          </p>

                        )}

                      </div>


                      {result.status === "success" && (

                        <span className="hidden rounded-lg bg-white/[0.04] px-3 py-1.5 text-[10px] text-white/30 sm:block">
                          {result.chunks_created} chunks
                        </span>

                      )}

                    </div>

                  ))}

                </div>

              </div>

            </section>

          )}


          {/* ==================================================
              SUBJECTS
          ================================================== */}

          <section className="mt-14">

            <div className="flex items-end justify-between">

              <div>

                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/20">
                  Library
                </p>

                <h2 className="mt-2 text-xl font-semibold">
                  Your subjects
                </h2>

              </div>

              <span className="text-xs text-white/20">
                {subjects.length}{" "}
                {subjects.length === 1
                  ? "subject"
                  : "subjects"}
              </span>

            </div>


            {subjects.length === 0 ? (

              <div className="mt-5 rounded-2xl border border-white/[0.06] bg-[#0c0f15] px-6 py-12 text-center">

                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] text-lg text-white/30">
                  ◇
                </div>

                <h3 className="mt-4 text-sm font-medium">
                  No subjects yet
                </h3>

                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-white/25">
                  Upload your study material and your
                  subjects will appear here automatically.
                </p>

              </div>

            ) : (

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">

                {subjects.map((subject) => (

                  <button
                    key={subject.id}
                    onClick={() => {
                      setActiveSubject(subject);
                      setAnswer(null);
                    }}
                    className={`group rounded-2xl border p-6 text-left transition ${
                      activeSubject?.id === subject.id
                        ? "border-blue-400/30 bg-blue-400/[0.04]"
                        : "border-white/[0.06] bg-[#0c0f15] hover:border-white/[0.12] hover:bg-[#0f1219]"
                    }`}
                  >

                    <div className="flex items-start justify-between">

                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.04] text-lg text-white/60">
                        {subjectIcon(subject.name)}
                      </div>

                      <span className="text-white/15 transition group-hover:translate-x-1 group-hover:text-white/60">
                        →
                      </span>

                    </div>

                    <h3 className="mt-6 truncate text-sm font-semibold">
                      {subject.name}
                    </h3>

                    <p className="mt-1 text-xs text-white/25">
                      {subject.documents}{" "}
                      {subject.documents === 1
                        ? "document"
                        : "documents"}
                    </p>

                  </button>

                ))}

              </div>

            )}

          </section>


          {/* ==================================================
              AI TUTOR
          ================================================== */}

          {activeSubject && (

            <section className="mt-14">

              <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0c0f15]">

                <div className="flex items-center gap-4 border-b border-white/[0.06] px-6 py-5">

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-400/10 text-blue-300">
                    ✦
                  </div>

                  <div>

                    <p className="text-sm font-semibold">
                      AI Tutor
                    </p>

                    <p className="mt-0.5 text-xs text-white/25">
                      Ask anything about{" "}
                      {activeSubject.name}
                    </p>

                  </div>

                </div>


                <div className="p-6">

                  {!answer && (

                    <div className="mb-5 flex flex-wrap gap-2">

                      <Suggestion
                        text="Summarize my notes"
                        onClick={() =>
                          setQuestion(
                            "Summarize the important concepts from my notes."
                          )
                        }
                      />

                      <Suggestion
                        text="Explain difficult topics"
                        onClick={() =>
                          setQuestion(
                            "Explain the difficult topics from my notes in simple terms."
                          )
                        }
                      />

                      <Suggestion
                        text="Create exam questions"
                        onClick={() =>
                          setQuestion(
                            "Create important exam questions from my notes."
                          )
                        }
                      />

                    </div>

                  )}


                  <div className="relative">

                    <textarea
                      value={question}
                      onChange={(e) =>
                        setQuestion(e.target.value)
                      }
                      onKeyDown={(e) => {

                        if (
                          e.key === "Enter" &&
                          !e.shiftKey
                        ) {
                          e.preventDefault();
                          handleAsk();
                        }

                      }}
                      rows={4}
                      placeholder={`Ask anything about ${activeSubject.name}...`}
                      className="w-full resize-none rounded-xl border border-white/[0.08] bg-[#080a0f] px-4 py-4 pr-16 text-sm leading-6 text-white outline-none placeholder:text-white/20 focus:border-blue-400/30"
                    />


                    <button
                      onClick={handleAsk}
                      disabled={
                        !question.trim() ||
                        asking
                      }
                      className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white font-bold text-black transition hover:bg-white/90 disabled:opacity-20"
                    >

                      {asking ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                      ) : (
                        "↑"
                      )}

                    </button>

                  </div>


                  {/* ==================================================
                      AI ANSWER
                  ================================================== */}

                  {answer && (

                    <div className="mt-8 border-t border-white/[0.06] pt-7">

                      <p className="text-xs font-semibold text-blue-300">
                        GetEasy
                      </p>


                      <div className="mt-3 rounded-xl bg-[#080a0f] p-5">

                        <FormattedAnswer
                          text={answer.answer}
                        />

                      </div>


                      {/* SOURCES */}

                      {answer.sources?.length > 0 && (

                        <div className="mt-5">

                          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/20">
                            Sources
                          </p>

                          <div className="mt-2 flex flex-wrap gap-2">

                            {answer.sources.map(
                              (source, index) => (

                                <span
                                  key={index}
                                  className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] text-white/35"
                                >
                                  {source}
                                </span>

                              )
                            )}

                          </div>

                        </div>

                      )}

                    </div>

                  )}

                </div>

              </div>

            </section>

          )}

        </div>

      </div>

    </main>
  );
}


/* ==================================================
   SUGGESTION
================================================== */

function Suggestion({ text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] text-white/35 transition hover:border-white/[0.12] hover:text-white/70"
    >
      {text}
    </button>
  );
}


/* ==================================================
   ANSWER FORMATTER
================================================== */

function FormattedAnswer({ text }) {
  if (!text) {
    return (
      <p className="text-sm text-white/40">
        No answer was returned.
      </p>
    );
  }

  return (
    <div className="max-w-none text-sm leading-7 text-white/70">

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{

          h1: ({ children }) => (
            <h1 className="mb-4 mt-2 text-2xl font-bold text-white">
              {children}
            </h1>
          ),

          h2: ({ children }) => (
            <h2 className="mb-3 mt-7 text-xl font-semibold text-white">
              {children}
            </h2>
          ),

          h3: ({ children }) => (
            <h3 className="mb-2 mt-5 text-lg font-semibold text-white">
              {children}
            </h3>
          ),

          p: ({ children }) => (
            <p className="mb-4 leading-7 text-white/65">
              {children}
            </p>
          ),

          ul: ({ children }) => (
            <ul className="mb-4 ml-6 list-disc space-y-2 text-white/65">
              {children}
            </ul>
          ),

          ol: ({ children }) => (
            <ol className="mb-4 ml-6 list-decimal space-y-2 text-white/65">
              {children}
            </ol>
          ),

          li: ({ children }) => (
            <li className="pl-1">
              {children}
            </li>
          ),

          strong: ({ children }) => (
            <strong className="font-semibold text-white">
              {children}
            </strong>
          ),

          em: ({ children }) => (
            <em className="text-white/80">
              {children}
            </em>
          ),

          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-blue-400/40 pl-4 text-white/50">
              {children}
            </blockquote>
          ),

          code: ({ children }) => (
            <code className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[13px] text-blue-200">
              {children}
            </code>
          ),

          pre: ({ children }) => (
            <pre className="my-5 overflow-x-auto rounded-xl border border-white/[0.06] bg-[#05070a] p-4 text-[13px] leading-6">
              {children}
            </pre>
          ),

          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-xl border border-white/[0.07]">
              <table className="w-full border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),

          thead: ({ children }) => (
            <thead className="bg-white/[0.04]">
              {children}
            </thead>
          ),

          th: ({ children }) => (
            <th className="border-b border-white/[0.08] px-4 py-3 font-semibold text-white">
              {children}
            </th>
          ),

          td: ({ children }) => (
            <td className="border-b border-white/[0.05] px-4 py-3 text-white/60">
              {children}
            </td>
          ),

          hr: () => (
            <hr className="my-6 border-white/[0.06]" />
          ),

        }}
      >
        {text}
      </ReactMarkdown>

    </div>
  );
}