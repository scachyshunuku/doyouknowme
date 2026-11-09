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
  // Packages for the lobby setup card (the host can change the package
  // there); lobbyPackageId remembers the last picked package while the
  // game is custom-only.
  const [packages, setPackages] = useState<{ id: string; name: string; category: string | null; questionCount: number }[]>([]);
  const [lobbyPackageId, setLobbyPackageId] = useState("");
  // Draft for the per-guest limit number input: the field shows the draft
  // while the host is typing, and commits (clamped 0–5) on blur or Enter.
  const [limitDraft, setLimitDraft] = useState<string | null>(null);
  // Contribution wizard: which of your question slots you are on, the
  // draft for that slot, and whether you have finished the phase.
  const [contribSlot, setContribSlot] = useState(0);
  const [contribQ, setContribQ] = useState(emptyCustomQuestion());
  const [contribBusy, setContribBusy] = useState(false);
  const [contribError, setContribError] = useState("");
  // Questions the host skipped. They stay in the question list (so the
  // total never drops) but score no points for anyone.
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
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
    const { data: gqData } = await sb.from("game_questions").select("question_id, order_index, skipped").eq("game_id", g.id).order("order_index");
    const gqRows = (gqData as { question_id: string; skipped?: boolean }[]) ?? [];
    setSkippedIds(new Set(gqRows.filter((r) => r.skipped).map((r) => r.question_id)));
    const qids = gqRows.map((x) => x.question_id);
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

  // Packages for the lobby setup card (the host can change the package
  // there before starting).
  useEffect(() => {
    void (async () => {
      const sb = getSupabase();
      if (!sb) return;
      const { data: pkgData } = await sb.from("question_packages").select("*").order("name");
      const { data: pqData } = await sb.from("package_questions").select("question_package_id");
      const counts = new Map<string, number>();
      for (const row of (pqData as { question_package_id: string }[]) ?? []) {
        counts.set(row.question_package_id, (counts.get(row.question_package_id) ?? 0) + 1);
      }
      const list = ((pkgData as { id: string; name: string; category: string | null }[]) ?? []).map((p) => ({
        ...p,
        questionCount: counts.get(p.id) ?? 0,
      }));
      setPackages(list);
      setLobbyPackageId((prev) => prev || list[0]?.id || "");
    })();
  }, []);

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
  // Custom-only means the game has no package: it plays only what guests
  // contribute. Questions may be optional, but the game still needs at
  // least one — if nobody adds one, it comes back to the lobby instead of
  // starting (see finishContribution).
  const customOnly = !game?.question_package_id;
  const questionsRequired = game?.custom_questions_required ?? false;
  // Lobby setup writes: the host's config changes land on the game row at
  // once, so every client sees them live.
  async function updateGame(patch: Partial<Game>) {
    const sb = getSupabase();
    if (!sb || !game || !isHost) return;
    const { error } = await sb.from("games").update(patch).eq("id", game.id);
    if (error) return setError(error.message);
    await load();
  }

  // Commit the per-guest limit draft: an empty or invalid value reverts to
  // the saved one, anything else is clamped to 0–5 (the database check).
  async function commitLimit() {
    if (limitDraft === null) return;
    const raw = limitDraft;
    setLimitDraft(null);
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    const clamped = Math.max(0, Math.min(5, n));
    if (clamped !== (game?.custom_question_limit ?? 1)) {
      await updateGame({ custom_question_limit: clamped });
    }
  }
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
    ? questions.map((q) => q.id).filter((id) => id !== currentQuestion.id && !skippedIds.has(id))
    : questions.map((q) => q.id).filter((id) => !skippedIds.has(id));
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

  // Shuffle the guests' custom questions into a random order after the
  // bank: permute their order_index slots among themselves. Two phases
  // (park on 10000+ first) so no two rows ever share a slot mid-swap —
  // (game_id, order_index) is the primary key.
  async function shuffleCustomQuestions(sb: NonNullable<ReturnType<typeof getSupabase>>, gameId: string) {
    const { data: customRows } = await sb
      .from("game_questions")
      .select("question_id, order_index")
      .eq("game_id", gameId)
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
        await sb.from("game_questions").update({ order_index: 10000 + i }).eq("game_id", gameId).eq("question_id", customs[i].question_id);
      }
      for (let i = 0; i < customs.length; i++) {
        if (customs[i].order_index !== slots[i]) {
          await sb.from("game_questions").update({ order_index: slots[i] }).eq("game_id", gameId).eq("question_id", customs[i].question_id);
        }
      }
    }
  }

  async function startGame() {
    const sb = getSupabase();
    if (!sb || !game || !isHost || !game.subject_player_id) return;
    setBusyStart(true); setError("");
    // A game with no package plays only custom questions, so it needs the
    // limit above 0 — otherwise there would be no questions at all. (The
    // lobby Start button is disabled in that case too.)
    if (!game.question_package_id && (game.custom_question_limit ?? 1) === 0) {
      setBusyStart(false);
      return setError("Pick a question package, or allow at least 1 custom question per guest.");
    }
    // Copy the package's questions, in defined order, into game_questions —
    // only the ones not already there.
    if (game.question_package_id) {
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
    }
    // With no custom questions to add, go straight to the first question.
    // Otherwise everyone adds their questions first (the contributing
    // phase) and the game starts when they are all done. Everyone starts
    // un-done — this also covers a re-Start after a round that came back
    // to the lobby with no questions.
    if ((game.custom_question_limit ?? 1) === 0) {
      await sb.from("games").update({ status: "question", current_question_index: 0 }).eq("id", game.id);
    } else {
      await sb.from("players").update({ contribution_done: false }).eq("game_id", game.id);
      await sb.from("games").update({ status: "contributing" }).eq("id", game.id);
    }
    setBusyStart(false); await load();
  }

  // Move the game from the contribution phase to the first question:
  // shuffle the customs into a random order after the bank, then start.
  // Any client may trigger it once everyone is done; it re-checks the
  // status first, so a second caller finds the game already started.
  async function finishContribution(force = false) {
    const sb = getSupabase();
    if (!sb || !game) return;
    const { data: g } = await sb.from("games").select("status").eq("id", game.id).single();
    if (!g || (g as { status: string }).status !== "contributing") return;
    if (!force) {
      const { data: ps } = await sb.from("players").select("id, role, contribution_done").eq("game_id", game.id);
      const nonHost = ((ps as { id: string; role: string; contribution_done: boolean }[]) ?? []).filter((p) => p.role !== "host");
      if (nonHost.length === 0 || !nonHost.every((p) => p.contribution_done)) return;
    }
    // A game needs at least one question to start. A custom-only game with
    // optional questions can end up with none if everyone skipped — then it
    // goes back to the lobby instead of starting an empty game.
    const { data: gq } = await sb.from("game_questions").select("question_id").eq("game_id", game.id);
    if ((((gq as { question_id: string }[]) ?? []).length) === 0) {
      await sb.from("games").update({ status: "lobby" }).eq("id", game.id);
      await load();
      return;
    }
    await shuffleCustomQuestions(sb, game.id);
    await sb.from("games").update({ status: "question", current_question_index: 0 }).eq("id", game.id);
    await load();
  }

  // When everyone has finished adding questions, the game starts on its
  // own — any connected client can trigger the finish.
  useEffect(() => {
    if (game?.status !== "contributing" || players.length === 0) return;
    const nonHost = players.filter((p) => p.role !== "host");
    if (nonHost.length > 0 && nonHost.every((p) => p.contribution_done)) {
      void finishContribution();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, players]);

  // The wizard's position survives a reload mid-phase: it is kept in
  // localStorage per game, and cleared when the player finishes the phase.
  const contribKey = `doyouknowme:contrib:${code}`;
  useEffect(() => {
    if (game?.status !== "contributing") return;
    let slot = 0;
    try {
      const raw = localStorage.getItem(contribKey);
      if (raw) slot = Math.max(0, parseInt(raw, 10) || 0);
    } catch { /* ignore */ }
    setContribSlot(slot);
    setContribQ(emptyCustomQuestion());
    setContribError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status]);

  // If the adding step ended with no questions at all, the game comes back
  // to the lobby instead of starting — tell everyone why. (Only the
  // contributing → lobby transition does this; a replay is finished → lobby.)
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!game) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = game.status;
    if (prev === "contributing" && game.status === "lobby") {
      setError("No questions were added — at least one guest needs to add a question before the game can start.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status]);

  // Contribution wizard: save the current slot, then move to the next one
  // — or finish the phase when it was the last slot. A slot must be
  // complete (question + all 4 choices); in optional mode the Skip button
  // is how you leave one blank.
  async function submitContribSlot(finishAfter: boolean) {
    const sb = getSupabase();
    if (!sb || !game || !me) return;
    if (!isCustomQuestionComplete(contribQ)) {
      return setContribError("Fill in the question and all 4 choices, or Skip it.");
    }
    setContribBusy(true); setContribError("");
    const err = await insertCustomQuestion(sb, game.id, contribQ);
    if (err) { setContribBusy(false); return setContribError(err); }
    if (finishAfter) {
      await finishMyContribution();
    } else {
      const next = contribSlot + 1;
      setContribSlot(next);
      setContribQ(emptyCustomQuestion());
      try { localStorage.setItem(contribKey, String(next)); } catch { /* ignore */ }
    }
    setContribBusy(false);
  }

  async function skipContribSlot(finishAfter: boolean) {
    if (finishAfter) {
      await finishMyContribution();
    } else {
      const next = contribSlot + 1;
      setContribSlot(next);
      setContribQ(emptyCustomQuestion());
      setContribError("");
      try { localStorage.setItem(contribKey, String(next)); } catch { /* ignore */ }
    }
  }

  async function finishMyContribution() {
    const sb = getSupabase();
    if (!sb || !me) return;
    setContribBusy(true);
    await sb.from("players").update({ contribution_done: true }).eq("id", me.id);
    setContribQ(emptyCustomQuestion());
    try { localStorage.removeItem(contribKey); } catch { /* ignore */ }
    setContribBusy(false);
    await load();
    await finishContribution();
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

  async function replayGame() {
    const sb = getSupabase();
    if (!sb || !game || !isHost) return;
    // Play again: back to the lobby with the same code and players. The star
    // is picked fresh, every answer is deleted, and the questions go back to
    // the pre-Start state — the bank is re-copied at the next Start and
    // guests add their questions again in the contribution phase. The setup
    // (package, limit, required) stays, so the host can change it in the
    // lobby before starting again.
    const subjectId = game.subject_player_id;
    if (subjectId) await sb.from("players").update({ role: "guest" }).eq("id", subjectId);
    await sb.from("game_questions").delete().eq("game_id", game.id);
    await sb.from("answers").delete().eq("game_id", game.id);
    await sb.from("players").update({ contribution_done: false }).eq("game_id", game.id);
    await sb.from("games").update({ status: "lobby", current_question_index: 0, subject_player_id: null, subject_name: null }).eq("id", game.id);
    await load();
  }

  async function skipQuestion() {    const sb = getSupabase();
    if (!sb || !game || !isHost || !currentQuestion) return;
    // Skip the current question: no points are scored for it. The row is
    // marked skipped (kept, not deleted) and the game moves on exactly like
    // Next Question — the skipped question stays in the list, so the total
    // question count never drops, and it shows in the Answer review marked
    // Skipped with +0 pts.
    const { error } = await sb.from("game_questions").update({ skipped: true }).eq("game_id", game.id).eq("question_id", currentQuestion.id);
    if (error) return setError(error.message);
    if (game.current_question_index + 1 >= questions.length) {
      await sb.from("games").update({ status: "finished" }).eq("id", game.id);
    } else {
      await sb.from("games").update({ status: "question", current_question_index: game.current_question_index + 1 }).eq("id", game.id);
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
      {questions.length > 0 && game.status !== "lobby" && game.status !== "contributing" && (
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
        <h2>Players</h2>
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

      {game.status === "lobby" && isHost && (
        <div className="card">
          <h2>Game setup</h2>
          <label>Question package</label>
          <select
            value={game.question_package_id ?? lobbyPackageId}
            onChange={async (e) => {
              const id = e.target.value;
              setLobbyPackageId(id);
              await updateGame({ question_package_id: id });
            }}
            disabled={customOnly}
          >
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.category ? ` — ${p.category}` : ""} ({p.questionCount} questions)
              </option>
            ))}
          </select>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={customOnly}
              onChange={async (e) => {
                if (e.target.checked) {
                  await updateGame({ question_package_id: null });
                } else {
                  await updateGame({ question_package_id: lobbyPackageId || packages[0]?.id || null });
                }
              }}
            />
            Custom questions only
          </label>
          <label>Custom questions per guest</label>
          <input
            type="number"
            min={0}
            max={5}
            step={1}
            inputMode="numeric"
            value={limitDraft ?? String(game.custom_question_limit ?? 1)}
            onChange={(e) => setLimitDraft(e.target.value)}
            onBlur={commitLimit}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={questionsRequired}
              disabled={(game.custom_question_limit ?? 1) === 0}
              onChange={async (e) => { await updateGame({ custom_questions_required: e.target.checked }); }}
            />
            Require each guest to add their questions
          </label>
        </div>
      )}

      {game.status === "lobby" && (
        <div className="card">
          <h2>Lobby</h2>
          {isHost ? (
            <div className="action-bar"><button onClick={startGame} disabled={busyStart || !game.subject_player_id || players.length < 2 || (!game.question_package_id && (game.custom_question_limit ?? 1) === 0)}>{busyStart ? "Starting…" : "Start game"}</button></div>
          ) : (
            <p>{game.subject_player_id ? "Waiting for the host to start…" : "Waiting for the host to pick a star and start…"}</p>
          )}
          {!game.question_package_id && (game.custom_question_limit ?? 1) === 0 && <p>This game has no question package and guests can&apos;t add questions — pick a package or raise the limit.</p>}
        </div>
      )}

      {game.status === "contributing" && (
        <div className="card">
          {isHost ? (
            <>
              <h2>Adding questions…</h2>
              <p>Waiting for everyone to add their questions — {players.filter((p) => p.role !== "host" && p.contribution_done).length} of {players.filter((p) => p.role !== "host").length} done.</p>
              {players.filter((p) => p.role !== "host").map((p) => (
                <div className="row" key={p.id}>
                  <span>{p.name}</span>
                  <span>{p.contribution_done ? "✓ Done" : "…"}</span>
                </div>
              ))}
              <div className="action-bar"><button className="secondary" onClick={() => void finishContribution(true)}>Start now — skip remaining questions</button></div>
            </>
          ) : me?.contribution_done ? (
            <>
              <h2>✓ You&apos;re done</h2>
              <p>Waiting for everyone else to finish adding questions — {players.filter((p) => p.role !== "host" && p.contribution_done).length} of {players.filter((p) => p.role !== "host").length} done.</p>
            </>
          ) : (
            <>
              <h2>Add your questions</h2>
              <p>
                Question {contribSlot + 1} of {game.custom_question_limit ?? 1}
                {!questionsRequired && " — you can skip any of them."}
                {!questionsRequired && customOnly && " The game needs at least one question to start."}
              </p>
              <CustomQuestionForm label={`Question ${contribSlot + 1} of ${game.custom_question_limit ?? 1}`} value={contribQ} onChange={setContribQ} />
              {contribError && <div className="error">{contribError}</div>}
              <div className="action-bar">
                <button onClick={() => void submitContribSlot(contribSlot + 1 >= (game.custom_question_limit ?? 1))} disabled={contribBusy}>{contribBusy ? "Saving…" : contribSlot + 1 >= (game.custom_question_limit ?? 1) ? "Complete" : "Next question"}</button>
                {!questionsRequired && <button className="secondary" onClick={() => void skipContribSlot(contribSlot + 1 >= (game.custom_question_limit ?? 1))} disabled={contribBusy}>Skip</button>}
              </div>
            </>
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
            const isSkipped = skippedIds.has(q.id);
            return (
              <div className="review-question" key={q.id}>
                <p className="question-text">Q{qi + 1}. {renderQuestionText(q.text, { subject: subjectPlayer?.name ?? null, host: hostPlayer?.name ?? null })}{isSkipped ? " — Skipped" : ""}</p>
                <div className="review-row">
                  <span className="review-name">{subjectPlayer?.name ?? "the star"} ★</span>
                  <span className="review-answer">{starPick ?? "did not answer"}</span>
                  <span className="review-points" />
                </div>
                {players.filter((p) => p.role === "guest").map((p) => {
                  const a = qAnswers.find((x) => x.player_id === p.id);
                  const pick = a ? qOptions[a.option_index] : null;
                  const matchedStar = !isSkipped && a !== undefined && qRound.subjectOption !== null && a.option_index === qRound.subjectOption;
                  return (
                    <div className="review-row" key={p.id}>
                      <span className="review-name">{p.name}{p.id === myPlayerId ? " (you)" : ""}</span>
                      <span className="review-answer">{pick ?? "did not answer"}{matchedStar ? " ✓" : ""}</span>
                      <span className="review-points">+{pointsLabel(isSkipped ? 0 : (qRound.pointsThisRound[p.id] ?? 0))}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {isHost && <div className="action-bar"><button onClick={replayGame}>Play again</button></div>}
        </>
      )}
      </div>
      {(game.status === "question" || game.status === "results") && (
        <aside className="card leaderboard-side">
          <h2>Leaderboard</h2>
          {runningLeaderboard.map((p, i) => (
            <div className="row" key={p.id}>
              <span>{i + 1}. {p.name}{p.id === game.subject_player_id ? " ★" : ""}</span>
              <span className="score"><span className="pts">{pointsLabel(totals.totalPoints[p.id] ?? 0)}</span><span>·</span><span className="matches">{matchesLabel(totals.subjectMatches[p.id] ?? 0)}</span></span>
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
