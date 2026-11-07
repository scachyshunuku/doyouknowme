/**
 * Question templates. A question's text can contain variables in braces,
 * which are filled in when the question is shown:
 *
 *   {subject} — the subject's name, e.g. "What is {subject}'s favourite food?"
 *   {host}    — the host's name.
 *
 * Unknown variables are left as-is so a typo is visible instead of silently
 * disappearing. When the subject has not been picked yet, {subject} renders
 * as "the subject".
 */
export const QUESTION_VARIABLES = ["{subject}", "{host}"] as const;

export function renderQuestionText(
  text: string,
  vars: { subject?: string | null; host?: string | null },
): string {
  return text
    .replace(/\{subject\}/gi, vars.subject?.trim() ? vars.subject.trim() : "the subject")
    .replace(/\{host\}/gi, vars.host?.trim() ? vars.host.trim() : "the host");
}
