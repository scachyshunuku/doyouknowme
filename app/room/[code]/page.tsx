"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabase } from "../../../lib/supabase";
import { computeRoundResult, computeTotals } from "../../../lib/scoring";
import type { Answer, Player, Question, Room } from "../../../lib/types";

export default function RoomPage() {
  const params = useParams();
  const code = String(params.code ?? "").toUpperCase();
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const autoAdvancedRef = useRef("");

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) { setError("Supabase is not configured."); return; }
    const { data: roomData } = await sb.from("rooms").select("*").eq("code", code).single();
    if (!roomData) { setError("Room not found."); return; }
    const r = roomData as Room;
    setRoom(r);
    const { data: playerData } = await sb.from("players").select("*").eq("room_id", r.id).order("joined_at");
    setPlayers((playerData as Player[]) ?? []);
    const { data: rqData } = await sb.from("room_questions").select("question_id, order_index").eq("room_id", r.id).order("order_index");
    const qids = ((rqData as { question_id: string }[]) ?? []).map((x) => x.question_id);
    if (qids.length > 0) {
      const { data: qData } = await sb.from("questions").select("*").in("id", qids);
      const byId = new Map(((qData as Question[]) ?? []).map((q) => [q.id, q]));
      setQuestions(qids.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q)));
    } else {
      setQuestions([]);
    }
    const { data: ansData } = await sb.from("answers").select("*").eq("room_id", r.id);
    setAnswers((ansData as Answer[]) ?? []);
  }, [code]);

  useEffect(() => {
    setMyPlayerId(localStorage.getItem(`dykm-player-${code}`));
    load();
  }, [code, load]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !room) return;
    const channel = sb
      .channel(`room-${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "answers", filter: `room_id=eq.${room.id}` }, load)
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [room?.id, load]);

  const me = players.find((p) => p.id === myPlayerId) ?? null;
  const isHost = me?.role === "host";
  const currentQuestion = room && questions.length > 0 ? questions[Math.min(room.current_question_index, questions.length - 1)] : null;
  const currentAnswers = currentQuestion ? answers.filter((a) => a.question_id === currentQuestion.id) : [];
  const nonHostPlayers = players.filter((p) => p.role !== "host");
  const submittedIds = new Set(currentAnswers.map((a) => a.player_id));
  const allSubmitted = nonHostPlayers.length > 0 && nonHostPlayers.every((p) => submittedIds.has(p.id));
  const myAnswer = currentQuestion ? currentAnswers.find((a) => a.player_id === myPlayerId) : null;
  const totals = computeTotals(answers, players, room?.subject_player_id ?? null, questions.map((q) => q.id));
  const round = currentQuestion ? computeRoundResult(currentAnswers, players, room?.subject_player_id ?? null) : null;

  // Auto-advance Question -> Results when every non-host player has submitted.
  useEffect(() => {
    if (!room || room.status !== "question" || !allSubmitted || !isHost || !currentQuestion) return;
    const key = `${room.id}:${currentQuestion.id}`;
    if (autoAdvancedRef.current === key) return;
    autoAdvancedRef.current = key;
    const sb = getSupabase();
    if (sb) void sb.from("rooms").update({ status: "results" }).eq("id", room.id);
  }, [room, allSubmitted, isHost, currentQuestion]);

  async function startGame() {
    const sb = getSupabase();
    if (!sb || !room || !isHost) return;
    setBusy(true); setError("");
    const { data: qData, error: qErr } = await sb.from("questions").select("*");
    if (qErr || !qData || qData.length === 0) { setBusy(false); return setError("No questions in the database yet. Run supabase/seed.sql."); }
    const shuffled = [...(qData as Question[])].sort(() => Math.random() - 0.5).slice(0, 10);
    const rows = shuffled.map((q, i) => ({ room_id: room.id, question_id: q.id, order_index: i }));
    const { error: rqErr } = await sb.from("room_questions").insert(rows);
    if (rqErr) { setBusy(false); return setError(rqErr.message); }
    await sb.from("rooms").update({ status: "question", current_question_index: 0 }).eq("id", room.id);
    setBusy(false); await load();
  }

  async function submitAnswer(optionIndex: number) {
    const sb = getSupabase();
    if (!sb || !room || !currentQuestion || !me || me.role === "host" || myAnswer) return;
    const { error: e } = await sb.from("answers").insert({ room_id: room.id, question_id: currentQuestion.id, player_id: me.id, option_index: optionIndex });
    if (e) setError(e.message); else await load();
  }

  async function showResults() {
    const sb = getSupabase();
    if (!sb || !room || !isHost) return;
    await sb.from("rooms").update({ status: "results" }).eq("id", room.id);
    await load();
  }

  async function nextQuestion() {
    const sb = getSupabase();
    if (!sb || !room || !isHost) return;
    if (room.current_question_index + 1 >= questions.length) {
      await sb.from("rooms").update({ status: "finished" }).eq("id", room.id);
    } else {
      await sb.from("rooms").update({ status: "question", current_question_index: room.current_question_index + 1 }).eq("id", room.id);
    }
    await load();
  }

  if (error && !room) return <main><div className="error">{error}</div><p><a href="/">Back home</a></p></main>;
  if (!room) return <main><p>Loading room…</p></main>;

  const leaderboard = [...players].filter((p) => p.role !== "host").sort((a, b) => (totals.totalPoints[b.id] ?? 0) - (totals.totalPoints[a.id] ?? 0));
  const mostMatches = [...players].filter((p) => p.role === "guest").sort((a, b) => (totals.subjectMatches[b.id] ?? 0) - (totals.subjectMatches[a.id] ?? 0));

  return (
    <main>
      <p><a href="/">← Leave room</a></p>
      <div className="code">{room.code}</div>
      <p style={{ textAlign: "center" }}>Share this code. Subject: {room.subject_name ?? "—"} · You: {me ? `${me.name} (${me.role})` : "not joined on this device"}</p>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Players ({players.length})</h2>
        {players.map((p) => (
          <div className="row" key={p.id}>
            <span>{p.name}<span className="tag">{p.role}</span>{room.status !== "lobby" && <span className="tag">{totals.totalPoints[p.id] ?? 0} pts</span>}</span>
            <span>{currentQuestion && submittedIds.has(p.id) ? "✓ answered" : ""}</span>
          </div>
        ))}
        {players.length === 0 && <p>No players yet.</p>}
      </div>

      {room.status === "lobby" && (
        <div className="card">
          <h2>Lobby</h2>
          <p>Wait for the subject and guests to join. The host starts when ready.</p>
          {isHost ? <button onClick={startGame} disabled={busy || players.length < 2}>{busy ? "Starting…" : "Start game"}</button> : <p>Waiting for the host to start…</p>}
          {!isHost && !me && <p>Join from the home page with this code to play on this device.</p>}
        </div>
      )}

      {room.status === "question" && currentQuestion && (
        <div className="card">
          <h2>Question {room.current_question_index + 1} of {questions.length}</h2>
          <p style={{ fontSize: 20, color: "#fff" }}>{currentQuestion.text}</p>
          {me?.role === "host" ? (
            <p>The host does nothing here. You can override to Results at any time.</p>
          ) : myAnswer ? (
            <p>You answered: <strong>{currentQuestion.options[myAnswer.option_index]}</strong>. Waiting for everyone else… ({currentAnswers.length}/{nonHostPlayers.length} submitted)</p>
          ) : (
            <div className="options">
              {currentQuestion.options.map((opt, i) => (
                <button key={i} onClick={() => submitAnswer(i)}>{opt}</button>
              ))}
            </div>
          )}
          <p>{currentAnswers.length}/{nonHostPlayers.length} submitted</p>
          {isHost && <button className="secondary" onClick={showResults}>Override to Results</button>}
        </div>
      )}

      {room.status === "results" && currentQuestion && round && (
        <div className="card">
          <h2>Results — Question {room.current_question_index + 1}</h2>
          <p style={{ fontSize: 18, color: "#fff" }}>{currentQuestion.text}</p>
          {currentQuestion.options.map((opt, i) => {
            const total = round.counts[i];
            const pct = currentAnswers.length ? Math.round((total / currentAnswers.length) * 100) : 0;
            return (
              <div key={i}>
                <div className="row"><span>{opt}{round.subjectOption === i ? " — subject's pick" : ""}{round.majorityOptions.includes(i) ? " — majority" : ""}</span><span>{total} ({pct}%)</span></div>
                <div className="bar"><div style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
          <h2>Points this round</h2>
          {players.filter((p) => p.role === "guest").map((p) => (
            <div className="row" key={p.id}>
              <span>{p.name}</span>
              <span>+{round.pointsThisRound[p.id] ?? 0} pts {round.matchedSubject[p.id] ? "(matched subject +2)" : ""} {round.matchedMajority[p.id] ? "(majority +1)" : ""}</span>
            </div>
          ))}
          <p>Subject scores 0 points. Host scores 0 points.</p>
          {isHost && <button onClick={nextQuestion}>{room.current_question_index + 1 >= questions.length ? "Show final leaderboard" : "Next question"}</button>}
          {!isHost && <p>Waiting for the host…</p>}
        </div>
      )}

      {room.status === "finished" && (
        <div className="card">
          <h2>Final leaderboard</h2>
          {leaderboard.map((p, i) => (
            <div className="row" key={p.id}><span>{i + 1}. {p.name}<span className="tag">{p.role}</span></span><span>{totals.totalPoints[p.id] ?? 0} pts · {totals.subjectMatches[p.id] ?? 0} subject matches</span></div>
          ))}
          <h2>Most matches with the subject</h2>
          {mostMatches.length > 0 && mostMatches[0] ? (
            <p><strong>{mostMatches[0].name}</strong> matched the subject {totals.subjectMatches[mostMatches[0].id] ?? 0} time(s) — the most of any guest.</p>
          ) : <p>No guest matches recorded.</p>}
          <p>Subject scores 0 points by design, so they do not appear in the points leaderboard ranking above except for their match count.</p>
        </div>
      )}
    </main>
  );
}
