"use client";
import { useMemo, useState } from "react";
import { computeRoundResult, computeTotals } from "../../lib/scoring";
import { renderQuestionText } from "../../lib/template";
import { matchesLabel, pointsLabel } from "../../lib/format";
import type { Answer, Player, Question } from "../../lib/types";

// Design playground: preview every view with mock data, no Supabase, no real
// game. Pick a view, a frame size, and a star name, then click around to
// give design feedback. Nothing here writes to the database.

const QUESTIONS: Question[] = [
  { id: "q1", text: "What is {subject}'s favourite colour?", options: ["Red", "Blue", "Green", "Yellow"], created_at: "" },
  { id: "q2", text: "What is {subject}'s favourite animal?", options: ["Dog", "Cat", "Penguin", "Owl"], created_at: "" },
  { id: "q3", text: "What is {subject}'s ideal test day?", options: ["Beach", "Mountains", "City", "Staying home"], created_at: "" },
  { id: "q4", text: "What snack would {subject} pick?", options: ["Chips", "Popcorn", "Fruit", "Chocolate"], created_at: "" },
  { id: "q5", text: "What is {subject}'s favourite season?", options: ["Spring", "Summer", "Autumn", "Winter"], created_at: "" },
];

// Mock answers per question: [star, guest1, guest2] option indexes.
// Q2 is deliberate: the guests agree on Dog (2 votes) while the star
// picked Cat, so the Results view shows the yellow top-pick highlight and
// the gold star-pick star on DIFFERENT options. The other questions
// keep the top choice equal to the star's pick, so both cases are
// previewable in the playground.
const MOCK_PICKS: number[][] = [
  [1, 1, 0],
  [1, 0, 0],
  [0, 0, 2],
  [3, 0, 3],
  [1, 1, 3],
];

type View = "lobby" | "host" | "guest" | "subject" | "results" | "final";

const VIEW_LABELS: [View, string][] = [
  ["lobby", "Lobby"],
  ["host", "Host (TV)"],
  ["guest", "Guest (phone)"],
  ["subject", "Star (phone)"],
  ["results", "Results"],
  ["final", "Final leaderboard"],
];

export default function Playground() {
  const [view, setView] = useState<View>("host");
  const [frame, setFrame] = useState<"tv" | "phone">("tv");
  const [names, setNames] = useState<Record<string, string>>({ host: "Sam", p2: "Alex", g1: "Guest1", g2: "Guest2" });
  const [subjectId, setSubjectId] = useState("p2");
  // The star-name input edits the current star's name only.
  const subjectName = names[subjectId] ?? "Alex";
  const [copied, setCopied] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [guestPicked, setGuestPicked] = useState<number | null>(null);

  const players: Player[] = useMemo(
    () =>
      ["host", "p2", "g1", "g2"].map((id) => ({
        id,
        game_id: "mock",
        name: names[id] ?? id,
        role: id === "host" ? "host" : id === subjectId ? "subject" : "guest",
        joined_at: "",
      })),
    [names, subjectId],
  );

  const question = QUESTIONS[qIndex];
  const questionText = renderQuestionText(question.text, { subject: subjectName, host: "Sam" });

  // Mock answers for every question so far, for running totals.
  const allAnswers: Answer[] = useMemo(() => {
    const out: Answer[] = [];
    for (let qi = 0; qi <= qIndex; qi++) {
      const picks = MOCK_PICKS[qi];
      (["p2", "g1", "g2"] as const).forEach((pid, i) => {
        out.push({ id: `${QUESTIONS[qi].id}-${pid}`, game_id: "mock", question_id: QUESTIONS[qi].id, player_id: pid, option_index: picks[i], created_at: "" });
      });
    }
    return out;
  }, [qIndex]);

  // Points for the current question stay hidden until its Results screen.
  const countedAnswers = view === "results" || view === "final" ? allAnswers : allAnswers.filter((a) => a.question_id !== question.id);
  const totals = computeTotals(countedAnswers, players, subjectId, QUESTIONS.map((q) => q.id));
  const currentAnswers = allAnswers.filter((a) => a.question_id === question.id);
  const round = computeRoundResult(currentAnswers, players, subjectId);
  const sortedOptions = question.options
    .map((opt, i) => ({ opt, i, count: round.counts[i] ?? 0 }))
    .sort((a, b) => b.count - a.count || a.i - b.i);
  const maxCount = Math.max(...sortedOptions.map((o) => o.count));
  const leaderboard = [...players]
    .filter((p) => p.role !== "host" && p.role !== "subject")
    .sort((a, b) => (totals.totalPoints[b.id] ?? 0) - (totals.totalPoints[a.id] ?? 0));
  const guests = players.filter((p) => p.role === "guest");
  const matchesLeaderboard = [...players]
    .filter((p) => p.role !== "host" && p.role !== "subject")
    .sort((a, b) => (totals.subjectMatches[b.id] ?? 0) - (totals.subjectMatches[a.id] ?? 0) || (totals.totalPoints[b.id] ?? 0) - (totals.totalPoints[a.id] ?? 0));

  const isTv = frame === "tv";

  return (
    <main className={isTv ? "tv" : "mobile"}>
      <h1>Playground</h1>
      <p>Mock views of the game — no real game, nothing is saved. Pick a view and a frame, change the star name, and click around.</p>

      <div className="card">
        <label>Star name</label>
        <input value={subjectName} onChange={(e) => setNames((n) => ({ ...n, [subjectId]: e.target.value }))} placeholder="e.g. Alex" />
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
      </div>

      {view === "lobby" && (
        <div className="card">
          <h2>Lobby — code MOCK01</h2>
          <div className="code-row">
            <div className="code">MOCK01</div>
            <button className="small secondary" onClick={() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }}>{copied ? "Copied ✓" : "Copy invite link"}</button>
          </div>
          <p>Star: {subjectName || "Alex"} · You: Sam (host)</p>
          {players.map((p) => (
            <div className="row player-row" key={p.id}>
              <span className="player-name">{p.name}{p.role === "host" && <span className="tag">host</span>}{p.role === "subject" && <span className="subject-star" title="Star">★</span>}</span>
              {p.role === "guest" && <button className="small" onClick={() => setSubjectId(p.id)}>Make star</button>}
            </div>
          ))}
          <div className="action-bar"><button onClick={() => { setQIndex(0); setGuestPicked(null); setView("host"); }}>Start game</button></div>
        </div>
      )}

      {view === "host" && (
        <div className="game-layout with-leaderboard">
          <div className="game-main">
            <div className="card">
              <h2>Question {qIndex + 1} of {QUESTIONS.length}</h2>
              <p className="question-text">{questionText}</p>
              <div className="host-options">
                {question.options.map((opt, i) => (
                  <div key={i} className="host-option"><span className="opt-letter">{"ABCD"[i]}</span>{opt}</div>
                ))}
              </div>
              <p><span className="pill">2/3 answered</span></p>
              <div className="action-bar"><button className="secondary" onClick={() => setView("results")}>Reveal results</button></div>
            </div>
          </div>
          <aside className="card leaderboard-side">
            <h2>Leaderboard</h2>
            {leaderboard.map((p, i) => (
              <div className="row" key={p.id}>
                <span>{i + 1}. {p.name}{p.role === "subject" ? " ★" : ""}</span>
                <span>{pointsLabel(totals.totalPoints[p.id] ?? 0)} · {matchesLabel(totals.subjectMatches[p.id] ?? 0)}</span>
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
              <h2>Standings</h2>
              {leaderboard.map((p, i) => (
                <div className="row" key={p.id}><span>{i + 1}. {p.name}{p.role === "subject" ? " ★" : ""}</span><span>{pointsLabel(totals.totalPoints[p.id] ?? 0)}</span></div>
              ))}
              <button className="secondary" onClick={() => setGuestPicked(null)}>Reset (playground only)</button>
            </div>
          )}
        </div>
      )}

      {view === "results" && (
        <div className="game-layout with-leaderboard">
          <div className="game-main">
            <div className="card">
              <h2>Results — Question {qIndex + 1}</h2>
              <p className="question-text">{questionText}</p>
              {sortedOptions.map(({ opt, i, count: total }) => {
                const pct = currentAnswers.length ? Math.round((total / currentAnswers.length) * 100) : 0;
                const isSubjectPick = round.subjectOption === i;
                return (
                  <div key={i} className={`result-option${total > 0 && total === maxCount ? " top-pick" : ""}`}>
                    <div className="row"><span>{isSubjectPick ? "★ " : ""}{opt}{isSubjectPick ? ` — ${subjectName || "Alex"}'s pick` : ""}</span><span>{total} ({pct}%)</span></div>
                    <div className="bar"><div style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
              <h2>Points this round</h2>
              {guests.map((p) => (
                <div className="row" key={p.id}>
                  <span>{p.name}</span>
                  <span>+{pointsLabel(round.pointsThisRound[p.id] ?? 0)}</span>
                </div>
              ))}
              <div className="action-bar"><button onClick={() => { setGuestPicked(null); if (qIndex + 1 >= QUESTIONS.length) { setView("final"); } else { setQIndex(qIndex + 1); } }}>{qIndex + 1 >= QUESTIONS.length ? "Show final leaderboard" : "Next question"}</button></div>
            </div>
          </div>
          <aside className="card leaderboard-side">
            <h2>Leaderboard</h2>
            {leaderboard.map((p, i) => (
              <div className="row" key={p.id}>
                <span>{i + 1}. {p.name}{p.role === "subject" ? " ★" : ""}</span>
                <span>{pointsLabel(totals.totalPoints[p.id] ?? 0)} · {matchesLabel(totals.subjectMatches[p.id] ?? 0)}</span>
              </div>
            ))}
          </aside>
        </div>
      )}

      {view === "final" && (
        <>
        <div className="card">
          <h2>Final leaderboard</h2>
          <table className="leaderboard-table">
            <thead><tr><th className="rank">#</th><th>Player</th><th className="num">Points</th><th className="num">Matches</th></tr></thead>
            <tbody>
              {leaderboard.map((p, i) => (
                <tr key={p.id}><td className="rank">{i + 1}</td><td>{p.name}{p.role === "subject" ? " ★" : ""}</td><td className="num">{pointsLabel(totals.totalPoints[p.id] ?? 0)}</td><td className="num">{totals.subjectMatches[p.id] ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Matches with {subjectName || "Alex"}</h2>
          <table className="leaderboard-table">
            <thead><tr><th className="rank">#</th><th>Player</th><th className="num">Matches</th><th className="num">Points</th></tr></thead>
            <tbody>
              {matchesLeaderboard.map((p, i) => (
                <tr key={p.id}><td className="rank">{i + 1}</td><td>{p.name}{p.role === "subject" ? " ★" : ""}</td><td className="num">{totals.subjectMatches[p.id] ?? 0}</td><td className="num">{pointsLabel(totals.totalPoints[p.id] ?? 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <p><a href="/">← Back to the real game</a></p>
    </main>
  );
}
