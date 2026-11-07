import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Do You Know Me?",
  description: "A simple party game. Join a game with a code, guess what the subject would pick.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
