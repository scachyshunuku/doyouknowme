"use client";
import { useMemo, useState } from "react";
import { computeRoundResult, computeTotals } from "../../lib/scoring";
import { renderQuestionText } from "../../lib/template";
import type { Answer, Player, Question } from "../../lib/types";

// Design playground: preview every view with mock data, no Supabase, no real
// game. Pick a view, a frame size, and a subject name, then click around to
// give design feedback. Nothing here writes to the database.

const QUESTIONS: Question[] = [
  { id: "q1", text: "What is {subject}'s favourite colour?", options: ["Red", "Blue", "Green", "Yellow"], created_at: "" },
  { id: "q2", text: "What is {subject}'s favourite animal?", options: ["Dog", "Cat", "Penguin", "Owl"], created_at: "" },
  { id: "q3", text: "What is {subject}'s ideal test day?", options: ["Beach", "Mountains", "City", "Staying home"], created_at: "" },
  { id: "q4", text: "What snack would {subject} pick?", options: ["Chips", "Popcorn", "Fruit", "Chocolate"], created_at: "" },
  { id: "q5", text: "What is {subject}'s favourite season?", options: ["Spring", "Summer", "Autumn", "Winter"], created_at: "" },
];

// Mock answers per question: [subject, guest1, guest2] option indexes.
const MOCK_PICKS: number[][] = [
  [1, 1, 0],
  [1, 0, 1],
  [0, 0, 2],
  [3, 0, 3],
  [1, 1, 3],
];

type View = "lobby" | "host" | "guest" | "subject" | "results" | "final";

const VIEW_LABELS: [View, string][] = [
  ["lobby", "Lobby"],
  ["host", "Host (TV)"],
  ["guest", "Guest (phone)"],
  ["subject", "Subject (phone)"],
  ["results", "Results"],
  ["final", "Final leaderboard"],
];

export default function Playground() {
  const [view, setView] = useState<View>("host");
  const [frame, setFrame] = useState<"tv" | "phone">("tv");
  const [subjectName, setSubjectName] = useState("Alex");
  const [qIndex, setQIndex] = useState(0);
  const [guestPicked, setGuestPicked] = useState<number | null>(null);

  const players: Player[] = useMemo(
    () => [
      { id: "host", game_id: "mock", name: "Sam", role: "host", joined_at: "" },
      { id: "subject", game_id: "mock", name: subjectName || "Alex", role: "subject", joined_at: "" },
      { id: "g1", game_id: "mock", name: "Guest1", role: "guest", joined_at: "" },
      { id: "g2", game_id: "mock", name: "Guest2", role: "guest", joined_at: "" },
    ],
    [subjectName],
  );

  const question = QUESTIONS[qIndex];
  const questionText = renderQuestionText(question.text, { subject: subjectName, host: "Sam" });

  // Mock answers for every question so far, for running totals.
  const allAnswers: Answer[] = useMemo(() => {
    const out: Answer[] = [];
    for (let qi = 0; qi <= qIndex; qi++) {
      const picks = MOCK_PICKS[qi];
      (["subject", "g1", "g2"] as const).forEach((pid, i) => {
        out.push({ id: `${QUESTIONS[qi].id}-${pid}`, game_id: "mock", question_id: QUESTIONS[qi].id, player_id: pid, option_index: picks[i], created_at: "" });
      });
    }
    return out;
  }, [qIndex]);

  const totals = computeTotals(allAnswers, players, "subject", QUESTIONS.map((q) => q.id));
  const currentAnswers = allAnswers.filter((a) => a.question_id === question.id);
  const round = computeRoundResult(currentAnswers, players, "subject");
  const sortedOptions = question.options
    .map((opt, i) => ({ opt, i, count: round.counts[i] ?? 0 }))
    .sort((a, b) => b.count - a.count || a.i - b.i);
  const leaderboard = [...players]
    .filter((p) => p.role !== "host")
    .sort((a, b) => (totals.totalPoints[b.id] ?? 0) - (totals.totalPoints[a.id] ?? 0));
  const guests = players.filter((p) => p.role === "guest");
  const maxMatches = Math.max(...guests.map((p) => totals.subjectMatches[p.id] ?? 0));
  const mostMatches = guests.filter((p) => (totals.subjectMatches[p.id] ?? 0) === maxMatches);

  const isTv = frame === "tv";

  return (
    <main className={isTv ? "tv" : "mobile"}>
      <h1>Playground</h1>
      <p>Mock views of the game — no real game, nothing is saved. Pick a view and a frame, change the subject name, and click around.</p>

      <div className="card">
        <label>Subject name</label>
        <input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="e.g. Alex" />
        <label>Question</label>
        <select value={qIndex} onChange={(e) => { setQIndex(Number(e.target.value)); setGuestPicked(null); }}>
          {QUESTIONS.map((q, i) => (
            <option key={q.id} value={i}>Q{i + 1}: {renderQuestionText(q.text, { subject: subjectName || "Alex" })}</option>
          ))}
        </select>
        <label>Frame</label>
        <div>
          <button className={isTv ? "small active" : "small"} onClick={() => setFrame("tv")}>TV / computer</button>
          <button className={!isTv ? "small active" : "small"} onClick={() => setFrame("phone")}>Phone</button>
        </div>
        <p>Frame: {isTv ? "TV / computer (wide)" : "Phone (narrow)"} · View: {VIEW_LABELS.find(([v]) => v === view)?.[1]}</p>
      </div>

      <div>
        {VIEW_LABELS.map(([v, label]) => (
          <button key={v} className={view === v ? "small active" : "small"} onClick={() => { setView(v); setGuestPicked(null); }}>{label}</button>
        ))}
      </div>

      <div>
        <div className="progress"><div style={{ width: `${Math.round(((view === "final" ? QUESTIONS.length : qIndex + (view === "results" ? 1 : 0)) / QUESTIONS.length) * 100)}%` }} /></div>
        <p className="progress-label">Question {qIndex + 1} of {QUESTIONS.length}</p>
      </div>

      {view === "lobby" && (
        <div className="card">
          <h2>Lobby — code MOCK01</h2>
          <div className="code-row">
            <div className="code">MOCK01</div>
            <button className="small secondary">Copy invite link</button>
          </div>
          <p>Package: Test Package (Test) · Subject: {subjectName || "Alex"} · You: Sam (host)</p>
          {players.map((p) => (
            <div className="row" key={p.id}>
              <span>{p.name}<span className="tag">{p.role}</span>{p.role === "subject" ? " ★ subject" : ""}</span>
              {p.role === "guest" && <button className="small">Make subject</button>}
            </div>
          ))}
          <div className="action-bar"><button>Start game</button></div>
        </div>
      )}

      {view === "host" && (
        <div className="game-layout">
          <div className="game-main">
            <div className="card">
              <h2>Question {qIndex + 1} of {QUESTIONS.length}</h2>
              <p className="question-text">{questionText}</p>
              <p>The host does nothing here. You cannot see anyone&apos;s answer until Results. You can override to Results at any time.</p>
              <div className="host-options">
                {question.options.map((opt, i) => (
                  <div key={i} className="host-option"><span className="opt-letter">{"ABCD"[i]}</span>{opt}</div>
                ))}
              </div>
              <p><span className="pill">2/3 answered</span></p>
              <div className="action-bar"><button className="secondary" onClick={() => setView("results")}>Override to Results</button></div>
            </div>
          </div>
          <aside className="card leaderboard-side">
            <h2>Leaderboard</h2>
            {leaderboard.map((p, i) => (
              <div className="row" key={p.id}>
                <span>{i + 1}. {p.name}<span className="tag">{p.role}</span>{p.role === "subject" ? " ★" : ""}</span>
                <span>{totals.totalPoints[p.id] ?? 0} pts · {totals.subjectMatches[p.id] ?? 0} matches</span>
              </div>
            ))}
          </aside>
        </div>
      )}

      {(view === "guest" || view === "subject") && (
        <div className="card">
          <h2>Question {qIndex + 1} of {QUESTIONS.length}</h2>
          <p className="question-text">{questionText}</p>
          {guestPicked === null ? (
            <div className="options">
              {question.options.map((opt, i) => (
                <button key={i} onClick={() => setGuestPicked(i)}>{opt}</button>
              ))}
            </div>
          ) : (
            <div>
              <h2>✓ Answer locked in</h2>
              <div className="my-pick">You picked: {question.options[guestPicked]}</div>
              <p>Waiting for everyone else…</p>
              <p>You cannot change your answer.</p>
              <button className="secondary" onClick={() => setGuestPicked(null)}>Reset (playground only)</button>
            </div>
          )}
          <p>{view === "subject" ? "You are the subject. You score 0 points." : "You are a guest. Match the subject +2, match the majority +1."}</p>
        </div>
      )}

      {view === "results" && (
        <div className="game-layout">
          <div className="game-main">
            <div className="card">
              <h2>Results — Question {qIndex + 1}</h2>
              <p className="question-text">{questionText}</p>
              {sortedOptions.map(({ opt, i, count: total }) => {
                const pct = currentAnswers.length ? Math.round((total / currentAnswers.length) * 100) : 0;
                const isSubjectPick = round.subjectOption === i;
                return (
                  <div key={i} className={isSubjectPick ? "result-option subject-pick" : "result-option"}>
                    <div className="row"><span>{isSubjectPick ? "★ " : ""}{opt}{isSubjectPick ? ` — ${subjectName || "Alex"}'s pick` : ""}{round.majorityOptions.includes(i) ? " — majority" : ""}</span><span>{total} ({pct}%)</span></div>
                    <div className="bar"><div style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
              <h2>Points this round</h2>
              {guests.map((p) => (
                <div className="row" key={p.id}>
                  <span>{p.name}</span>
                  <span>+{round.pointsThisRound[p.id] ?? 0} pts {round.matchedSubject[p.id] ? "(matched subject +2)" : ""} {round.matchedMajority[p.id] ? "(majority +1)" : ""}</span>
                </div>
              ))}
              <p>Subject scores 0 points. Host scores 0 points.</p>
              <div className="action-bar"><button onClick={() => { setQIndex((qIndex + 1) % QUESTIONS.length); setGuestPicked(null); }}>Next question</button></div>
            </div>
          </div>
          <aside className="card leaderboard-side">
            <h2>Leaderboard</h2>
            {leaderboard.map((p, i) => (
              <div className="row" key={p.id}>
                <span>{i + 1}. {p.name}<span className="tag">{p.role}</span>{p.role === "subject" ? " ★" : ""}</span>
                <span>{totals.totalPoints[p.id] ?? 0} pts · {totals.subjectMatches[p.id] ?? 0} matches</span>
              </div>
            ))}
          </aside>
        </div>
      )}

      {view === "final" && (
        <div className="card">
          <h2>Final leaderboard</h2>
          {leaderboard.map((p, i) => (
            <div className="row" key={p.id}><span>{i + 1}. {p.name}<span className="tag">{p.role}</span></span><span>{totals.totalPoints[p.id] ?? 0} pts · {totals.subjectMatches[p.id] ?? 0} subject matches</span></div>
          ))}
          <h2>Most matches with the subject</h2>
          <p><strong>{mostMatches.map((p) => p.name).join(", ")}</strong> matched the subject {maxMatches} time(s) — the most of any guest.</p>
        </div>
      )}

      <p><a href="/">← Back to the real game</a></p>
    </main>
  );
}
