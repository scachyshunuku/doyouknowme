"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabase } from "../../../lib/supabase";
import { computeRoundResult, computeTotals } from "../../../lib/scoring";
import { renderQuestionText } from "../../../lib/template";
import { matchesLabel, pointsLabel } from "../../../lib/format";
import { sessionKey } from "../../../lib/types";
import type { Answer, Game, Player, Question, QuestionPackage } from "../../../lib/types";

export default function GamePage() {
  const params = useParams();
  const code = String(params.code ?? "").toUpperCase();
  const [game, setGame] = useState<Game | null>(null);
  const [gamePackage, setGamePackage] = useState<QuestionPackage | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyStart, setBusyStart] = useState(false);
  const [busySubjectId, setBusySubjectId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Optimistic pick: show the waiting screen the moment an option is tapped,
  // instead of waiting ~1s for the insert round-trip.
  const [pendingPick, setPendingPick] = useState<number | null>(null);
  const autoAdvancedRef = useRef("");

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) { setError("Supabase is not configured."); setLoaded(true); return; }
    const { data: gameData } = await sb.from("games").select("*").eq("code", code).single();
    if (!gameData) { setError("Game not found."); setLoaded(true); return; }
    const g = gameData as Game;
    setGame(g);
    if (g.question_package_id) {
      const { data: pkgData } = await sb.from("question_packages").select("*").eq("id", g.question_package_id).single();
      setGamePackage((pkgData as QuestionPackage) ?? null);
    }
    const { data: playerData } = await sb.from("players").select("*").eq("game_id", g.id).order("joined_at");
    setPlayers((playerData as Player[]) ?? []);
    const { data: gqData } = await sb.from("game_questions").select("question_id, order_index").eq("game_id", g.id).order("order_index");
    const qids = ((gqData as { question_id: string }[]) ?? []).map((x) => x.question_id);
    if (qids.length > 0) {
      const { data: qData } = await sb.from("questions").select("*").in("id", qids);
      const byId = new Map(((qData as Question[]) ?? []).map((q) => [q.id, q]));
      setQuestions(qids.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q)));
    } else {
      setQuestions([]);
    }
    const { data: ansData } = await sb.from("answers").select("*").eq("game_id", g.id);
    setAnswers((ansData as Answer[]) ?? []);
    setLoaded(true);
  }, [code]);

  // Session restore: read the localStorage session for this code. If the
  // stored player still exists in this game, restore them (no new row).
  // If the stored player is gone, clear the session — they must join again.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(sessionKey(code));
      if (raw) {
        const session = JSON.parse(raw) as { player_id?: string };
        if (session.player_id) setMyPlayerId(session.player_id);
      }
    } catch {
      // Corrupt session: ignore it, treat as not joined.
    }
    load();
  }, [code, load]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !game) return;
    const channel = sb
      .channel(`game-${game.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${game.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_id=eq.${game.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "answers", filter: `game_id=eq.${game.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_questions", filter: `game_id=eq.${game.id}` }, load)
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [game?.id, load]);

  const me = players.find((p) => p.id === myPlayerId) ?? null;
  // If a stored session points at a player who is no longer in this game,
  // it is stale: clear it so the user can join again from home.
  useEffect(() => {
    if (loaded && myPlayerId && players.length >= 0 && game && !me) {
      try { localStorage.removeItem(sessionKey(code)); } catch { /* ignore */ }
    }
  }, [loaded, myPlayerId, me, game, code, players.length]);

  const isHost = me?.role === "host" && me.id === game?.host_player_id;
  const currentQuestion = game && questions.length > 0 ? questions[Math.min(game.current_question_index, questions.length - 1)] : null;
  const currentAnswers = currentQuestion ? answers.filter((a) => a.question_id === currentQuestion.id) : [];
  const nonHostPlayers = players.filter((p) => p.role !== "host");
  const submittedIds = new Set(currentAnswers.map((a) => a.player_id));
  const allSubmitted = nonHostPlayers.length > 0 && nonHostPlayers.every((p) => submittedIds.has(p.id));
  const myAnswer = currentQuestion ? currentAnswers.find((a) => a.player_id === myPlayerId) : null;
  const totals = computeTotals(answers, players, game?.subject_player_id ?? null, questions.map((q) => q.id));
  const round = currentQuestion ? computeRoundResult(currentAnswers, players, game?.subject_player_id ?? null) : null;
  const subjectPlayer = players.find((p) => p.id === game?.subject_player_id) ?? null;
  const hostPlayer = players.find((p) => p.id === game?.host_player_id) ?? null;
  // Question text is a template: {subject} and {host} are filled in here.
  const questionText = currentQuestion
    ? renderQuestionText(currentQuestion.text, { subject: subjectPlayer?.name ?? null, host: hostPlayer?.name ?? null })
    : "";
  // Running leaderboard, most points first (subject matches break ties).
  const runningLeaderboard = [...players]
    .filter((p) => p.role !== "host")
    .sort((a, b) => (totals.totalPoints[b.id] ?? 0) - (totals.totalPoints[a.id] ?? 0) || (totals.subjectMatches[b.id] ?? 0) - (totals.subjectMatches[a.id] ?? 0));
  // Results options, most answers first (ties keep the original order).
  const sortedResultOptions = currentQuestion && round
    ? currentQuestion.options
        .map((opt, i) => ({ opt, i, count: round.counts[i] ?? 0 }))
        .sort((a, b) => b.count - a.count || a.i - b.i)
    : [];

  // Auto-advance Question -> Results when every non-host player has submitted.
  useEffect(() => {
    if (!game || game.status !== "question" || !allSubmitted || !isHost || !currentQuestion) return;
    const key = `${game.id}:${currentQuestion.id}`;
    if (autoAdvancedRef.current === key) return;
    autoAdvancedRef.current = key;
    const sb = getSupabase();
    if (sb) void sb.from("games").update({ status: "results" }).eq("id", game.id);
  }, [game, allSubmitted, isHost, currentQuestion]);

  async function copyInvite() {
    const url = `${window.location.origin}/game/${code}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API unavailable (older browsers): fall back to selecting the code.
      const el = document.querySelector(".code");
      if (el) window.getSelection()?.selectAllChildren(el);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function selectSubject(playerId: string) {
    const sb = getSupabase();
    if (!sb || !game || !isHost || game.status !== "lobby") return;
    setBusySubjectId(playerId); setError("");
    const chosen = players.find((p) => p.id === playerId);
    if (!chosen || chosen.role === "host") { setBusySubjectId(null); return setError("Pick a guest to be the subject."); }
    // Demote the old subject first (the partial unique index allows only one),
    // then promote the chosen guest, then point the game at them.
    const { error: demoteErr } = await sb.from("players").update({ role: "guest" }).eq("game_id", game.id).eq("role", "subject");
    if (demoteErr) { setBusySubjectId(null); return setError(demoteErr.message); }
    const { error: promoteErr } = await sb.from("players").update({ role: "subject" }).eq("id", playerId);
    if (promoteErr) { setBusySubjectId(null); return setError(promoteErr.message); }
    const { error: gameErr } = await sb.from("games").update({ subject_player_id: playerId, subject_name: chosen.name }).eq("id", game.id);
    if (gameErr) { setBusySubjectId(null); return setError(gameErr.message); }
    setBusySubjectId(null); await load();
  }

  async function startGame() {
    const sb = getSupabase();
    if (!sb || !game || !isHost || !game.subject_player_id || !game.question_package_id) return;
    setBusyStart(true); setError("");
    if (questions.length === 0) {
      // Copy the package's questions, in defined order, into game_questions.
      const { data: pqData, error: pqErr } = await sb
        .from("package_questions")
        .select("question_id, order_index")
        .eq("question_package_id", game.question_package_id)
        .order("order_index");
      if (pqErr || !pqData || pqData.length === 0) { setBusyStart(false); return setError("This question package has no questions. Seed it in Supabase first."); }
      const rows = (pqData as { question_id: string; order_index: number }[]).map((r) => ({ game_id: game.id, question_id: r.question_id, order_index: r.order_index }));
      const { error: gqErr } = await sb.from("game_questions").insert(rows);
      if (gqErr) { setBusyStart(false); return setError(gqErr.message); }
    }
    await sb.from("games").update({ status: "question", current_question_index: 0 }).eq("id", game.id);
    setBusyStart(false); await load();
  }

  async function submitAnswer(optionIndex: number) {
    const sb = getSupabase();
    if (!sb || !game || !currentQuestion || !me || me.role === "host" || myAnswer) return;
    setPendingPick(optionIndex);
    const { error: e } = await sb.from("answers").insert({ game_id: game.id, question_id: currentQuestion.id, player_id: me.id, option_index: optionIndex });
    if (e) { setPendingPick(null); setError(e.message); } else await load();
  }

  // Clear the optimistic pick when the question changes or the real answer lands.
  useEffect(() => { setPendingPick(null); }, [currentQuestion?.id]);
  useEffect(() => { if (myAnswer) setPendingPick(null); }, [myAnswer]);

  async function showResults() {
    const sb = getSupabase();
    if (!sb || !game || !isHost) return;
    await sb.from("games").update({ status: "results" }).eq("id", game.id);
    await load();
  }

  async function nextQuestion() {
    const sb = getSupabase();
    if (!sb || !game || !isHost) return;
    if (game.current_question_index + 1 >= questions.length) {
      await sb.from("games").update({ status: "finished" }).eq("id", game.id);
    } else {
      await sb.from("games").update({ status: "question", current_question_index: game.current_question_index + 1 }).eq("id", game.id);
    }
    await load();
  }

  if (error && !game) return <main><div className="error">{error}</div><p><a href="/">Back home</a></p></main>;
  if (!game || !loaded) return <main><p>Loading game…</p></main>;

  const leaderboard = [...players].filter((p) => p.role !== "host").sort((a, b) => (totals.totalPoints[b.id] ?? 0) - (totals.totalPoints[a.id] ?? 0));
  const guests = players.filter((p) => p.role === "guest");
  const maxMatches = guests.length > 0 ? Math.max(...guests.map((p) => totals.subjectMatches[p.id] ?? 0)) : 0;
  const mostMatches = guests.filter((p) => (totals.subjectMatches[p.id] ?? 0) === maxMatches && maxMatches > 0);

  return (
    <main className={isHost ? "tv" : "mobile"}>
      <p><a href="/">← Leave game</a></p>
      <div className="code-row">
        <div className="code">{game.code}</div>
        <button className="small secondary" onClick={copyInvite}>{copied ? "Copied ✓" : "Copy invite link"}</button>
      </div>
      <p style={{ textAlign: "center" }}>
        {gamePackage ? `Package: ${gamePackage.name}${gamePackage.category ? ` (${gamePackage.category})` : ""}` : ""} · Subject: {subjectPlayer?.name ?? "not picked yet"} · You: {me ? `${me.name} (${me.role})` : "not joined on this device"}
      </p>
      {questions.length > 0 && game.status !== "lobby" && (
        <div>
          <div className="progress"><div style={{ width: `${Math.round(((game.status === "finished" ? questions.length : game.current_question_index + (game.status === "results" ? 1 : 0)) / questions.length) * 100)}%` }} /></div>
          <p className="progress-label">Question {Math.min(game.current_question_index + 1, questions.length)} of {questions.length}</p>
        </div>
      )}
      {error && <div className="error">{error}</div>}

      <div className="game-layout">
      <div className="game-main">
      <div className="card">
        <h2>Players ({players.length})</h2>
        {players.map((p) => (
          <div className="row" key={p.id}>
            <span>{p.name}<span className="tag">{p.role}</span>{game.status !== "lobby" && <span className="tag">{pointsLabel(totals.totalPoints[p.id] ?? 0)}</span>}</span>
            <span>
              {isHost && game.status === "lobby" && p.role === "guest" && (
                <button className="small" onClick={() => selectSubject(p.id)} disabled={busySubjectId !== null}>{busySubjectId === p.id ? "Picking…" : "Make subject"}</button>
              )}
              {isHost && game.status === "lobby" && p.role === "subject" && <span>★ subject</span>}
            </span>
          </div>
        ))}
        {players.length === 0 && <p>No players yet.</p>}
        {/* In the question stage, do not show who has answered — only the
            submitted count below. The host cannot see any player's answer,
            including the subject's, until Results. */}
      </div>

      {game.status === "lobby" && (
        <div className="card">
          <h2>Lobby</h2>
          {isHost ? (
            <>
              <p>Pick one guest to be the subject, then start. The game cannot start until a subject is picked.</p>
              <div className="action-bar"><button onClick={startGame} disabled={busyStart || !game.subject_player_id || players.length < 2}>{busyStart ? "Starting…" : "Start game"}</button></div>
              {!game.subject_player_id && <p>Pick a subject first — tap “Make subject” next to a guest.</p>}
            </>
          ) : (
            <p>Waiting for the host to pick a subject and start…</p>
          )}
          {!me && <p>Join from the home page with this code to play on this device.</p>}
        </div>
      )}

      {game.status === "question" && currentQuestion && (
        <div className="card">
          <h2>Question {game.current_question_index + 1} of {questions.length}</h2>
          <p className="question-text">{questionText}</p>
          {me?.role === "host" ? (
            <div>
              <p>Shown for the room — these are not buttons and you cannot pick one. You cannot see anyone&apos;s answer until Results.</p>
              <div className="host-options">
                {currentQuestion.options.map((opt, i) => (
                  <div key={i} className="host-option"><span className="opt-letter">{"ABCD"[i]}</span>{opt}</div>
                ))}
              </div>
            </div>
          ) : (myAnswer || pendingPick !== null) ? (
            <div>
              <h2>✓ Answer locked in</h2>
              <div className="my-pick">You picked: {currentQuestion.options[myAnswer ? myAnswer.option_index : (pendingPick as number)]}</div>
              <p>Waiting for everyone else…</p>
              <p>You cannot change your answer.</p>
            </div>
          ) : (
            <div className="options">
              {currentQuestion.options.map((opt, i) => (
                <button key={i} onClick={() => submitAnswer(i)}>{opt}</button>
              ))}
            </div>
          )}
          <p><span className="pill" aria-live="polite">{currentAnswers.length}/{nonHostPlayers.length} answered</span></p>
          {isHost && <div className="action-bar"><button className="secondary" onClick={showResults}>Override to Results</button></div>}
        </div>
      )}

      {game.status === "results" && currentQuestion && round && (
        <div className="card">
          <h2>Results — Question {game.current_question_index + 1}</h2>
          <p className="question-text">{questionText}</p>
          {sortedResultOptions.map(({ opt, i, count: total }) => {
            const pct = currentAnswers.length ? Math.round((total / currentAnswers.length) * 100) : 0;
            const isSubjectPick = round.subjectOption === i;
            return (
              <div key={i} className={isSubjectPick ? "result-option subject-pick" : "result-option"}>
                <div className="row"><span>{isSubjectPick ? "★ " : ""}{opt}{isSubjectPick ? ` — ${subjectPlayer?.name ?? "subject"}'s pick` : ""}{round.majorityOptions.includes(i) ? (round.majorityOptions.length > 1 ? " — tied for majority" : " — majority") : ""}</span><span>{total} ({pct}%)</span></div>
                <div className="bar"><div style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
          <h2>Points this round</h2>
          {players.filter((p) => p.role === "guest").map((p) => {
            const answered = currentAnswers.some((a) => a.player_id === p.id);
            return (
              <div className="row" key={p.id}>
                <span>{p.name}{!answered ? " — did not answer" : ""}</span>
                <span>+{pointsLabel(round.pointsThisRound[p.id] ?? 0)} {answered ? `${round.matchedSubject[p.id] ? "(matched subject +2)" : ""} ${round.matchedMajority[p.id] ? "(majority +1)" : ""}` : "(0 — no vote)"}</span>
              </div>
            );
          })}
          <p>Subject scores 0 points. Host scores 0 points. Players who did not answer get 0 and do not count as a vote.</p>
          {isHost && <div className="action-bar"><button onClick={nextQuestion}>{game.current_question_index + 1 >= questions.length ? "Show final leaderboard" : "Next question"}</button></div>}
          {!isHost && <p>Waiting for the host…</p>}
        </div>
      )}

      {game.status === "finished" && (
        <div className="card">
          <h2>Final leaderboard</h2>
          {leaderboard.map((p, i) => (
            <div className="row" key={p.id}><span>{i + 1}. {p.name}<span className="tag">{p.role}</span></span><span>{pointsLabel(totals.totalPoints[p.id] ?? 0)} · {totals.subjectMatches[p.id] ?? 0} subject matches</span></div>
          ))}
          <h2>Most matches with the subject</h2>
          {mostMatches.length > 0 ? (
            <p><strong>{mostMatches.map((p) => p.name).join(", ")}</strong> matched the subject {maxMatches} time(s) — the most of any guest.</p>
          ) : <p>No guest matches recorded.</p>}
          <p>Subject scores 0 points by design, so they do not appear in the points leaderboard ranking above except for their match count.</p>
        </div>
      )}
      </div>
      {game.status !== "lobby" && (
        <aside className="card leaderboard-side">
          <h2>Leaderboard</h2>
          {runningLeaderboard.map((p, i) => (
            <div className="row" key={p.id}>
              <span>{i + 1}. {p.name}<span className="tag">{p.role}</span>{p.id === game.subject_player_id ? " ★" : ""}</span>
              <span>{pointsLabel(totals.totalPoints[p.id] ?? 0)} · {matchesLabel(totals.subjectMatches[p.id] ?? 0)}</span>
            </div>
          ))}
          {runningLeaderboard.length === 0 && <p>No players yet.</p>}
        </aside>
      )}
      </div>
    </main>
  );
}
