"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "../../../lib/supabase";
import { computeRoundResult, computeTotals } from "../../../lib/scoring";
import { renderQuestionText } from "../../../lib/template";
import { shuffledOptions } from "../../../lib/shuffle";
import {
  CUSTOM_ORDER_START,
  emptyCustomQuestion,
  insertCustomQuestion,
  isCustomQuestionComplete,
  isCustomQuestionEmpty,
} from "../../../lib/custom-questions";
import CustomQuestionForm from "../../../components/CustomQuestionForm";
import { matchesLabel, pointsLabel } from "../../../lib/format";
import { sessionKey } from "../../../lib/types";
import type { Answer, Game, Player, Question } from "../../../lib/types";

export default function GamePage() {
  const params = useParams();
  const code = String(params.code ?? "").toUpperCase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinParam = searchParams.get("join") === "1";
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyStart, setBusyStart] = useState(false);
  const [busySubjectId, setBusySubjectId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [customQ, setCustomQ] = useState(emptyCustomQuestion());
  // Optimistic pick: show the waiting screen the moment an option is tapped,
  // instead of waiting ~1s for the insert round-trip.
  const [pendingPick, setPendingPick] = useState<number | null>(null);
  const autoAdvancedRef = useRef("");
  // True once a load() has finished AFTER the current session was set.
  // The stale-session cleanup below must wait for that: right after joining,
  // myPlayerId is set but players still holds the pre-join list, so an
  // unverified "player not found" would delete the session just saved.
  const sessionVerifiedRef = useRef(false);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) { setError("Supabase is not configured."); setLoaded(true); return; }
    const { data: gameData } = await sb.from("games").select("*").eq("code", code).single();
    if (!gameData) { setError("Game not found."); setLoaded(true); return; }
    const g = gameData as Game;
    setGame(g);
    const { data: playerData } = await sb.from("players").select("*").eq("game_id", g.id).order("joined_at");
    setPlayers((playerData as Player[]) ?? []);
    sessionVerifiedRef.current = true;
    const { data: gqData } = await sb.from("game_questions").select("question_id, order_index").eq("game_id", g.id).eq("skipped", false).order("order_index");
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
  // it is stale: clear it so the user can join again from home. Only decide
  // once a load has finished after the session was set (sessionVerifiedRef),
  // otherwise a fresh join looks exactly like a stale session.
  useEffect(() => {
    if (loaded && myPlayerId && sessionVerifiedRef.current && game && !me) {
      try { localStorage.removeItem(sessionKey(code)); } catch { /* ignore */ }
    }
  }, [loaded, myPlayerId, me, game, code, players.length]);

  const isHost = me?.role === "host" && me.id === game?.host_player_id;
  // Invite links open a join dialog: a visitor with no session for this game
  // enters a name and joins as a guest, instead of landing in the game as a
  // spectator with no way in. Opening your own invite link (?join=1) while
  // already in the game offers Continue or Join as someone else. Plain
  // refreshes (no param) resume silently.
  const showJoin = loaded && !!game && (!me || joinParam);
  const currentQuestion = game && questions.length > 0 ? questions[Math.min(game.current_question_index, questions.length - 1)] : null;
  const currentAnswers = currentQuestion ? answers.filter((a) => a.question_id === currentQuestion.id) : [];
  const nonHostPlayers = players.filter((p) => p.role !== "host");
  const submittedIds = new Set(currentAnswers.map((a) => a.player_id));
  const allSubmitted = nonHostPlayers.length > 0 && nonHostPlayers.every((p) => submittedIds.has(p.id));
  const myAnswer = currentQuestion ? currentAnswers.find((a) => a.player_id === myPlayerId) : null;
  // Points for the current question stay hidden until its Results screen:
  // while a question is being answered, totals count only earlier questions.
  const countedQuestionIds = game?.status === "question" && currentQuestion
    ? questions.map((q) => q.id).filter((id) => id !== currentQuestion.id)
    : questions.map((q) => q.id);
  const totals = computeTotals(answers, players, game?.subject_player_id ?? null, countedQuestionIds);
  const round = currentQuestion ? computeRoundResult(currentAnswers, players, game?.subject_player_id ?? null) : null;
  const subjectPlayer = players.find((p) => p.id === game?.subject_player_id) ?? null;
  const hostPlayer = players.find((p) => p.id === game?.host_player_id) ?? null;
  // Question text is a template: {subject} and {host} are filled in here.
  const questionText = currentQuestion
    ? renderQuestionText(currentQuestion.text, { subject: subjectPlayer?.name ?? null, host: hostPlayer?.name ?? null })
    : "";
  // The 4 options are shuffled per game (seeded by game + question), so
  // every player sees the same order and it survives reloads. Answers are
  // stored as positions in this shown order.
  const displayOptions = game && currentQuestion
    ? shuffledOptions(currentQuestion.options, game.id, currentQuestion.id)
    : [];
  // Running leaderboard, most points first (subject matches break ties).
  const runningLeaderboard = [...players]
    .filter((p) => p.role !== "host" && p.id !== game?.subject_player_id)
    .sort((a, b) => (totals.totalPoints[b.id] ?? 0) - (totals.totalPoints[a.id] ?? 0) || (totals.subjectMatches[b.id] ?? 0) - (totals.subjectMatches[a.id] ?? 0));
  // Results options, most answers first (ties keep the original order).
  const sortedResultOptions = currentQuestion && round
    ? displayOptions
        .map((opt, i) => ({ opt, i, count: round.counts[i] ?? 0 }))
        .sort((a, b) => b.count - a.count || a.i - b.i)
    : [];
  const maxResultCount = sortedResultOptions.length > 0 ? Math.max(...sortedResultOptions.map((o) => o.count)) : 0;

  // Auto-advance Question -> Results when every non-host player has submitted.
  // Any connected client can trigger it (the update is idempotent), so it
  // still fires if the host's live connection is stale. The guard is only
  // kept after a successful update: a failed attempt clears it, so the next
  // load retries instead of stalling the question forever.
  useEffect(() => {
    if (!game || game.status !== "question" || !allSubmitted || !currentQuestion) return;
    const key = `${game.id}:${currentQuestion.id}`;
    if (autoAdvancedRef.current === key) return;
    autoAdvancedRef.current = key;
    const sb = getSupabase();
    if (!sb) { autoAdvancedRef.current = ""; return; }
    void (async () => {
      const { error } = await sb.from("games").update({ status: "results" }).eq("id", game.id);
      if (error) autoAdvancedRef.current = "";
    })();
  }, [game, allSubmitted, currentQuestion]);

  async function copyInvite() {
    const url = `${window.location.origin}/game/${code}?join=1`;
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
    if (!chosen || chosen.role === "host") { setBusySubjectId(null); return setError("Pick a guest to be the star."); }
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
    // Copy the package's questions, in defined order, into game_questions —
    // only the ones not already there. Guests may have added custom questions
    // before Start, so "no questions yet" is not the right check.
    const { data: pqData, error: pqErr } = await sb
      .from("package_questions")
      .select("question_id, order_index")
      .eq("question_package_id", game.question_package_id)
      .order("order_index");
    if (pqErr || !pqData || pqData.length === 0) { setBusyStart(false); return setError("This question package has no questions. Seed it in Supabase first."); }
    const { data: existing } = await sb.from("game_questions").select("question_id").eq("game_id", game.id);
    const existingIds = new Set(((existing as { question_id: string }[]) ?? []).map((r) => r.question_id));
    const rows = (pqData as { question_id: string; order_index: number }[])
      .filter((r) => !existingIds.has(r.question_id))
      .map((r) => ({ game_id: game.id, question_id: r.question_id, order_index: r.order_index }));
    if (rows.length > 0) {
      const { error: gqErr } = await sb.from("game_questions").insert(rows);
      if (gqErr) { setBusyStart(false); return setError(gqErr.message); }
    }
    // Shuffle the guests' custom questions into a random order after the
    // bank: permute their order_index slots among themselves. Two phases
    // (park on 10000+ first) so no two rows ever share a slot mid-swap —
    // (game_id, order_index) is the primary key.
    const { data: customRows } = await sb
      .from("game_questions")
      .select("question_id, order_index")
      .eq("game_id", game.id)
      .gte("order_index", CUSTOM_ORDER_START)
      .order("order_index");
    const customs = (customRows as { question_id: string; order_index: number }[]) ?? [];
    if (customs.length > 1) {
      const slots = customs.map((r) => r.order_index);
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      for (let i = 0; i < customs.length; i++) {
        await sb.from("game_questions").update({ order_index: 10000 + i }).eq("game_id", game.id).eq("question_id", customs[i].question_id);
      }
      for (let i = 0; i < customs.length; i++) {
        if (customs[i].order_index !== slots[i]) {
          await sb.from("game_questions").update({ order_index: slots[i] }).eq("game_id", game.id).eq("question_id", customs[i].question_id);
        }
      }
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

  async function joinGame() {
    const sb = getSupabase();
    if (!sb || !game || !joinName.trim()) return;
    const cleanName = joinName.trim().slice(0, 25);
    setJoinBusy(true); setJoinError("");
    // Optional custom question: all five fields or none of them.
    if (!isCustomQuestionEmpty(customQ) && !isCustomQuestionComplete(customQ)) {
      setJoinBusy(false);
      return setJoinError("Fill in your question and all 4 choices, or leave them blank.");
    }
    if (isCustomQuestionComplete(customQ)) {
      const qErr = await insertCustomQuestion(sb, game.id, customQ);
      if (qErr) { setJoinBusy(false); return setJoinError(qErr); }
    }
    const { data: player, error: e } = await sb.from("players").insert({ game_id: game.id, name: cleanName, role: "guest" }).select().single();
    if (e || !player) { setJoinBusy(false); return setJoinError(e?.message ?? "Could not join game."); }
    try { localStorage.setItem(sessionKey(code), JSON.stringify({ player_id: player.id, game_id: game.id, name: cleanName, role: "guest" })); } catch { /* ignore */ }
    setMyPlayerId(player.id);
    sessionVerifiedRef.current = false;
    setJoinBusy(false);
    router.replace(`/game/${code}`);
    await load();
  }

  function switchPlayer() {
    try { localStorage.removeItem(sessionKey(code)); } catch { /* ignore */ }
    setMyPlayerId(null);
    // showJoin stays true via !me, so the name form appears.
  }

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

  async function skipQuestion() {
    const sb = getSupabase();
    if (!sb || !game || !isHost || !currentQuestion) return;
    // Skip the current question: no points are scored for it. The row is
    // marked skipped (kept, not deleted) and load() filters it out, so the
    // list shrinks by one and the next question slides into this slot — the
    // index stays put. If it was the last question, the game is finished.
    const { error } = await sb.from("game_questions").update({ skipped: true }).eq("game_id", game.id).eq("question_id", currentQuestion.id);
    if (error) return setError(error.message);
    if (game.current_question_index >= questions.length - 1) {
      await sb.from("games").update({ status: "finished" }).eq("id", game.id);
    }
    await load();
  }

  if (error && !game) return <main><div className="error">{error}</div><p><a href="/">Back home</a></p></main>;
  if (!game || !loaded) return <main><p>Loading game…</p></main>;

  const leaderboard = [...players].filter((p) => p.role !== "host" && p.id !== game?.subject_player_id).sort((a, b) => (totals.totalPoints[b.id] ?? 0) - (totals.totalPoints[a.id] ?? 0));
  const matchesLeaderboard = [...players].filter((p) => p.role !== "host" && p.id !== game?.subject_player_id).sort((a, b) => (totals.subjectMatches[b.id] ?? 0) - (totals.subjectMatches[a.id] ?? 0) || (totals.totalPoints[b.id] ?? 0) - (totals.totalPoints[a.id] ?? 0));

  return (
    <main className={isHost ? "tv" : "mobile"}>
      <div className="code-row">
        <div className="code">{game.code}</div>
        <button className="small secondary" onClick={copyInvite}>{copied ? "Copied ✓" : "Copy invite link"}</button>
      </div>
      {questions.length > 0 && game.status !== "lobby" && (
        <div>
          <div className="progress"><div style={{ width: `${Math.round(((game.status === "finished" ? questions.length : game.current_question_index + (game.status === "results" ? 1 : 0)) / questions.length) * 100)}%` }} /></div>
          <p className="progress-label">Question {Math.min(game.current_question_index + 1, questions.length)} of {questions.length}</p>
        </div>
      )}
      {error && <div className="error">{error}</div>}

      {showJoin ? (
        <div className="card">
          <h2>Join game {game.code}</h2>
          {me ? (
            <>
              <p>You&apos;re already in this game as <strong>{me.name}</strong>{me.role === "host" ? " (host)" : ""}.</p>
              <button onClick={() => router.replace(`/game/${code}`)}>Continue as {me.name}</button>
              <button className="secondary" onClick={switchPlayer}>Join as someone else</button>
            </>
          ) : (
            <>
              <p>{players.length} player{players.length === 1 ? "" : "s"} in the lobby.</p>
              <label>Your name</label>
              <input value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="e.g. Sam" maxLength={25} />
              <CustomQuestionForm value={customQ} onChange={setCustomQ} />
              {joinError && <div className="error">{joinError}</div>}
              <button onClick={joinGame} disabled={joinBusy || !joinName.trim()}>{joinBusy ? "Joining…" : "Join game"}</button>
            </>
          )}
        </div>
      ) : (
      <div className={game.status === "question" || game.status === "results" ? "game-layout with-leaderboard" : "game-layout"}>
      <div className="game-main">
      {game.status === "lobby" && (
      <div className="card">
        <h2>Players ({players.length})</h2>
        {players.map((p) => (
          <div className="row player-row" key={p.id}>
            <span className="player-name">{p.name}{p.role === "host" && <span className="tag">host</span>}{p.id === game.subject_player_id && <span className="subject-star" title="Star">★</span>}{game.status !== "lobby" && <span className="tag">{pointsLabel(totals.totalPoints[p.id] ?? 0)}</span>}</span>
            <span>
              {isHost && game.status === "lobby" && p.role === "guest" && (
                <button className="small" onClick={() => selectSubject(p.id)} disabled={busySubjectId !== null}>{busySubjectId === p.id ? "Picking…" : "Make star"}</button>
              )}
            </span>
          </div>
        ))}
        {players.length === 0 && <p>No players yet.</p>}
      </div>
      )}

      {game.status === "lobby" && (
        <div className="card">
          <h2>Lobby</h2>
          {isHost ? (
            <div className="action-bar"><button onClick={startGame} disabled={busyStart || !game.subject_player_id || players.length < 2}>{busyStart ? "Starting…" : "Start game"}</button></div>
          ) : (
            <p>{game.subject_player_id ? "Waiting for the host to start…" : "Waiting for the host to pick a star and start…"}</p>
          )}
        </div>
      )}

      {game.status === "question" && currentQuestion && (
        <div className="card">
          <h2>Question {game.current_question_index + 1} of {questions.length}</h2>
          <p className="question-text">{questionText}</p>
          {me?.role === "host" ? (
            <div>
              <div className="host-options">
                {displayOptions.map((opt, i) => (
                  <div key={i} className="host-option"><span className="opt-letter">{"ABCD"[i]}</span>{opt}</div>
                ))}
              </div>
            </div>
          ) : (myAnswer || pendingPick !== null) ? (
            <div>
              <h2>✓ Answer locked in</h2>
              <div className="my-pick">You picked: {displayOptions[myAnswer ? myAnswer.option_index : (pendingPick as number)]}</div>
              <p>Waiting for everyone else…</p>
            </div>
          ) : (
            <div className="options">
              {displayOptions.map((opt, i) => (
                <button key={i} onClick={() => submitAnswer(i)}>{opt}</button>
              ))}
            </div>
          )}
          <p><span className="pill" aria-live="polite">{currentAnswers.length}/{nonHostPlayers.length} answered</span></p>
          {isHost && <div className="action-bar"><button className="secondary" onClick={showResults}>Reveal results</button><button className="secondary" onClick={skipQuestion}>Skip question</button></div>}
        </div>
      )}

      {game.status === "results" && currentQuestion && round && (
        <div className="card">
          <h2>Results — Question {game.current_question_index + 1}</h2>
          <p className="question-text">{questionText}</p>
          {sortedResultOptions.map(({ opt, i, count: total }) => {
            const pct = currentAnswers.length ? Math.round((total / currentAnswers.length) * 100) : 0;
            const isSubjectPick = round.subjectOption === i;
            const isMyPick = myAnswer?.option_index === i;
            const pickNotes = [
              ...(isSubjectPick ? [`${subjectPlayer?.name ?? "the star"}'s pick`] : []),
              ...(isMyPick ? ["your pick"] : []),
            ];
            return (
              <div key={i} className={`result-option${total > 0 && total === maxResultCount ? " top-pick" : ""}`}>
                <div className="row"><span>{isSubjectPick ? "★ " : ""}{opt}{pickNotes.length ? ` — ${pickNotes.join(" · ")}` : ""}</span><span>{total} ({pct}%)</span></div>
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
                <span>+{pointsLabel(round.pointsThisRound[p.id] ?? 0)}</span>
              </div>
            );
          })}
          {isHost && <div className="action-bar"><button onClick={nextQuestion}>{game.current_question_index + 1 >= questions.length ? "Show final leaderboard" : "Next question"}</button></div>}
          {!isHost && <p>Waiting for the host…</p>}
        </div>
      )}

      {game.status === "finished" && (
        <>
        <div className="card">
          <h2>Final leaderboard</h2>
          <table className="leaderboard-table">
            <thead><tr><th className="rank">#</th><th>Player</th><th className="num">Points</th><th className="num">Matches</th></tr></thead>
            <tbody>
              {leaderboard.map((p, i) => (
                <tr key={p.id}><td className="rank">{i + 1}</td><td className="name">{p.name}{p.id === game.subject_player_id ? " ★" : ""}</td><td className="num">{pointsLabel(totals.totalPoints[p.id] ?? 0)}</td><td className="num">{totals.subjectMatches[p.id] ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Matches with {subjectPlayer?.name ?? "the star"}</h2>
          <table className="leaderboard-table">
            <thead><tr><th className="rank">#</th><th>Player</th><th className="num">Matches</th><th className="num">Points</th></tr></thead>
            <tbody>
              {matchesLeaderboard.map((p, i) => (
                <tr key={p.id}><td className="rank">{i + 1}</td><td className="name">{p.name}{p.id === game.subject_player_id ? " ★" : ""}</td><td className="num">{totals.subjectMatches[p.id] ?? 0}</td><td className="num">{pointsLabel(totals.totalPoints[p.id] ?? 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Answer review</h2>
          {questions.map((q, qi) => {
            const qAnswers = answers.filter((a) => a.question_id === q.id);
            const qRound = computeRoundResult(qAnswers, players, game?.subject_player_id ?? null);
            const qOptions = shuffledOptions(q.options, game.id, q.id);
            const starAnswer = qAnswers.find((a) => a.player_id === game.subject_player_id);
            const starPick = starAnswer ? qOptions[starAnswer.option_index] : null;
            return (
              <div className="review-question" key={q.id}>
                <p className="question-text">Q{qi + 1}. {renderQuestionText(q.text, { subject: subjectPlayer?.name ?? null, host: hostPlayer?.name ?? null })}</p>
                <div className="row"><span>★ {subjectPlayer?.name ?? "the star"}: {starPick ?? "did not answer"}</span></div>
                {players.filter((p) => p.role === "guest").map((p) => {
                  const a = qAnswers.find((x) => x.player_id === p.id);
                  const pick = a ? qOptions[a.option_index] : null;
                  const matchedStar = a !== undefined && qRound.subjectOption !== null && a.option_index === qRound.subjectOption;
                  return (
                    <div className="row" key={p.id}>
                      <span>{p.name}{p.id === myPlayerId ? " (you)" : ""}: {pick ?? "did not answer"}{matchedStar ? " ✓" : ""}</span>
                      <span>+{pointsLabel(qRound.pointsThisRound[p.id] ?? 0)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        </>
      )}
      </div>
      {(game.status === "question" || game.status === "results") && (
        <aside className="card leaderboard-side">
          <h2>Leaderboard</h2>
          {runningLeaderboard.map((p, i) => (
            <div className="row" key={p.id}>
              <span>{i + 1}. {p.name}{p.id === game.subject_player_id ? " ★" : ""}</span>
              <span>{pointsLabel(totals.totalPoints[p.id] ?? 0)} · {matchesLabel(totals.subjectMatches[p.id] ?? 0)}</span>
            </div>
          ))}
          {runningLeaderboard.length === 0 && <p>No players yet.</p>}
        </aside>
      )}
      </div>
      )}
    </main>
  );
}
