"use client";
import { useMemo, useState } from "react";
import { computeRoundResult, computeTotals } from "../../lib/scoring";
import { renderQuestionText } from "../../lib/template";
import { shuffledOptions } from "../../lib/shuffle";
import { pointsLabel } from "../../lib/format";
import { leaderboardPlayers, sortByMatches, sortByPoints } from "../../lib/leaderboard";
import CustomQuestionForm from "../../components/CustomQuestionForm";
import ExpandableText from "../../components/ExpandableText";
import { emptyCustomQuestion, hasDuplicateChoices, isCustomQuestionComplete } from "../../lib/custom-questions";
import type { Answer, GameQuestion, Player } from "../../lib/types";

// Design playground: preview every view with mock data, no Supabase, no real
// game. Pick a view, a frame size, and a star name, then click around to
// give design feedback. Nothing here writes to the database.

const QUESTIONS: GameQuestion[] = [
  { id: "q1", game_id: "mock", text: "What is {subject}'s favourite colour?", options: ["Red", "Blue", "Green", "Yellow"], order_index: 0, is_custom: false, skipped: false, created_by_player_id: null },
  { id: "q2", game_id: "mock", text: "What is {subject}'s favourite animal?", options: ["Dog", "Cat", "Penguin", "Owl"], order_index: 1, is_custom: false, skipped: false, created_by_player_id: null },
  // Long-text preview: a near-max question (~280 chars) with near-max
  // options (~140 chars each), so the long-text UI (smaller fonts,
  // single-column host options, tap-to-expand on Results/review) is
  // previewable here instead of only in a live game.
  { id: "q3", game_id: "mock", text: "Imagine {subject} is planning a surprise weekend trip for the whole group and can only pick one destination — which place would they choose if they wanted somewhere with great food, a beach nearby, and a city they have never visited before?", options: ["A quiet coastal town in Portugal with tiny seafood restaurants, long sandy beaches, and a historic old town to wander through in the evenings", "A busy city in Japan with incredible ramen shops on every corner, late-night markets, and day trips to hot springs in the mountains", "A mountain lodge in the Swiss Alps with cheese fondue every night, hiking trails right outside the door, and a lake for swimming in summer", "A tropical island in Thailand with street food stalls, snorkelling off white-sand beaches, and a night market full of handmade souvenirs"], order_index: 2, is_custom: false, skipped: false, created_by_player_id: null },
  { id: "q4", game_id: "mock", text: "What snack would {subject} pick?", options: ["Chips", "Popcorn", "Fruit", "Chocolate"], order_index: 3, is_custom: false, skipped: false, created_by_player_id: null },
  { id: "q5", game_id: "mock", text: "What is {subject}'s favourite season?", options: ["Spring", "Summer", "Autumn", "Winter"], order_index: 4, is_custom: false, skipped: false, created_by_player_id: null },
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

type View = "lobby" | "contribute" | "host" | "guest" | "subject" | "results" | "final";

const VIEW_LABELS: [View, string][] = [
  ["lobby", "Lobby"],
  ["contribute", "Add questions"],
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
  // Mock skipped questions (host Skip): excluded from totals and the review.
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  // Mock contribution wizard: 2 slots, optional (Skip allowed).
  const [contribSlot, setContribSlot] = useState(0);
  const [contribDone, setContribDone] = useState(false);
  const [contribQ, setContribQ] = useState(emptyCustomQuestion());
  const [contribError, setContribError] = useState("");
  // Mock "Add more questions" (Task 32): the host adds questions after the
  // game finished; they append after the mock bank, and "Play these
  // questions" jumps to the first one in the host view.
  const [addingMore, setAddingMore] = useState(false);
  const [addQ, setAddQ] = useState(emptyCustomQuestion());
  const [addError, setAddError] = useState("");
  const [addedMore, setAddedMore] = useState<GameQuestion[]>([]);
  const playQuestions = useMemo(() => [...QUESTIONS, ...addedMore], [addedMore]);
  function submitAddMore() {
    if (!isCustomQuestionComplete(addQ)) return setAddError("Fill in the question and all 4 choices.");
    if (hasDuplicateChoices(addQ)) return setAddError("Two choices are the same — make each choice different.");
    setAddError("");
    setAddedMore((prev) => [...prev, { id: `added-${prev.length}`, game_id: "playground", text: addQ.question.trim(), options: addQ.choices.map((c) => c.trim()) as [string, string, string, string], order_index: QUESTIONS.length + prev.length, is_custom: true, skipped: false, created_by_player_id: null }]);
    setAddQ(emptyCustomQuestion());
  }
  // The mock wizard mirrors the real one: a question is only accepted when
  // it is complete and no two choices are the same.
  function submitContrib() {
    if (!isCustomQuestionComplete(contribQ)) return setContribError("Fill in the question and all 4 choices.");
    if (hasDuplicateChoices(contribQ)) return setContribError("Two choices are the same — make each choice different.");
    setContribError("");
    setContribQ(emptyCustomQuestion());
    if (contribSlot + 1 >= CONTRIB_LIMIT) { setContribDone(true); } else { setContribSlot(contribSlot + 1); }
  }
  const CONTRIB_LIMIT = 2;
  // Mock lobby setup (mirrors the real Game setup card).
  const [setupPackageId, setSetupPackageId] = useState<string | null>("mock-pkg");
  const [setupLimit, setSetupLimit] = useState(2);
  const [setupRequired, setSetupRequired] = useState(false);
  const setupCustomOnly = setupPackageId === null;

  const players: Player[] = useMemo(
    () =>
      ["host", "p2", "g1", "g2"].map((id) => ({
        id,
        game_id: "mock",
        name: names[id] ?? id,
        role: id === "host" ? "host" : id === subjectId ? "subject" : "guest",
        contribution_done: false,
        joined_at: "",
      })),
    [names, subjectId],
  );

  const question = playQuestions[qIndex];
  const questionText = renderQuestionText(question.text, { subject: subjectName, host: "Sam" });
  // Same shuffle as the real game (fixed "playground" game id, so the mock
  // order is stable). Q2's mock picks still land on Dog/Cat in this order.
  const displayOptions = shuffledOptions(question.options, "playground", question.id);
  // Long-text UI (mirrors the real cards): smaller fonts for a long
  // question, smaller + single-column options when any option is long.
  const longQuestion = questionText.length > 150;
  const longOptions = displayOptions.some((o) => o.length > 100);

  // Mock answers for every question so far, for running totals.
  const allAnswers: Answer[] = useMemo(() => {
    const out: Answer[] = [];
    for (let qi = 0; qi <= qIndex; qi++) {
      const picks = MOCK_PICKS[qi];
      (["p2", "g1", "g2"] as const).forEach((pid, i) => {
        out.push({ id: `${QUESTIONS[qi].id}-${pid}`, game_id: "mock", game_question_id: QUESTIONS[qi].id, player_id: pid, option_index: picks[i], created_at: "" });
      });
    }
    return out;
  }, [qIndex]);

  // Points for the current question stay hidden until its Results screen.
  const countedAnswers = (view === "results" || view === "final" ? allAnswers : allAnswers.filter((a) => a.game_question_id !== question.id))
    .filter((a) => !skippedIds.includes(a.game_question_id));
  const totals = computeTotals(countedAnswers, players, subjectId, QUESTIONS.filter((q) => !skippedIds.includes(q.id)).map((q) => q.id));
  const currentAnswers = allAnswers.filter((a) => a.game_question_id === question.id);
  const round = computeRoundResult(currentAnswers, players, subjectId);
  const sortedOptions = displayOptions
    .map((opt, i) => ({ opt, i, count: round.counts[i] ?? 0 }))
    .sort((a, b) => b.count - a.count || a.i - b.i);
  const maxCount = Math.max(...sortedOptions.map((o) => o.count));
  const leaderboard = sortByPoints(leaderboardPlayers(players, "host", subjectId), totals);
  const guests = players.filter((p) => p.role === "guest");
  const matchesLeaderboard = sortByMatches(leaderboardPlayers(players, "host", subjectId), totals);

  const isTv = frame === "tv";

  return (
    <main className={isTv ? "tv" : "mobile"}>
      <h1>Playground</h1>
      <p>Mock views of the game — no real game, nothing is saved. Pick a view and a frame, change the star name, and click around.</p>

      <div className="card">
        <label>Star name</label>
        <input value={subjectName} onChange={(e) => setNames((n) => ({ ...n, [subjectId]: e.target.value }))} placeholder="e.g. Alex" maxLength={25} />
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
        </div>
      )}

      {view === "lobby" && (
        <div className="card">
          <h2>Game setup</h2>
          <div className="field">
            <label>Question bank</label>
            <div className="bank-list" role="radiogroup" aria-label="Question bank">
              <button type="button" role="radio" aria-checked={setupCustomOnly} className={setupCustomOnly ? "bank-row active" : "bank-row"} onClick={() => setSetupPackageId(null)}><span>Custom only</span></button>
              <button type="button" role="radio" aria-checked={setupPackageId === "mock-pkg"} className={setupPackageId === "mock-pkg" ? "bank-row active" : "bank-row"} onClick={() => setSetupPackageId("mock-pkg")}><span>Get to Know Me — General</span><span className="count">10 questions</span></button>
              <button type="button" role="radio" aria-checked={setupPackageId === "mock-test"} className={setupPackageId === "mock-test" ? "bank-row active" : "bank-row"} onClick={() => setSetupPackageId("mock-test")}><span>Test Package — Test</span><span className="count">5 questions</span></button>
            </div>
          </div>
          <div className="field">
            <label>Custom questions</label>
            <div className="setup-row">
              <span>Per guest</span>
              <span className="stepper">
                <button type="button" aria-label="Fewer custom questions per guest" disabled={setupLimit === 0} onClick={() => { const n = setupLimit - 1; setSetupLimit(n); if (n === 0) setSetupRequired(false); }}>−</button>
                <span className="stepper-value">{setupLimit}</span>
                <button type="button" aria-label="More custom questions per guest" disabled={setupLimit === 10} onClick={() => setSetupLimit(setupLimit + 1)}>+</button>
              </span>
            </div>
            <div className="switch-row">
              <span>Require each guest to add their questions</span>
              <button type="button" role="switch" aria-checked={setupRequired} aria-label="Require each guest to add their questions" disabled={setupLimit === 0} className={setupRequired ? "switch on" : "switch"} onClick={() => setSetupRequired(!setupRequired)}>
                <span className="knob" />
              </button>
            </div>
          </div>
          {setupLimit > 0 && (
            <p>Guests add {setupLimit} question{setupLimit === 1 ? "" : "s"} each{setupRequired ? " (required)" : ""} before the game starts.</p>
          )}
        </div>
      )}

      {view === "lobby" && (
        <div className="card">
          <h2>Lobby</h2>
          <div className="action-bar"><button onClick={() => { setQIndex(0); setGuestPicked(null); setView("host"); }}>Start game</button></div>
        </div>
      )}

      {view === "contribute" && (
        <>
          <div className="card">
            {contribDone ? (
              <>
                <h2>✓ You&apos;re done</h2>
                <p>Waiting for everyone else to finish adding questions — 2 of 3 done.</p>
                <button className="secondary" onClick={() => { setContribSlot(0); setContribDone(false); }}>Reset the mock wizard</button>
              </>
            ) : (
              <>
                <h2>Add your questions</h2>
                <CustomQuestionForm label={`Question ${contribSlot + 1} of ${CONTRIB_LIMIT}`} value={contribQ} onChange={setContribQ} starName={subjectName || null} />
                {contribError && <p className="error">{contribError}</p>}
                <div className="action-bar">
                  <button onClick={submitContrib}>{contribSlot + 1 >= CONTRIB_LIMIT ? "Complete" : "Next question"}</button>
                  <button className="secondary" onClick={() => { setContribError(""); setContribQ(emptyCustomQuestion()); if (contribSlot + 1 >= CONTRIB_LIMIT) { setContribDone(true); } else { setContribSlot(contribSlot + 1); } }}>Skip</button>
                </div>
              </>
            )}
          </div>
          <div className="card">
            <h2>Adding questions… (what the host sees)</h2>
            <p>Waiting for everyone to add their questions — 2 of 3 done.</p>
            <div className="row"><span>Alex ★</span><span>✓ Done</span></div>
            <div className="row"><span>Guest1</span><span>✓ Done</span></div>
            <div className="row"><span>Guest2</span><span className="muted">Adding…</span></div>
            <div className="action-bar"><button className="secondary">Start now</button></div>
          </div>
        </>
      )}

      {view === "host" && (
        <div className="game-layout with-leaderboard">
          <div className="game-main">
            <div className="card">
              <h2>Question {qIndex + 1} of {QUESTIONS.length}</h2>
              <p className={longQuestion ? "question-text long" : "question-text"}>{questionText}</p>
              <div className={longOptions ? "host-options long-options" : "host-options"}>
                {displayOptions.map((opt, i) => (
                  <div key={i} className="host-option"><span className="opt-letter">{"ABCD"[i]}</span><span className="opt-text">{opt}</span></div>
                ))}
              </div>
              <p><span className="pill">2/3 answered</span></p>
              <div className="action-bar"><button className="secondary" onClick={() => setView("results")}>Reveal results</button><button className="secondary" onClick={() => { setSkippedIds((s) => [...s, question.id]); setGuestPicked(null); if (qIndex + 1 >= QUESTIONS.length) { setView("final"); } else { setQIndex(qIndex + 1); } }}>Skip question</button></div>
            </div>
          </div>
          <aside className="card leaderboard-side">
            <h2>Leaderboard</h2>
            <table className="leaderboard-table">
              <thead><tr><th className="rank">Rank</th><th>Player</th><th className="num">Points</th></tr></thead>
              <tbody>
                {leaderboard.map((p, i) => (
                  <tr key={p.id}>
                    <td className="rank">{i + 1}</td>
                    <td className="name">{p.name}{p.role === "subject" ? " ★" : ""}</td>
                    <td className="num">{totals.totalPoints[p.id] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </aside>
        </div>
      )}

      {(view === "guest" || view === "subject") && (
        <div className="card">
          <h2>Question {qIndex + 1} of {QUESTIONS.length}</h2>
          <p className={longQuestion ? "question-text long" : "question-text"}>{questionText}</p>
          {guestPicked === null ? (
            <div className={longOptions ? "options long-options" : "options"}>
              {displayOptions.map((opt, i) => (
                <button key={i} onClick={() => setGuestPicked(i)}><span className="opt-letter">{"ABCD"[i]}</span><span className="opt-text">{opt}</span></button>
              ))}
            </div>
          ) : (
            <div>
              <h2>✓ Answer locked in</h2>
              <div className={longOptions ? "my-pick long" : "my-pick"}><span className="opt-letter">{"ABCD"[guestPicked]}</span><span className="opt-text">You picked: {displayOptions[guestPicked]}</span></div>
              <p>Waiting for everyone else…</p>
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
              <p className={longQuestion ? "question-text long" : "question-text"}>{questionText}</p>
              {sortedOptions.map(({ opt, i, count: total }) => {
                const pct = currentAnswers.length ? Math.round((total / currentAnswers.length) * 100) : 0;
                const isSubjectPick = round.subjectOption === i;
                const isMyPick = guestPicked === i;
                const pickNotes = [
                  ...(isSubjectPick ? [`${subjectName || "Alex"}'s pick`] : []),
                  ...(isMyPick ? ["your pick"] : []),
                ];
                return (
                  <div key={i} className={`result-option${total > 0 && total === maxCount ? " top-pick" : ""}`}>
                    <div className="row"><span>{isSubjectPick ? "★ " : ""}<ExpandableText text={opt} />{pickNotes.length ? ` — ${pickNotes.join(" · ")}` : ""}</span><span>{total} ({pct}%)</span></div>
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
            <table className="leaderboard-table">
              <thead><tr><th className="rank">Rank</th><th>Player</th><th className="num">Points</th></tr></thead>
              <tbody>
                {leaderboard.map((p, i) => (
                  <tr key={p.id}>
                    <td className="rank">{i + 1}</td>
                    <td className="name">{p.name}{p.role === "subject" ? " ★" : ""}</td>
                    <td className="num">{totals.totalPoints[p.id] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </aside>
        </div>
      )}

      {view === "final" && (
        <>
        <div className="card">
          <h2>Final leaderboard</h2>
          <table className="leaderboard-table">
            <thead><tr><th className="rank">#</th><th>Player</th><th className="num">Points</th></tr></thead>
            <tbody>
              {leaderboard.map((p, i) => (
                <tr key={p.id}><td className="rank">{i + 1}</td><td className="name">{p.name}{p.role === "subject" ? " ★" : ""}</td><td className="num">{totals.totalPoints[p.id] ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Matches with {subjectName || "Alex"}</h2>
          <table className="leaderboard-table">
            <thead><tr><th className="rank">#</th><th>Player</th><th className="num">Matches</th></tr></thead>
            <tbody>
              {matchesLeaderboard.map((p, i) => (
                <tr key={p.id}><td className="rank">{i + 1}</td><td className="name">{p.name}{p.role === "subject" ? " ★" : ""}</td><td className="num">{totals.subjectMatches[p.id] ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Answer review</h2>
          {QUESTIONS.map((q, qi) => {
            const qAnswers = allAnswers.filter((a) => a.game_question_id === q.id);
            const qRound = computeRoundResult(qAnswers, players, subjectId);
            const qOptions = shuffledOptions(q.options, "playground", q.id);
            const starAnswer = qAnswers.find((a) => a.player_id === subjectId);
            const starPick = starAnswer ? qOptions[starAnswer.option_index] : null;
            const isSkipped = skippedIds.includes(q.id);
            const reviewText = renderQuestionText(q.text, { subject: subjectName, host: "Sam" });
            return (
              <div className="review-question" key={q.id}>
                <p className={reviewText.length > 150 ? "question-text long" : "question-text"}>Q{qi + 1}. {reviewText}{isSkipped ? " — Skipped" : ""}</p>
                <div className="review-row">
                  <span className="review-name">{subjectName || "Alex"} ★</span>
                  <span className="review-answer">{starPick ? <ExpandableText text={starPick} /> : "did not answer"}</span>
                  <span className="review-points" />
                </div>
                {guests.map((p) => {
                  const a = qAnswers.find((x) => x.player_id === p.id);
                  const pick = a ? qOptions[a.option_index] : null;
                  const matchedStar = !isSkipped && a !== undefined && qRound.subjectOption !== null && a.option_index === qRound.subjectOption;
                  return (
                    <div className="review-row" key={p.id}>
                      <span className="review-name">{p.name}</span>
                      <span className="review-answer">{pick ? <ExpandableText text={pick} /> : "did not answer"}{matchedStar ? " ✓" : ""}</span>
                      <span className="review-points">+{pointsLabel(isSkipped ? 0 : (qRound.pointsThisRound[p.id] ?? 0))}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="action-bar">
          <button className="secondary" onClick={() => { setAddingMore((v) => !v); setAddError(""); }}>{addingMore ? "Back to results" : "Add more questions"}</button>
          <button onClick={() => { setView("lobby"); setQIndex(0); setSubjectId(""); setSkippedIds([]); setGuestPicked(null); setContribSlot(0); setContribDone(false); setContribQ(emptyCustomQuestion()); setAddingMore(false); setAddedMore([]); setAddQ(emptyCustomQuestion()); }}>Play again</button>
        </div>
        {addingMore && (
          <div className="card">
            <h2>Add more questions</h2>
            <p>These play after everything above — the game picks up where it left off, with the new questions added to the end.</p>
            {addedMore.length > 0 && (
              <>
                <p>Added so far:</p>
                {addedMore.map((q, i) => (
                  <div className="row" key={q.id}><span>{i + 1}. {q.text}</span></div>
                ))}
              </>
            )}
            <CustomQuestionForm label={`Question ${addedMore.length + 1}`} value={addQ} onChange={setAddQ} starName={subjectName || null} />
            {addError && <p className="error">{addError}</p>}
            <div className="action-bar">
              <button onClick={submitAddMore}>Add question</button>
              <button onClick={() => { setQIndex(QUESTIONS.length); setGuestPicked(null); setView("host"); }} disabled={addedMore.length === 0}>Play these questions{addedMore.length > 0 ? ` (${addedMore.length})` : ""}</button>
            </div>
          </div>
        )}
        </>
      )}

      <p><a href="/">← Back to the real game</a></p>
    </main>
  );
}
