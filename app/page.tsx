"use client";

import { useState, useRef, useCallback } from "react";

const INSTRUMENTS = [
  { id: "acoustic_guitar", label: "Acoustic Guitar", emoji: "🎸" },
  { id: "piano", label: "Piano", emoji: "🎹" },
  { id: "strings", label: "Strings / Violin", emoji: "🎻" },
  { id: "drums", label: "Drums & Percussion", emoji: "🥁" },
  { id: "bass", label: "Electric Bass", emoji: "🎵" },
  { id: "synth_pad", label: "Synth Pad", emoji: "🎛️" },
  { id: "flute", label: "Flute", emoji: "🪈" },
  { id: "brass", label: "Brass / Trumpet", emoji: "🎺" },
];

const MOODS = ["Melancholic", "Uplifting", "Energetic", "Calm", "Romantic", "Mysterious", "Epic"];
const GENRES = ["Pop", "Classical", "Jazz", "Lo-fi", "Cinematic", "Folk", "R&B"];

type InputMode = "text" | "record" | "upload";
type Status = "idle" | "analyzing" | "generating" | "done" | "error";

export default function VocaForge() {
  const [mode, setMode] = useState<InputMode>("text");
  const [textPrompt, setTextPrompt] = useState("");
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>(["piano"]);
  const [selectedMood, setSelectedMood] = useState("Melancholic");
  const [selectedGenre, setSelectedGenre] = useState("Cinematic");
  const [duration, setDuration] = useState(10);
  const [status, setStatus] = useState<Status>("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // ── HF Spaces backend URL ──────────────────────────────────────────────
  // Replace with your actual HF Space URL after deploying backend
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://YOUR-HF-SPACE.hf.space";

  const toggleInstrument = (id: string) => {
    setSelectedInstruments(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // ── Recording ──────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setRecordedBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  // ── Generate ───────────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (selectedInstruments.length === 0) {
      setError("Instrument එකක් select කරන්න.");
      return;
    }

    setStatus("analyzing");
    setError(null);
    setAudioUrl(null);
    setAnalysisResult(null);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append("instruments", selectedInstruments.join(","));
      formData.append("mood", selectedMood);
      formData.append("genre", selectedGenre);
      formData.append("duration", duration.toString());

      if (mode === "text") {
        if (!textPrompt.trim()) { setError("Text prompt ඇතුළු කරන්න."); setStatus("idle"); return; }
        formData.append("mode", "text");
        formData.append("prompt", textPrompt);
      } else if (mode === "record") {
        if (!recordedBlob) { setError("Recording ගන්න."); setStatus("idle"); return; }
        formData.append("mode", "vocal");
        formData.append("vocal", recordedBlob, "recording.webm");
      } else {
        if (!uploadedFile) { setError("File upload කරන්න."); setStatus("idle"); return; }
        formData.append("mode", "vocal");
        formData.append("vocal", uploadedFile);
      }

      setProgress(25);

      // Step 1: Analyze vocal / prompt
      const analyzeRes = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        body: formData,
      });
      if (!analyzeRes.ok) throw new Error(await analyzeRes.text());
      const analyzeData = await analyzeRes.json();
      setAnalysisResult(analyzeData.music_prompt);
      setStatus("generating");
      setProgress(50);

      // Step 2: Generate music
      const genForm = new FormData();
      genForm.append("music_prompt", analyzeData.music_prompt);
      genForm.append("duration", duration.toString());

      const genRes = await fetch(`${BACKEND_URL}/generate`, {
        method: "POST",
        body: genForm,
      });
      if (!genRes.ok) throw new Error(await genRes.text());

      setProgress(90);
      const blob = await genRes.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setStatus("done");
      setProgress(100);

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error occurred. Backend URL check කරන්න.");
      setStatus("error");
    }
  }, [mode, textPrompt, recordedBlob, uploadedFile, selectedInstruments, selectedMood, selectedGenre, duration, BACKEND_URL]);

  const statusLabel: Record<Status, string> = {
    idle: "",
    analyzing: "Vocal analyzing කරනවා...",
    generating: "MusicGen සංගීතය හදනවා...",
    done: "සූදානම්! 🎶",
    error: "Error occurred",
  };

  return (
    <div className="app">
      <header>
        <div className="logo">
          <span className="logo-icon">♪</span>
          <span className="logo-text">VocaForge</span>
        </div>
        <p className="tagline">Vocal → AI Instrumental · Powered by MusicGen</p>
      </header>

      <main>
        {/* ── Input Mode Tabs ── */}
        <section className="card">
          <h2 className="section-title">01 · Vocal Input</h2>
          <div className="tabs">
            {(["text", "record", "upload"] as InputMode[]).map(m => (
              <button
                key={m}
                className={`tab ${mode === m ? "active" : ""}`}
                onClick={() => setMode(m)}
              >
                {m === "text" ? "✍️ Text Prompt" : m === "record" ? "🎙️ Record Vocal" : "📁 Upload File"}
              </button>
            ))}
          </div>

          <div className="input-area">
            {mode === "text" && (
              <textarea
                className="text-input"
                placeholder="උදා: A slow, sad melody sung by a female voice in D minor..."
                value={textPrompt}
                onChange={e => setTextPrompt(e.target.value)}
                rows={4}
              />
            )}

            {mode === "record" && (
              <div className="record-area">
                <button
                  className={`record-btn ${isRecording ? "recording" : ""}`}
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  <span className="rec-dot" />
                  {isRecording ? "Stop Recording" : "Start Recording"}
                </button>
                {recordedBlob && (
                  <div className="recorded-preview">
                    <span className="check">✓</span> Recording ready
                    <audio controls src={URL.createObjectURL(recordedBlob)} className="mini-audio" />
                  </div>
                )}
              </div>
            )}

            {mode === "upload" && (
              <div
                className="upload-area"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) setUploadedFile(f);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  style={{ display: "none" }}
                  onChange={e => e.target.files?.[0] && setUploadedFile(e.target.files[0])}
                />
                {uploadedFile ? (
                  <div className="upload-done">
                    <span className="check">✓</span> {uploadedFile.name}
                  </div>
                ) : (
                  <>
                    <span className="upload-icon">⬆</span>
                    <p>MP3, WAV, FLAC drag & drop or click</p>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Instrument Select ── */}
        <section className="card">
          <h2 className="section-title">02 · Instruments</h2>
          <div className="instrument-grid">
            {INSTRUMENTS.map(inst => (
              <button
                key={inst.id}
                className={`inst-card ${selectedInstruments.includes(inst.id) ? "selected" : ""}`}
                onClick={() => toggleInstrument(inst.id)}
              >
                <span className="inst-emoji">{inst.emoji}</span>
                <span className="inst-label">{inst.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Style Controls ── */}
        <section className="card">
          <h2 className="section-title">03 · Style</h2>
          <div className="style-row">
            <div className="style-group">
              <label>Mood</label>
              <div className="pill-group">
                {MOODS.map(m => (
                  <button
                    key={m}
                    className={`pill ${selectedMood === m ? "active" : ""}`}
                    onClick={() => setSelectedMood(m)}
                  >{m}</button>
                ))}
              </div>
            </div>
            <div className="style-group">
              <label>Genre</label>
              <div className="pill-group">
                {GENRES.map(g => (
                  <button
                    key={g}
                    className={`pill ${selectedGenre === g ? "active" : ""}`}
                    onClick={() => setSelectedGenre(g)}
                  >{g}</button>
                ))}
              </div>
            </div>
            <div className="style-group">
              <label>Duration — <strong>{duration}s</strong></label>
              <input
                type="range" min={5} max={30} step={5}
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="slider"
              />
              <div className="slider-marks">
                {[5,10,15,20,25,30].map(v => <span key={v}>{v}s</span>)}
              </div>
            </div>
          </div>
        </section>

        {/* ── Generate Button ── */}
        <div className="generate-row">
          <button
            className={`generate-btn ${status !== "idle" && status !== "done" && status !== "error" ? "loading" : ""}`}
            onClick={generate}
            disabled={status === "analyzing" || status === "generating"}
          >
            {status === "analyzing" || status === "generating"
              ? <><span className="spinner" /> Generating...</>
              : "♪ Generate Instrumental"}
          </button>
        </div>

        {/* ── Progress ── */}
        {status !== "idle" && (
          <div className="status-area">
            {status !== "idle" && status !== "error" && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            )}
            <p className={`status-text ${status}`}>{statusLabel[status]}</p>
            {analysisResult && (
              <div className="analysis-box">
                <span className="analysis-label">Generated Prompt:</span>
                <p>{analysisResult}</p>
              </div>
            )}
            {error && <p className="error-text">⚠ {error}</p>}
          </div>
        )}

        {/* ── Output Player ── */}
        {audioUrl && (
          <section className="card output-card">
            <h2 className="section-title">🎶 Output</h2>
            <audio ref={audioRef} controls src={audioUrl} className="main-audio" />
            <a href={audioUrl} download="vocaforge_instrumental.wav" className="download-btn">
              ⬇ Download WAV
            </a>
          </section>
        )}
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #080810;
          --surface: #0f0f1a;
          --surface2: #161625;
          --border: #2a2a45;
          --accent: #7c6af7;
          --accent2: #b09cff;
          --green: #3de888;
          --red: #ff5e5e;
          --text: #eeeaf8;
          --text2: #9996bb;
          --text3: #55527a;
        }

        body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; min-height: 100vh; }

        .app { max-width: 820px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }

        header { text-align: center; margin-bottom: 2.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
        .logo { display: flex; align-items: center; justify-content: center; gap: .6rem; margin-bottom: .4rem; }
        .logo-icon { font-size: 2rem; color: var(--accent2); }
        .logo-text { font-family: 'Space Mono', monospace; font-size: 2rem; font-weight: 700; color: var(--text); letter-spacing: -1px; }
        .tagline { color: var(--text3); font-size: .85rem; letter-spacing: .05em; }

        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 1.5rem; margin-bottom: 1.25rem; }
        .section-title { font-family: 'Space Mono', monospace; font-size: .75rem; letter-spacing: .12em; color: var(--text3); text-transform: uppercase; margin-bottom: 1.1rem; }

        /* Tabs */
        .tabs { display: flex; gap: .5rem; margin-bottom: 1rem; }
        .tab { flex: 1; padding: .55rem; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text2); cursor: pointer; font-size: .82rem; transition: all .18s; font-family: 'DM Sans', sans-serif; }
        .tab.active { background: var(--accent); border-color: var(--accent); color: #fff; }
        .tab:hover:not(.active) { border-color: var(--accent2); color: var(--accent2); }

        /* Text input */
        .text-input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); padding: .85rem 1rem; font-family: 'DM Sans', sans-serif; font-size: .9rem; resize: vertical; outline: none; transition: border .18s; }
        .text-input:focus { border-color: var(--accent); }

        /* Record */
        .record-area { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 1.5rem 0; }
        .record-btn { display: flex; align-items: center; gap: .6rem; padding: .7rem 1.8rem; background: var(--surface2); border: 2px solid var(--border); border-radius: 40px; color: var(--text); cursor: pointer; font-size: .95rem; font-family: 'DM Sans', sans-serif; transition: all .18s; }
        .record-btn.recording { border-color: var(--red); color: var(--red); animation: pulse 1s infinite; }
        .record-btn:hover:not(.recording) { border-color: var(--accent); color: var(--accent2); }
        .rec-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--red); }
        .record-btn:not(.recording) .rec-dot { background: var(--accent); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }

        .recorded-preview { display: flex; flex-direction: column; align-items: center; gap: .6rem; color: var(--green); font-size: .88rem; }
        .check { font-size: 1.2rem; }
        .mini-audio { width: 260px; height: 32px; }

        /* Upload */
        .upload-area { border: 2px dashed var(--border); border-radius: 10px; padding: 2rem; text-align: center; cursor: pointer; color: var(--text3); transition: all .18s; }
        .upload-area:hover { border-color: var(--accent); color: var(--accent2); }
        .upload-icon { font-size: 1.8rem; display: block; margin-bottom: .5rem; }
        .upload-done { color: var(--green); font-size: .9rem; }

        /* Instruments */
        .instrument-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: .7rem; }
        .inst-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: .85rem .5rem; display: flex; flex-direction: column; align-items: center; gap: .4rem; cursor: pointer; transition: all .18s; }
        .inst-card.selected { background: #1e1a3a; border-color: var(--accent); }
        .inst-card:hover:not(.selected) { border-color: var(--accent2); }
        .inst-emoji { font-size: 1.5rem; }
        .inst-label { font-size: .72rem; color: var(--text2); text-align: center; }
        .inst-card.selected .inst-label { color: var(--accent2); }

        /* Style */
        .style-row { display: flex; flex-direction: column; gap: 1.2rem; }
        .style-group label { font-size: .8rem; color: var(--text2); display: block; margin-bottom: .5rem; }
        .style-group label strong { color: var(--accent2); }
        .pill-group { display: flex; flex-wrap: wrap; gap: .4rem; }
        .pill { padding: .35rem .85rem; background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; color: var(--text2); cursor: pointer; font-size: .8rem; font-family: 'DM Sans', sans-serif; transition: all .18s; }
        .pill.active { background: var(--accent); border-color: var(--accent); color: #fff; }
        .pill:hover:not(.active) { border-color: var(--accent2); color: var(--accent2); }

        /* Slider */
        .slider { width: 100%; accent-color: var(--accent); cursor: pointer; }
        .slider-marks { display: flex; justify-content: space-between; font-size: .7rem; color: var(--text3); margin-top: .25rem; }

        /* Generate */
        .generate-row { display: flex; justify-content: center; margin: 1.5rem 0; }
        .generate-btn { padding: .9rem 3rem; background: var(--accent); border: none; border-radius: 40px; color: #fff; font-size: 1rem; font-family: 'DM Sans', sans-serif; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: .6rem; transition: all .2s; letter-spacing: .02em; }
        .generate-btn:hover:not(:disabled) { background: var(--accent2); transform: translateY(-2px); box-shadow: 0 8px 24px #7c6af740; }
        .generate-btn:disabled { opacity: .6; cursor: not-allowed; transform: none; }
        .spinner { width: 16px; height: 16px; border: 2px solid #ffffff50; border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Status */
        .status-area { margin-bottom: 1.25rem; }
        .progress-bar { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; margin-bottom: .75rem; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 3px; transition: width .4s ease; }
        .status-text { text-align: center; font-size: .85rem; color: var(--text2); }
        .status-text.done { color: var(--green); }
        .status-text.error { color: var(--red); }
        .analysis-box { background: var(--surface2); border-left: 3px solid var(--accent); border-radius: 6px; padding: .75rem 1rem; margin-top: .75rem; }
        .analysis-label { font-size: .7rem; color: var(--text3); text-transform: uppercase; letter-spacing: .08em; display: block; margin-bottom: .3rem; }
        .analysis-box p { font-size: .85rem; color: var(--text2); font-style: italic; }
        .error-text { color: var(--red); font-size: .85rem; margin-top: .5rem; text-align: center; }

        /* Output */
        .output-card { border-color: var(--accent); }
        .main-audio { width: 100%; margin-bottom: 1rem; }
        .download-btn { display: inline-block; padding: .55rem 1.5rem; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--accent2); text-decoration: none; font-size: .85rem; transition: all .18s; }
        .download-btn:hover { border-color: var(--accent); background: #1e1a3a; }

        @media (max-width: 600px) {
          .instrument-grid { grid-template-columns: repeat(2, 1fr); }
          .tabs { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}
