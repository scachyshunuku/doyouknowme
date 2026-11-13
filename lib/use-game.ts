"use client";
// Game state for one game code: loading, live updates, derived values and
// every action the page can take. The page itself is a thin shell that
// renders the stage components with this object. Extracted from the page
// (design review: the page was a god component) — behaviour is unchanged.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { generateGameCode, getSupabase } from "./supabase";
import { loadPackagesWithCounts } from "./packages";
import { leaderboardPlayers, sortByMatches, sortByPoints, sortByPointsThenMatches } from "./leaderboard";
import { computeRoundResult, computeTotals } from "./scoring";
import { renderQuestionText } from "./template";
import { shuffleArray, shuffledOptions } from "./shuffle";
import {
  emptyCustomQuestion,
  hasDuplicateChoices,
  insertCustomQuestion,
  isCustomQuestionComplete,
} from "./custom-questions";
import { sessionKey } from "./types";
import type { Answer, Game, GameQuestion, Player } from "./types";
import type { CustomQuestionInput } from "./custom-questions";

export interface GameState {
  code: string;
  game: Game | null;
  players: Player[];
  questions: GameQuestion[];
  answers: Answer[];
  myPlayerId: string | null;
  me: Player | null;
  loaded: boolean;
  error: string;
  busyStart: boolean;
  busySubjectId: string | null;
  // Which host advance action is in flight ("results" | "next" | "skip" |
  // "replay" | "force-start"). The button for that action shows a "…" label
  // and stays disabled until the round-trip lands, so a double-tap cannot
  // fire it twice and the host sees the tap landed.
  busyAction: string | null;
  copied: boolean;
  joinName: string;
  joinBusy: boolean;
  joinError: string;
  packages: { id: string; name: string; questionCount: number }[];
  packagesLoaded: boolean;
  lobbyPackageId: string;
  setupPackageId: string | null | undefined;
  setupLimit: number;
  setupRequired: boolean;
  contribSlot: number;
  contribQ: CustomQuestionInput;
  contribBusy: boolean;
  contribError: string;
  skippedIds: Set<string>;
  pendingPick: number | null;
  isHost: boolean;
  effectivePackageId: string | null;
  customOnly: boolean;
  questionsRequired: boolean;
  effectiveLimit: number;
  showJoin: boolean;
  currentQuestion: GameQuestion | null;
  currentAnswers: Answer[];
  // How many players have answered the current question (from the
  // question row's submitted_count trigger, migration 0013). The count
  // pill and auto-advance use this, not currentAnswers.length, because
  // unrevealed answers are hidden by RLS.
  submittedCount: number;
  nonHostPlayers: Player[];
  allSubmitted: boolean;
  myAnswer: Answer | undefined | null;
  totals: ReturnType<typeof computeTotals>;
  round: ReturnType<typeof computeRoundResult> | null;
  subjectPlayer: Player | null;
  hostPlayer: Player | null;
  questionText: string;
  displayOptions: string[];
  runningLeaderboard: Player[];
  sortedResultOptions: { opt: string; i: number; count: number }[];
  maxResultCount: number;
  leaderboard: Player[];
  matchesLeaderboard: Player[];
  load: () => Promise<void>;
  updateGame: (patch: Partial<Game>) => Promise<void>;
  copyInvite: () => Promise<void>;
  selectSubject: (playerId: string) => Promise<void>;
  startGame: () => Promise<void>;
  finishContribution: (force?: boolean) => Promise<void>;
  submitContribSlot: (finishAfter: boolean) => Promise<void>;
  skipContribSlot: (finishAfter: boolean) => Promise<void>;
  finishMyContribution: () => Promise<void>;
  submitAnswer: (optionIndex: number) => Promise<void>;
  joinGame: () => Promise<void>;
  showResults: () => Promise<void>;
  nextQuestion: () => Promise<void>;
  skipQuestion: () => Promise<void>;
  playAgain: () => Promise<void>;
  // Host-only, finished screen (Task 32): add one more custom question,
  // and resume the game with the questions added since it finished.
  addMoreQuestion: (cq: CustomQuestionInput) => Promise<string | null>;
  playAddedQuestions: () => Promise<void>;
  setJoinName: (v: string) => void;
  setContribQ: (v: CustomQuestionInput) => void;
  setSetupPackageId: (v: string | null) => void;
  setSetupLimit: (v: number) => void;
  setSetupRequired: (v: boolean) => void;
  setLobbyPackageId: (v: string) => void;
  setError: (v: string) => void;
}

export function useGame(code: string): GameState {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The code of the game this one was replayed from (Task 23). When a
  // guest follows a replay into a new game, the URL carries the old code
  // so the new page can re-join them with the same name and role.
  const replayFrom = searchParams.get("replayFrom")?.toUpperCase() ?? null;
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyStart, setBusyStart] = useState(false);
  const [busySubjectId, setBusySubjectId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState("");
  // Packages for the lobby setup card (the host can change the package
  // there); lobbyPackageId remembers the last picked package while the
  // game is custom-only.
  const [packages, setPackages] = useState<{ id: string; name: string; questionCount: number }[]>([]);
  const [lobbyPackageId, setLobbyPackageId] = useState("");
  // The lobby setup is the source of truth for Start: these hold the host's
  // current selections (package, per-guest limit, required), initialized
  // from the game row once and updated synchronously on every change, so
  // Start uses exactly what is selected — never a stale saved row.
  const [setupPackageId, setSetupPackageId] = useState<string | null | undefined>(undefined);
  const [setupLimit, setSetupLimit] = useState(1);
  const [setupRequired, setSetupRequired] = useState(false);
  const setupInitRef = useRef(false);
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
  // My pick for the current question, remembered locally (migration 0013):
  // unrevealed answers are hidden by RLS, so I cannot read my own answer
  // back from the table to show the waiting screen. The pick is saved to
  // localStorage when I submit, so a reload still shows the waiting screen
  // instead of the options again. Keyed by game code + question id, so it
  // never carries over to the next question.
  const pickKey = (questionId: string) => `doyouknowme:pick:${code.toUpperCase()}:${questionId}`;
  const [myPick, setMyPick] = useState<number | null>(null);
  const saveMyPick = (questionId: string, optionIndex: number) => {
    setMyPick(optionIndex);
    try { localStorage.setItem(pickKey(questionId), String(optionIndex)); } catch { /* ignore */ }
  };
  const autoAdvancedRef = useRef("");
  // Play again (Task 23): the replay code this client has already followed,
  // and whether the replay auto-join has run. Both guard against the
  // Realtime reloads that fire while the new game is being set up.
  const replayFollowRef = useRef("");
  const replayJoinRef = useRef(false);
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
    // The three game-scoped reads are independent — fetch them together.
    // The game's questions come from game_questions alone: each row is a
    // self-contained copy (text + options), so the questions bank is never
    // read while playing.
    const [{ data: playerData }, { data: gqData }, { data: ansData }] = await Promise.all([
      sb.from("players").select("*").eq("game_id", g.id).order("joined_at"),
      sb.from("game_questions").select("*").eq("game_id", g.id).order("order_index"),
      sb.from("answers").select("*").eq("game_id", g.id),
    ]);
    setPlayers((playerData as Player[]) ?? []);
    sessionVerifiedRef.current = true;
    const gqRows = (gqData as GameQuestion[]) ?? [];
    setQuestions(gqRows);
    setSkippedIds(new Set(gqRows.filter((r) => r.skipped).map((r) => r.id)));
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
  const [packagesLoaded, setPackagesLoaded] = useState(false);
  useEffect(() => {
    void (async () => {
      const sb = getSupabase();
      if (!sb) { setPackagesLoaded(true); return; }
      const list = await loadPackagesWithCounts(sb);
      setPackages(list);
      setPackagesLoaded(true);
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

  // Play again, guest side (Task 23): when the host replays, the old
  // game row gains a replay_code. Every guest still on the old game
  // follows it into the new lobby on their own — the host never has to
  // re-share a link. The host already navigated in playAgain, so only
  // non-hosts follow.
  useEffect(() => {
    if (!game?.replay_code || isHost) return;
    if (replayFollowRef.current === game.replay_code) return;
    replayFollowRef.current = game.replay_code;
    router.push(`/game/${game.replay_code}?replayFrom=${code}`);
  }, [game?.replay_code, isHost, code, router]);

  // Play again, new-game side (Task 23): a guest who followed a replay
  // lands here with ?replayFrom=<old code> and no session for the new
  // game. Re-join them with the same name and role they had in the old
  // game, so they are already in the new lobby. The old star stays the
  // star: their row keeps the subject role and the game points at them,
  // so the host can just hit Start. Runs once, after the game loads;
  // a session for the new code (or a reload after joining) skips it.
  // The role comes from the old player's CURRENT row, not the saved
  // session — the session was written at join time (role "guest"), so a
  // star picked later would otherwise re-join as a guest and lose the ★.
  useEffect(() => {
    if (!game || !loaded || !replayFrom || replayFrom === code || replayJoinRef.current) return;
    let existing: string | null = null;
    try { existing = localStorage.getItem(sessionKey(code)); } catch { /* ignore */ }
    if (existing) return;
    let old: { player_id?: string; name?: string; role?: string } | null = null;
    try {
      const raw = localStorage.getItem(sessionKey(replayFrom));
      if (raw) old = JSON.parse(raw) as { player_id?: string; name?: string; role?: string };
    } catch { /* Corrupt old session: fall through to the join card. */ }
    if (!old?.name || !old?.player_id || !old?.role || old.role === "host") return;
    replayJoinRef.current = true;
    void (async () => {
      const sb = getSupabase();
      if (!sb) return;
      const { data: oldRow } = await sb.from("players").select("role").eq("id", old.player_id).single();
      const role = (oldRow as { role?: string } | null)?.role ?? old.role;
      if (role === "host") return;
      const newId = crypto.randomUUID();
      const { error } = await sb.from("players").insert({ id: newId, game_id: game.id, name: old.name, role }).select().single();
      if (error) { replayJoinRef.current = false; return; }
      try { localStorage.setItem(sessionKey(code), JSON.stringify({ player_id: newId, game_id: game.id, name: old.name, role })); } catch { /* ignore */ }
      setMyPlayerId(newId);
      if (role === "subject") {
        await sb.from("games").update({ subject_player_id: newId }).eq("id", game.id);
      }
      await load();
      router.replace(`/game/${code}`);
    })();
  }, [game, loaded, replayFrom, code, load, router]);
  // Custom-only means the game has no package: it plays only what guests
  // contribute. Questions may be optional, but the game still needs at
  // least one — if nobody adds one, it comes back to the lobby instead of
  // starting (see finishContribution).
  // The lobby setup state is the source of truth while the host is editing;
  // before it is initialized, fall back to the saved game row.
  const effectivePackageId = setupPackageId === undefined ? (game?.question_package_id ?? null) : setupPackageId;
  const customOnly = effectivePackageId === null;
  const questionsRequired = setupInitRef.current ? setupRequired : (game?.custom_questions_required ?? false);
  const effectiveLimit = setupInitRef.current ? setupLimit : (game?.custom_question_limit ?? 1);
  // Initialize the lobby setup from the game row once, when it first loads.
  useEffect(() => {
    if (!game || setupInitRef.current) return;
    setSetupPackageId(game.question_package_id);
    setSetupLimit(game.custom_question_limit ?? 1);
    setSetupRequired(game.custom_questions_required ?? false);
    setupInitRef.current = true;
  }, [game]);
  // Lobby setup writes: the host's config changes land on the game row at
  // once, so every client sees them live. The local setup state (above) is
  // updated synchronously first, so Start always sees the latest selection.
  async function updateGame(patch: Partial<Game>) {
    const sb = getSupabase();
    if (!sb || !game || !isHost) return;
    const { error } = await sb.from("games").update(patch).eq("id", game.id);
    if (error) return setError(error.message);
    await load();
  }
  // Invite links open a join dialog: a visitor with no session for this game
  // enters a name and joins as a guest, instead of landing in the game as a
  // spectator with no way in. A plain refresh resumes silently. There is no
  // "join as someone else": a player row is never deleted, so a game cannot
  // lose its host or its star to a switch (their answers and their place in
  // the game would go with it).
  const showJoin = loaded && !!game && !me;
  const currentQuestion = game && questions.length > 0 ? questions[Math.min(game.current_question_index, questions.length - 1)] : null;
  // Answers for the current question are hidden by RLS until Results
  // (migration 0013), so currentAnswers is empty while the question is
  // being answered — that is the point. The submitted count comes from
  // the question row's submitted_count (kept by a trigger), not from
  // counting answer rows. One answer per player per question is enforced
  // by the UNIQUE constraint, so the count equals distinct submitters.
  const currentAnswers = currentQuestion ? answers.filter((a) => a.game_question_id === currentQuestion.id) : [];
  const submittedCount = currentQuestion?.submitted_count ?? 0;
  const nonHostPlayers = players.filter((p) => p.role !== "host");
  const allSubmitted = nonHostPlayers.length > 0 && submittedCount >= nonHostPlayers.length;
  // My answer for the current question: the table row once it is revealed,
  // otherwise the pick I remembered locally when I submitted (RLS hides my
  // own unrevealed answer too, so the waiting screen cannot read it back).
  // The synthetic row carries only option_index — that is all the waiting
  // screen and the submit guard need.
  const dbMyAnswer = currentQuestion ? currentAnswers.find((a) => a.player_id === myPlayerId) : null;
  const myAnswer = dbMyAnswer ?? (myPick !== null && currentQuestion ? { id: "", game_id: game?.id ?? "", game_question_id: currentQuestion.id, player_id: myPlayerId ?? "", option_index: myPick, created_at: "" } as Answer : null);
  // Points for the current question stay hidden until its Results screen:
  // while a question is being answered, totals count only earlier questions.
  const countedQuestionIds = game?.status === "question" && currentQuestion
    ? questions.map((q) => q.id).filter((id) => id !== currentQuestion.id && !skippedIds.has(id))
    : questions.map((q) => q.id).filter((id) => !skippedIds.has(id));
  const totals = computeTotals(answers, players, game?.subject_player_id ?? null, countedQuestionIds);
  const round = currentQuestion ? computeRoundResult(currentAnswers, players, game?.subject_player_id ?? null) : null;
  const subjectPlayer = players.find((p) => p.id === game?.subject_player_id) ?? null;
  const hostPlayer = players.find((p) => p.id === game?.host_player_id) ?? null;
  // Question text: bank questions are templates ({subject}/{host} filled
  // in here), but custom questions are written after the star is picked,
  // so the author types the actual name — they render as-is, no template.
  const questionText = currentQuestion
    ? currentQuestion.is_custom
      ? currentQuestion.text
      : renderQuestionText(currentQuestion.text, { subject: subjectPlayer?.name ?? null, host: hostPlayer?.name ?? null })
    : "";
  // The 4 options are shuffled per game (seeded by game + question), so
  // every player sees the same order and it survives reloads. Answers are
  // stored as positions in this shown order.
  const displayOptions = game && currentQuestion
    ? shuffledOptions(currentQuestion.options, game.id, currentQuestion.id)
    : [];
  // Running leaderboard, most points first (subject matches break ties).
  const runningLeaderboard = sortByPointsThenMatches(
    leaderboardPlayers(players, game?.host_player_id ?? null, game?.subject_player_id ?? null),
    totals,
  );
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
    // The invite link is just the game URL. Anyone who opens it with no
    // session for this game gets the join card (enter a name); anyone
    // already in the game resumes straight into it. There used to be a
    // ?join=1 on the link, but it only forced players who were already in
    // to see the join card instead of resuming — nobody needs it.
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
    if (!chosen || chosen.role === "host") { setBusySubjectId(null); return setError("Pick a guest to be the star."); }
    // Demote the old subject first (the partial unique index allows only one),
    // then promote the chosen guest, then point the game at them.
    const { error: demoteErr } = await sb.from("players").update({ role: "guest" }).eq("game_id", game.id).eq("role", "subject");
    if (demoteErr) { setBusySubjectId(null); return setError(demoteErr.message); }
    const { error: promoteErr } = await sb.from("players").update({ role: "subject" }).eq("id", playerId);
    if (promoteErr) { setBusySubjectId(null); return setError(promoteErr.message); }
    const { error: gameErr } = await sb.from("games").update({ subject_player_id: playerId }).eq("id", game.id);
    if (gameErr) { setBusySubjectId(null); return setError(gameErr.message); }
    setBusySubjectId(null); await load();
  }

  async function startGame() {
    const sb = getSupabase();
    if (!sb || !game || !isHost || !game.subject_player_id) return;
    if (busyStart) return;
    setBusyStart(true); setError("");
    // Start uses the lobby's current selections — not the saved game row —
    // so there is no window where a just-changed package or limit is lost.
    // A game with no package plays only custom questions, so it needs the
    // limit above 0 — otherwise there would be no questions at all. (The
    // lobby Start button is disabled in that case too.)
    const packageId = effectivePackageId;
    const limit = effectiveLimit;
    if (!packageId && limit === 0) {
      setBusyStart(false);
      return setError("Pick a question package, or allow at least 1 custom question per guest.");
    }
    // Copy the package's questions into game_questions as self-contained
    // rows (text + options copied in, marked bank), shuffled once — the
    // bank's defined order is only the seed list, the game plays them in
    // this shuffled order. Only copy when the game has no questions yet
    // (a game back in the lobby has none; this also makes a double-Start
    // harmless).
    if (packageId) {
    const { data: pqData, error: pqErr } = await sb
      .from("package_questions")
      .select("question_id")
      .eq("question_package_id", packageId);
    if (pqErr || !pqData || pqData.length === 0) { setBusyStart(false); return setError("This question package has no questions. Seed it in Supabase first."); }
    const { data: existing } = await sb.from("game_questions").select("id").eq("game_id", game.id).limit(1);
    if (!existing || existing.length === 0) {
      const qids = (pqData as { question_id: string }[]).map((r) => r.question_id);
      const { data: bank, error: bankErr } = await sb.from("questions").select("text, options").in("id", qids);
      if (bankErr || !bank) { setBusyStart(false); return setError(bankErr?.message ?? "Could not load the question package."); }
      const rows = shuffleArray(bank as { text: string; options: string[] }[])
        .map((q, i) => ({ game_id: game.id, text: q.text, options: q.options, order_index: i, is_custom: false }));
      const { error: gqErr } = await sb.from("game_questions").insert(rows);
      if (gqErr) { setBusyStart(false); return setError(gqErr.message); }
    }
    }
    // Commit the selected setup with the status change, so the game starts
    // with exactly what the host picked. With no custom questions to add,
    // go straight to the first question. Otherwise everyone adds their
    // questions first (the contributing phase) and the game starts when
    // they are all done. Everyone starts un-done — this also covers a
    // re-Start after a round that came back to the lobby with no questions.
    autoAdvancedRef.current = "";
    if (limit === 0) {
      await sb.from("games").update({ question_package_id: packageId, custom_question_limit: limit, custom_questions_required: setupRequired, status: "question", current_question_index: 0 }).eq("id", game.id);
    } else {
      await sb.from("players").update({ contribution_done: false }).eq("game_id", game.id);
      await sb.from("games").update({ question_package_id: packageId, custom_question_limit: limit, custom_questions_required: setupRequired, status: "contributing" }).eq("id", game.id);
    }
    setBusyStart(false); await load();
  }

  // Move the game from the contribution phase to the first question. The
  // shuffle and the status flip run server-side (the finish_contribution
  // RPC, one transaction), so two clients finishing at once cannot
  // interleave their shuffles. Any client may trigger it once everyone is
  // done; the RPC returns false when the game already started.
  const finishContribution = useCallback(async (force = false) => {
    const sb = getSupabase();
    if (!sb || !game) return;
    const { data: g } = await sb.from("games").select("status").eq("id", game.id).single();
    if (!g || (g as { status: string }).status !== "contributing") return;
    if (!force) {
      const { data: ps } = await sb.from("players").select("id, role, contribution_done").eq("game_id", game.id);
      const nonHost = ((ps as { id: string; role: string; contribution_done: boolean }[]) ?? []).filter((p) => p.role !== "host");
      if (nonHost.length === 0 || !nonHost.every((p) => p.contribution_done)) return;
    }
    // The host's "Start now" (force) gets the same treatment as the other
    // advance buttons: a "…" label and a disabled button until the RPC
    // lands, so the tap is visibly answered and cannot double-fire.
    setBusyAction("force-start");
    try {
      const { error } = await sb.rpc("finish_contribution", { p_game_id: game.id });
      if (error) return setError(error.message);
      await load();
    } finally {
      setBusyAction(null);
    }
  }, [game, load]);

  // When everyone has finished adding questions, the game starts on its
  // own — any connected client can trigger the finish.
  useEffect(() => {
    if (game?.status !== "contributing" || players.length === 0) return;
    const nonHost = players.filter((p) => p.role !== "host");
    if (nonHost.length > 0 && nonHost.every((p) => p.contribution_done)) {
      void finishContribution();
    }
  }, [game?.status, players, finishContribution]);

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
    // Clamp to the current limit: a replay with a smaller limit (or a stale
    // key from a force-started round) must not show "Question 3 of 1".
    slot = Math.min(slot, Math.max(0, effectiveLimit - 1));
    setContribSlot(slot);
    setContribQ(emptyCustomQuestion());
    setContribError("");
  }, [game?.status, contribKey, effectiveLimit]);

  // If the adding step ended with no questions at all, the game comes back
  // to the lobby instead of starting — tell everyone why. (Only the
  // contributing → lobby transition does this; a replay is finished → lobby.)
  // Leaving the phase also clears the wizard position, so a guest who was
  // mid-wizard when the host force-started does not resume at a stale slot.
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!game) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = game.status;
    if (prev === "contributing" && game.status === "lobby") {
      setError("No questions were added — at least one guest needs to add a question before the game can start.");
    }
    if (prev === "contributing" && game.status !== "contributing") {
      setContribSlot(0);
      setContribQ(emptyCustomQuestion());
      try { localStorage.removeItem(contribKey); } catch { /* ignore */ }
    }
  }, [game, contribKey]);

  // Contribution wizard: save the current slot, then move to the next one
  // — or finish the phase when it was the last slot. A slot must be
  // complete (question + all 4 choices); in optional mode the Skip button
  // is how you leave one blank. A "slot" is one of the question forms the
  // guest fills in, in order — the limit is how many slots each guest gets.
  async function submitContribSlot(finishAfter: boolean) {
    const sb = getSupabase();
    if (!sb || !game || !me) return;
    if (!isCustomQuestionComplete(contribQ)) {
      return setContribError(questionsRequired ? "Fill in the question and all 4 choices." : "Fill in the question and all 4 choices, or Skip it.");
    }
    // A duplicate option can never be a real choice. Check it here, before
    // any database call, so the error shows at once instead of after the
    // round-trips. (insertCustomQuestion refuses it too, as a backstop.)
    if (hasDuplicateChoices(contribQ)) {
      return setContribError("Two choices are the same — make each choice different.");
    }
    setContribBusy(true); setContribError("");
    // The phase may already be over (the host hit Start now while this
    // insert was in flight) — check before writing, so a late question
    // cannot land mid-game and grow the question list.
    const { data: g } = await sb.from("games").select("status").eq("id", game.id).single();
    if (!g || (g as { status: string }).status !== "contributing") {
      setContribBusy(false);
      setContribQ(emptyCustomQuestion());
      return setContribError("The host already started the game.");
    }
    // The per-guest limit is enforced here too, not just in the wizard UI:
    // count this player's own custom questions (marked is_custom, recorded
    // by author) and refuse another one past the limit.
    const { data: mine } = await sb.from("game_questions").select("id").eq("game_id", game.id).eq("is_custom", true).eq("created_by_player_id", me.id);
    if ((((mine as { id: string }[]) ?? []).length) >= effectiveLimit) {
      setContribBusy(false);
      return setContribError("You have already added all of your questions.");
    }
    const err = await insertCustomQuestion(sb, game.id, contribQ, me.id);
    if (err) { setContribBusy(false); return setContribError(err); }
    if (finishAfter) {
      // The player is done: finishMyContribution marks them done locally
      // (so the wizard is replaced at once) and leaves the buttons
      // disabled until the phase has moved on. Do not re-enable here.
      await finishMyContribution();
    } else {
      const next = contribSlot + 1;
      setContribSlot(next);
      setContribQ(emptyCustomQuestion());
      try { localStorage.setItem(contribKey, String(next)); } catch { /* ignore */ }
      setContribBusy(false);
    }
  }

  async function skipContribSlot(finishAfter: boolean) {
    if (contribBusy) return;
    setContribBusy(true);
    if (finishAfter) {
      // As above: the player is done, so the wizard goes away — do not
      // re-enable the buttons on a blank question.
      await finishMyContribution();
    } else {
      const next = contribSlot + 1;
      setContribSlot(next);
      setContribQ(emptyCustomQuestion());
      setContribError("");
      try { localStorage.setItem(contribKey, String(next)); } catch { /* ignore */ }
      setContribBusy(false);
    }
  }

  async function finishMyContribution() {
    const sb = getSupabase();
    if (!sb || !me) return;
    setContribBusy(true);
    // Mark done locally FIRST, so the wizard is replaced by the "You're
    // done" view the moment the button is tapped. The DB writes below take
    // a round-trip each, and the user should not stare at the wizard while
    // they land. If the update fails, the next load() re-reads the real
    // state, the wizard comes back, and the error is shown.
    setPlayers((prev) => prev.map((p) => (p.id === me.id ? { ...p, contribution_done: true } : p)));
    setContribQ(emptyCustomQuestion());
    try { localStorage.removeItem(contribKey); } catch { /* ignore */ }
    const { error } = await sb.from("players").update({ contribution_done: true }).eq("id", me.id);
    if (error) { setContribBusy(false); return setContribError(error.message); }
    await load();
    await finishContribution();
    setContribBusy(false);
  }

  async function submitAnswer(optionIndex: number) {
    const sb = getSupabase();
    if (!sb || !game || !currentQuestion || !me || me.role === "host" || myAnswer || pendingPick !== null) return;
    setPendingPick(optionIndex);
    // A late tap must not score: re-read the game first and only insert
    // while this exact question is still being answered. (A stale tab, or
    // a tap landing as the host hits Reveal, used to score after the fact.)
    const { data: g } = await sb.from("games").select("status, current_question_index").eq("id", game.id).single();
    const fresh = g as { status: string; current_question_index: number } | null;
    if (!fresh || fresh.status !== "question" || questions[fresh.current_question_index]?.id !== currentQuestion.id) {
      setPendingPick(null);
      return setError("That question is already over.");
    }
    const { error: e } = await sb.from("answers").insert({ game_id: game.id, game_question_id: currentQuestion.id, player_id: me.id, option_index: optionIndex });
    if (e) {
      setPendingPick(null);
      // 23505 (unique game/question/player): I already submitted — e.g. a
      // double-tap that slipped past the guard, or a reload after clearing
      // localStorage. Treat it as submitted (the waiting screen shows the
      // pick I just tapped; the score uses the row already in the table).
      if ((e as { code?: string }).code === "23505") {
        saveMyPick(currentQuestion.id, optionIndex);
        await load();
        return;
      }
      return setError(e.message);
    }
    // Remember the pick locally: unrevealed answers are hidden by RLS, so
    // the waiting screen cannot read it back from the table.
    saveMyPick(currentQuestion.id, optionIndex);
    await load();
  }

  // Clear the optimistic pick when the question changes or the real answer lands.
  useEffect(() => { setPendingPick(null); }, [currentQuestion?.id]);
  useEffect(() => { if (myAnswer) setPendingPick(null); }, [myAnswer]);
  // Restore my remembered pick for the current question (a reload after
  // submitting). The key is per question, so nothing carries over.
  useEffect(() => {
    if (!currentQuestion) { setMyPick(null); return; }
    try {
      const raw = localStorage.getItem(pickKey(currentQuestion.id));
      setMyPick(raw !== null && raw !== "" ? Number(raw) : null);
    } catch { setMyPick(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id]);

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

  async function showResults() {
    const sb = getSupabase();
    if (!sb || !game || !isHost || busyAction) return;
    setBusyAction("results");
    try {
      // Guarded on the current status: a stale tab that already moved on
      // cannot drag the game back to Results.
      await sb.from("games").update({ status: "results" }).eq("id", game.id).eq("status", "question");
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  async function nextQuestion() {
    const sb = getSupabase();
    if (!sb || !game || !isHost || busyAction) return;
    setBusyAction("next");
    try {
      if (game.current_question_index + 1 >= questions.length) {
        await sb.from("games").update({ status: "finished" }).eq("id", game.id).eq("status", "results");
      } else {
        await sb.from("games").update({ status: "question", current_question_index: game.current_question_index + 1 }).eq("id", game.id).eq("status", "results");
      }
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  async function playAgain() {
    const sb = getSupabase();
    if (!sb || !game || !isHost || !me || busyAction) return;
    // Already replayed (e.g. the host is still on the old page): just go
    // to the new game instead of creating a second one.
    if (game.replay_code) { router.push(`/game/${game.replay_code}`); return; }
    // Play again starts a fresh game: a new code, the same setup (package,
    // limit, required) and the same host. Resetting the same game row meant
    // resetting every piece of round state (answers, questions, done flags,
    // the auto-advance guard, the wizard position) and any one of them left
    // stale would poison the next round — a new game has none of that. The
    // old game stays finished as history.
    setBusyAction("replay");
    try {
      const newCode = generateGameCode();
      const hostPlayerId = crypto.randomUUID();
      const { data: newGame, error: gameErr } = await sb
        .from("games")
        .insert({ code: newCode, question_package_id: effectivePackageId, custom_question_limit: effectiveLimit, custom_questions_required: setupRequired, host_player_id: hostPlayerId, status: "lobby", current_question_index: 0 })
        .select()
        .single();
      if (gameErr || !newGame) return setError(gameErr?.message ?? "Could not start a new game.");
      const { error: playerErr } = await sb
        .from("players")
        .insert({ id: hostPlayerId, game_id: newGame.id, name: me.name, role: "host" })
        .select()
        .single();
      if (playerErr) {
        await sb.from("games").delete().eq("id", newGame.id);
        return setError(playerErr.message);
      }
      try { localStorage.setItem(sessionKey(newCode), JSON.stringify({ player_id: hostPlayerId, game_id: newGame.id, name: me.name, role: "host" })); } catch { /* ignore */ }
      // Point the old game at the new one so every guest's client follows
      // into the new lobby on its own (Task 23). Best-effort: if this
      // update fails, the host still lands in the new game and can share
      // the link, and the old game's finished screen offers the new game
      // once the pointer is set.
      await sb.from("games").update({ replay_code: newCode }).eq("id", game.id);
      router.push(`/game/${newCode}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function playAddedQuestions() {
    const sb = getSupabase();
    if (!sb || !game || !isHost || busyAction) return;
    // The new questions start right after the last one played, so the
    // resume index is current_question_index + 1. Nothing there yet means
    // the host has not added a question — stay finished.
    const firstNew = game.current_question_index + 1;
    if (firstNew >= questions.length) return;
    setBusyAction("play-added");
    try {
      await sb.from("games").update({ status: "question", current_question_index: firstNew }).eq("id", game.id).eq("status", "finished");
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  /**
   * The host adds one more question after the game has finished (Task 32).
   * It is a custom question like any other: saved into game_questions after
   * the bank (max order_index + 1), so it plays after everything already
   * played. Returns an error message, or null on success. The game stays
   * finished until the host taps "Play these questions" (playAddedQuestions).
   */
  async function addMoreQuestion(cq: CustomQuestionInput): Promise<string | null> {
    const sb = getSupabase();
    if (!sb || !game || !isHost || !me) return "Only the host can add questions.";
    if (!isCustomQuestionComplete(cq)) return "Fill in the question and all 4 choices.";
    if (hasDuplicateChoices(cq)) return "Two choices are the same — make each choice different.";
    const err = await insertCustomQuestion(sb, game.id, cq, me.id);
    if (err) return err;
    await load();
    return null;
  }

  async function skipQuestion() {    const sb = getSupabase();
    if (!sb || !game || !isHost || !currentQuestion || busyAction) return;
    setBusyAction("skip");
    try {
      // Skip the current question: no points are scored for it. The row is
      // marked skipped (kept, not deleted) and the game moves on exactly like
      // Next Question — the skipped question stays in the list, so the total
      // question count never drops, and it shows in the Answer review marked
      // Skipped with +0 pts.
      const { error } = await sb.from("game_questions").update({ skipped: true }).eq("id", currentQuestion.id);
      if (error) return setError(error.message);
      if (game.current_question_index + 1 >= questions.length) {
        await sb.from("games").update({ status: "finished" }).eq("id", game.id).eq("status", "question");
      } else {
        await sb.from("games").update({ status: "question", current_question_index: game.current_question_index + 1 }).eq("id", game.id).eq("status", "question");
      }
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  const leaderboard = sortByPoints(leaderboardPlayers(players, game?.host_player_id ?? null, game?.subject_player_id ?? null), totals);
  const matchesLeaderboard = sortByMatches(leaderboardPlayers(players, game?.host_player_id ?? null, game?.subject_player_id ?? null), totals);

  return {
    code,
    game,
    players,
    questions,
    answers,
    myPlayerId,
    me,
    loaded,
    error,
    busyStart,
    busySubjectId,
    busyAction,
    copied,
    joinName,
    joinBusy,
    joinError,
    packages,
    packagesLoaded,
    lobbyPackageId,
    setupPackageId,
    setupLimit,
    setupRequired,
    contribSlot,
    contribQ,
    contribBusy,
    contribError,
    skippedIds,
    pendingPick,
    isHost,
    effectivePackageId,
    customOnly,
    questionsRequired,
    effectiveLimit,
    showJoin,
    currentQuestion,
    currentAnswers,
    submittedCount,
    nonHostPlayers,
    allSubmitted,
    myAnswer,
    totals,
    round,
    subjectPlayer,
    hostPlayer,
    questionText,
    displayOptions,
    runningLeaderboard,
    sortedResultOptions,
    maxResultCount,
    leaderboard,
    matchesLeaderboard,
    load,
    updateGame,
    copyInvite,
    selectSubject,
    startGame,
    finishContribution,
    submitContribSlot,
    skipContribSlot,
    finishMyContribution,
    submitAnswer,
    joinGame,
    showResults,
    nextQuestion,
    skipQuestion,
    playAgain,
    addMoreQuestion,
    playAddedQuestions,
    setJoinName,
    setContribQ,
    setSetupPackageId,
    setSetupLimit,
    setSetupRequired,
    setLobbyPackageId,
    setError,
  };
}
