/**
 * Question templates. A question's text can contain variables in braces,
 * which are filled in when the question is shown:
 *
 *   {star}    — the star's name, e.g. "What is {star}'s favourite food?"
 *   {subject} — same as {star} (the original name; seeded questions use it).
 *   {host}    — the host's name.
 *
 * Unknown variables are left as-is so a typo is visible instead of silently
 * disappearing. When the star has not been picked yet, {star} renders
 * as "the star".
 */
export const QUESTION_VARIABLES = ["{star}", "{subject}", "{host}"] as const;

export function renderQuestionText(
  text: string,
  vars: { subject?: string | null; host?: string | null },
): string {
  const star = vars.subject?.trim() ? vars.subject.trim() : "the star";
  return text
    .replace(/\{subject\}/gi, star)
    .replace(/\{star\}/gi, star)
    .replace(/\{host\}/gi, vars.host?.trim() ? vars.host.trim() : "the host");
}
