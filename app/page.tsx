"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { generateGameCode, getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { sessionKey } from "../lib/types";
import type { QuestionPackage } from "../lib/types";

interface PackageWithCount extends QuestionPackage {
  questionCount: number;
}

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [packages, setPackages] = useState<PackageWithCount[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function loadPackages() {
      const sb = getSupabase();
      if (!sb) { setPackagesLoading(false); return; }
      const { data: pkgData } = await sb.from("question_packages").select("*").order("name");
      const { data: pqData } = await sb.from("package_questions").select("question_package_id");
      const counts = new Map<string, number>();
      for (const row of (pqData as { question_package_id: string }[]) ?? []) {
        counts.set(row.question_package_id, (counts.get(row.question_package_id) ?? 0) + 1);
      }
      const list = ((pkgData as QuestionPackage[]) ?? []).map((p) => ({
        ...p,
        questionCount: counts.get(p.id) ?? 0,
      }));
      setPackages(list);
      if (list.length > 0) setSelectedPackageId(list[0].id);
      setPackagesLoading(false);
    }
    void loadPackages();
  }, []);

  function saveSession(gameCode: string, session: { player_id: string; game_id: string; name: string; role: string }) {
    localStorage.setItem(sessionKey(gameCode), JSON.stringify(session));
  }

  async function createGame() {
    setError("");
    const sb = getSupabase();
    if (!sb) return setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
    if (!name.trim()) return setError("Enter your name.");
    if (!selectedPackageId) return setError("Pick a question package first. Packages are seeded in Supabase — if none show up, run supabase/seed_packages.sql.");
    setBusy(true);
    const gameCode = generateGameCode();
    // games.host_player_id is NOT NULL, so generate the host player id first,
    // insert the game pointing at it, then insert the player row with that id.
    const hostPlayerId = crypto.randomUUID();
    const { data: game, error: gameErr } = await sb
      .from("games")
      .insert({ code: gameCode, question_package_id: selectedPackageId, host_player_id: hostPlayerId, status: "lobby", current_question_index: 0 })
      .select()
      .single();
    if (gameErr || !game) { setBusy(false); return setError(gameErr?.message ?? "Could not start a game."); }
    const { error: playerErr } = await sb
      .from("players")
      .insert({ id: hostPlayerId, game_id: game.id, name: name.trim(), role: "host" })
      .select()
      .single();
    if (playerErr) { setBusy(false); return setError(playerErr.message); }
    saveSession(gameCode, { player_id: hostPlayerId, game_id: game.id, name: name.trim(), role: "host" });
    router.push(`/game/${gameCode}`);
  }

  async function joinGame() {
    setError("");
    const sb = getSupabase();
    if (!sb) return setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
    if (!name.trim() || !code.trim()) return setError("Enter a game code and your name.");
    setBusy(true);
    const cleanCode = code.trim().toUpperCase();
    const { data: game, error: gameErr } = await sb.from("games").select("*").eq("code", cleanCode).single();
    if (gameErr || !game) { setBusy(false); return setError("Game not found. Check the code."); }
    // Everyone joins as a guest. The host picks the subject in the lobby.
    const { data: player, error: playerErr } = await sb
      .from("players")
      .insert({ game_id: game.id, name: name.trim(), role: "guest" })
      .select()
      .single();
    if (playerErr || !player) { setBusy(false); return setError(playerErr?.message ?? "Could not join game."); }
    saveSession(cleanCode, { player_id: player.id, game_id: game.id, name: name.trim(), role: "guest" });
    router.push(`/game/${cleanCode}`);
  }

  return (
    <main>
      <h1>Do You Know Me?</h1>
      <p>A party game. The host starts a game and picks a question package, picks the subject in the lobby, and guests try to pick what the subject would pick.</p>
      {!isSupabaseConfigured() && <div className="error">Supabase is not configured in this deployment. Set the Vercel env vars in the README before playing.</div>}
      <div>
        <button className="small" onClick={() => setMode("create")}>Start a game</button>
        <button className="small" onClick={() => setMode("join")}>Join a game</button>
      </div>
      {mode === "create" ? (
        <div className="card">
          <h2>Start a game (you are the host)</h2>
          <label>Your name (host)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" />
          <label>Question package</label>
          {packagesLoading ? (
            <p>Loading packages…</p>
          ) : packages.length === 0 ? (
            <p>No question packages found. Run supabase/seed_packages.sql in Supabase.</p>
          ) : (
            <select value={selectedPackageId} onChange={(e) => setSelectedPackageId(e.target.value)}>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.category ? ` — ${p.category}` : ""} ({p.questionCount} questions)
                </option>
              ))}
            </select>
          )}
          <p>You pick the subject in the lobby, from the guests who join. There is only one subject per game.</p>
          <button onClick={createGame} disabled={busy || packagesLoading}>{busy ? "Starting…" : "Start game"}</button>
        </div>
      ) : (
        <div className="card">
          <h2>Join a game</h2>
          <label>Game code</label>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. ABC123" maxLength={6} />
          <label>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" />
          <p>You join as a guest. The host picks one guest to be the subject in the lobby.</p>
          <button onClick={joinGame} disabled={busy}>{busy ? "Joining…" : "Join game"}</button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <p><a href="/playground">Design playground — preview every view (host TV, guest phone, results, leaderboard) with mock data</a></p>
      <div className="card">
        <h2>How it works</h2>
        <p>1. Host starts a game and picks a question package. 2. Guests join with the code; the host picks one guest as the subject. 3. Everyone except the host picks an answer, including the subject — after answering you go to a waiting screen and cannot change it. The host cannot see anyone&apos;s answer until Results. 4. Results: match the subject +2, match the majority +1, max 3 per question. Subject scores 0. Players who did not answer get 0 and do not count as a vote. 5. Host hits Next Question until the end, then the leaderboard shows total points and most subject matches.</p>
      </div>
    </main>
  );
}
