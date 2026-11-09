"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { generateGameCode, getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { loadPackagesWithCounts, type PackageWithCount } from "../lib/packages";
import { sessionKey } from "../lib/types";

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
      const list = await loadPackagesWithCounts(sb);
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
    // Names cap at 25 characters (the inputs enforce it too) so they fit
    // on one leaderboard line.
    const cleanName = name.trim().slice(0, 25);
    setBusy(true);
    // games.host_player_id is NOT NULL, so generate the host player id first,
    // insert the game pointing at it, then insert the player row with that id.
    // A code collision (unique violation) is retried with a fresh code.
    let gameCode = "";
    let hostPlayerId = "";
    let game: { id: string } | null = null;
    let gameErr: { code?: string; message: string } | null = null;
    for (let attempt = 0; attempt < 3 && !game; attempt++) {
      gameCode = generateGameCode();
      hostPlayerId = crypto.randomUUID();
      const res = await sb
        .from("games")
        .insert({ code: gameCode, question_package_id: selectedPackageId, host_player_id: hostPlayerId, status: "lobby", current_question_index: 0 })
        .select()
        .single();
      if (!res.error && res.data) {
        game = res.data as { id: string };
      } else if (res.error?.code === "23505") {
        gameErr = res.error;
      } else {
        gameErr = res.error;
        break;
      }
    }
    if (!game) { setBusy(false); return setError(gameErr?.message ?? "Could not start a game."); }
    const { error: playerErr } = await sb
      .from("players")
      .insert({ id: hostPlayerId, game_id: game.id, name: cleanName, role: "host" })
      .select()
      .single();
    if (playerErr) {
      // No player row means no game: delete the orphan game row.
      await sb.from("games").delete().eq("id", game.id);
      setBusy(false);
      return setError(playerErr.message);
    }
    saveSession(gameCode, { player_id: hostPlayerId, game_id: game.id, name: cleanName, role: "host" });
    router.push(`/game/${gameCode}`);
  }

  async function joinGame() {
    setError("");
    const sb = getSupabase();
    if (!sb) return setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
    if (!name.trim() || !code.trim()) return setError("Enter a game code and your name.");
    const cleanName = name.trim().slice(0, 25);
    setBusy(true);
    const cleanCode = code.trim().toUpperCase();
    const { data: game, error: gameErr } = await sb.from("games").select("*").eq("code", cleanCode).single();
    if (gameErr || !game) { setBusy(false); return setError("Game not found. Check the code."); }
    // If this browser already joined this game, restore that player instead
    // of inserting a duplicate — a second row for the same person becomes a
    // ghost that never answers and blocks auto-advance for everyone.
    try {
      const raw = localStorage.getItem(sessionKey(cleanCode));
      if (raw) {
        const saved = JSON.parse(raw) as { player_id: string; game_id: string };
        if (saved.game_id === game.id) {
          const { data: existing } = await sb.from("players").select("id").eq("id", saved.player_id).eq("game_id", game.id).single();
          if (existing) { setBusy(false); router.push(`/game/${cleanCode}`); return; }
        }
      }
    } catch { /* ignore */ }
    // Everyone joins as a guest. The host picks the star in the lobby.
    const { data: player, error: playerErr } = await sb
      .from("players")
      .insert({ game_id: game.id, name: cleanName, role: "guest" })
      .select()
      .single();
    if (playerErr || !player) { setBusy(false); return setError(playerErr?.message ?? "Could not join game."); }
    saveSession(cleanCode, { player_id: player.id, game_id: game.id, name: cleanName, role: "guest" });
    router.push(`/game/${cleanCode}`);
  }

  return (
    <main>
      <h1>Do You Know Me?</h1>
      <p>A party game. The host starts a game and picks a question package, picks the star in the lobby, and guests try to pick what the star would pick.</p>
      {!isSupabaseConfigured() && <div className="error">Supabase is not configured in this deployment. Set the Vercel env vars in the README before playing.</div>}
      <div className="tabs" role="tablist" aria-label="Start or join a game">
        <button role="tab" id="tab-create" aria-selected={mode === "create"} aria-controls="panel-create" className={mode === "create" ? "tab active" : "tab"} onClick={() => setMode("create")}>Host a game</button>
        <button role="tab" id="tab-join" aria-selected={mode === "join"} aria-controls="panel-join" className={mode === "join" ? "tab active" : "tab"} onClick={() => setMode("join")}>Join a game</button>
      </div>
      {mode === "create" ? (
        <div className="card" role="tabpanel" id="panel-create" aria-labelledby="tab-create">
          <h2>Host a game</h2>
          <label>Your name (host)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" maxLength={25} />
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
          <button onClick={createGame} disabled={busy || packagesLoading}>{busy ? "Starting…" : "Start game"}</button>
        </div>
      ) : (
        <div className="card" role="tabpanel" id="panel-join" aria-labelledby="tab-join">
          <h2>Join a game</h2>
          <label>Game code</label>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. ABC123" maxLength={6} />
          <label>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" maxLength={25} />
          <button onClick={joinGame} disabled={busy}>{busy ? "Joining…" : "Join game"}</button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <p><a href="/playground">Design playground — preview every view (host TV, guest phone, results, leaderboard) with mock data</a></p>
      <div className="card">
        <h2>How it works</h2>
        <ol className="steps">
          <li><strong>Host starts a game</strong> and picks a question package. In the lobby, the host sets how many questions each guest may add and whether they&apos;re required.</li>
          <li><strong>Guests join with the code.</strong> The host picks one guest as the star.</li>
          <li><strong>When the host starts, everyone adds their questions first</strong> — one question at a time, then the game begins.</li>
          <li><strong>Everyone except the host answers</strong>, including the star. After answering you go to a waiting screen and cannot change it. The host cannot see anyone&apos;s answer until Results.</li>
          <li><strong>Results:</strong> match the star +2, match the majority +1, max 3 per question. Players who did not answer get 0 and do not count as a vote.</li>
          <li><strong>The game ends after all questions are answered.</strong> Highest scorer wins.</li>
        </ol>
      </div>
    </main>
  );
}
