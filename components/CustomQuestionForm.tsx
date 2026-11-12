"use client";

import { useEffect, useRef } from "react";
import {
  MAX_CUSTOM_CHOICE_LENGTH,
  MAX_CUSTOM_QUESTION_LENGTH,
  type CustomQuestionInput,
} from "../lib/custom-questions";

/**
 * One custom-question form: the question plus its 4 choices, used by the
 * contribution wizard (the guest adds their questions one at a time, before
 * the game starts) and the join form's optional question. A question only
 * counts when it and all 4 choices are filled in (the wizard enforces
 * that). The question plays after the question bank.
 *
 * The fields are textareas that word-wrap and grow with the text, instead
 * of single-line inputs that scroll sideways on a long question (up to 300
 * chars) or choice (up to 150). The choice inputs have no placeholder —
 * the label already says which choice it is.
 *
 * Custom questions render as-is, no {star} template: the star is already
 * picked when the wizard runs, so the author types the actual name. The
 * example placeholder models that, using the star's name when known.
 */
function ExpandingTextarea({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Grow (and shrink) to fit the text, so a long question never scrolls
  // sideways on one line.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
    />
  );
}

export default function CustomQuestionForm({
  value,
  onChange,
  label = "Your own question (optional)",
  starName = null,
}: {
  value: CustomQuestionInput;
  onChange: (v: CustomQuestionInput) => void;
  label?: string;
  starName?: string | null;
}) {
  return (
    <>
      <label className="form-section">{label}</label>
      <ExpandingTextarea
        value={value.question}
        onChange={(question) => onChange({ ...value, question })}
        placeholder={starName ? `e.g. What is ${starName}'s favourite food?` : "e.g. What's the star's favourite food?"}
        maxLength={MAX_CUSTOM_QUESTION_LENGTH}
      />
      {value.choices.map((choice, i) => (
        <div key={i}>
          <label>Choice {i + 1}</label>
          <ExpandingTextarea
            value={choice}
            onChange={(v) => {
              const choices = [...value.choices] as CustomQuestionInput["choices"];
              choices[i] = v;
              onChange({ ...value, choices });
            }}
            maxLength={MAX_CUSTOM_CHOICE_LENGTH}
          />
        </div>
      ))}
    </>
  );
}
