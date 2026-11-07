"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// Old /room/<CODE> route, kept only as a redirect.
// Games now live at /game/<CODE>. See ARCHITECTURE.md.
export default function OldRoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code ?? "").toUpperCase();
  useEffect(() => {
    router.replace(`/game/${code}`);
  }, [code, router]);
  return (
    <main>
      <p>That game moved to /game/{code}…</p>
    </main>
  );
}
