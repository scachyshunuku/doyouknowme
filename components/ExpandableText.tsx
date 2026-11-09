"use client";
// Long option text, clamped with a tap to expand. Used on the Results
// screen and the answer review, where the full text matters less than the
// counts — short options render as plain text, long ones show the first
// 3 lines with "…show more" and expand in place on tap. The question
// screen itself never truncates: players need the full option to choose.
import { useState } from "react";

export const LONG_OPTION_THRESHOLD = 100;

export default function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= LONG_OPTION_THRESHOLD) return <>{text}</>;
  // The hint lives OUTSIDE the clamped span: -webkit-line-clamp hides
  // everything past 3 lines, so a hint inside it would be clipped too
  // and nobody could tell the text expands. The wrapper toggles it.
  const toggle = () => setExpanded(!expanded);
  return (
    <span className="expandable-wrap" onClick={toggle} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
      <span className={expanded ? "expandable expanded" : "expandable clamped"}>{text}</span>
      <span className="expand-hint">{expanded ? " — show less" : " …show more"}</span>
    </span>
  );
}
