"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateRoomCode, getSupabase, isSupabaseConfigured } from "../lib/supabase";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<"subject" | "guest">("guest");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createRoom() {
    setError("");
    const sb = getSupabase();
    if (!sb) return setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
    if (!name.trim() || !subjectName.trim()) return setError("Enter your name and the subject's name.");
    setBusy(true);
    const roomCode = generateRoomCode();
    const { data: room, error: roomErr } = await sb
      .from("rooms")
      .insert({ code: roomCode, subject_name: subjectName.trim(), status: "lobby", current_question_index: 0 })
      .select()
      .single();
    if (roomErr || !room) { setBusy(false); return setError(roomErr?.message ?? "Could not create room."); }
    const { data: player, error: playerErr } = await sb
      .from("players")
      .insert({ room_id: room.id, name: name.trim(), role: "host" })
      .select()
      .single();
    if (playerErr || !player) { setBusy(false); return setError(playerErr?.message ?? "Could not create host player."); }
    await sb.from("rooms").update({ host_player_id: player.id }).eq("id", room.id);
    localStorage.setItem(`dykm-player-${roomCode}`, player.id);
    router.push(`/room/${roomCode}`);
  }

  async function joinRoom() {
    setError("");
    const sb = getSupabase();
    if (!sb) return setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
    if (!name.trim() || !code.trim()) return setError("Enter a room code and your name.");
    setBusy(true);
    const cleanCode = code.trim().toUpperCase();
    const { data: room, error: roomErr } = await sb.from("rooms").select("*").eq("code", cleanCode).single();
    if (roomErr || !room) { setBusy(false); return setError("Room not found. Check the code."); }
    if (role === "subject" && room.subject_player_id) { setBusy(false); return setError("This room already has a subject."); }
    const { data: player, error: playerErr } = await sb
      .from("players")
      .insert({ room_id: room.id, name: name.trim(), role })
      .select()
      .single();
    if (playerErr || !player) { setBusy(false); return setError(playerErr?.message ?? "Could not join room."); }
    if (role === "subject") await sb.from("rooms").update({ subject_player_id: player.id }).eq("id", room.id);
    localStorage.setItem(`dykm-player-${cleanCode}`, player.id);
    router.push(`/room/${cleanCode}`);
  }

  return (
    <main>
      <h1>Do You Know Me?</h1>
      <p>A party game. The host runs the room, the subject is the person everyone is guessing about, and guests try to pick what the subject would pick.</p>
      {!isSupabaseConfigured() && <div className="error">Supabase is not configured in this deployment. Set the Vercel env vars in the README before playing.</div>}
      <div>
        <button className="small" onClick={() => setMode("create")}>Create room</button>
        <button className="small" onClick={() => setMode("join")}>Join room</button>
      </div>
      {mode === "create" ? (
        <div className="card">
          <h2>Create a room (you are the host)</h2>
          <label>Your name (host)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" />
          <label>Subject&apos;s name (the main person)</label>
          <input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="e.g. Sam" />
          <p>The subject joins later with the room code and picks the Subject role.</p>
          <button onClick={createRoom} disabled={busy}>{busy ? "Creating…" : "Create room"}</button>
        </div>
      ) : (
        <div className="card">
          <h2>Join a room</h2>
          <label>Room code</label>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. ABC123" maxLength={6} />
          <label>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" />
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as "subject" | "guest")}>
            <option value="guest">Guest</option>
            <option value="subject">Subject (the main person)</option>
          </select>
          <button onClick={joinRoom} disabled={busy}>{busy ? "Joining…" : "Join room"}</button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <div className="card">
        <h2>How it works</h2>
        <p>1. Host starts the game. 2. Everyone except the host picks an answer, including the subject. 3. Results: match the subject +2, match the majority +1, max 3 per question. Subject scores 0. 4. Host hits Next Question until the end, then the leaderboard shows total points and most subject matches.</p>
      </div>
    </main>
  );
}
