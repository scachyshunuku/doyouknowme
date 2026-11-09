"use client";

import {
  MAX_CUSTOM_CHOICE_LENGTH,
  MAX_CUSTOM_QUESTION_LENGTH,
  type CustomQuestionInput,
} from "../lib/custom-questions";

/**
 * One custom-question form: the question plus its 4 choices, used by the
 * contribution wizard (the guest adds their questions one at a time, before
 * the game starts). A question only counts when it and all 4 choices are
 * filled in (the wizard enforces that). The question plays after the
 * question bank, and {star} / {host} work in it like any other question.
 * The choice inputs have no placeholder — the label already says which
 * choice it is.
 */
export default function CustomQuestionForm({
  value,
  onChange,
  label = "Your own question (optional)",
}: {
  value: CustomQuestionInput;
  onChange: (v: CustomQuestionInput) => void;
  label?: string;
}) {
  return (
    <>
      <label>{label}</label>
      <input
        value={value.question}
        onChange={(e) => onChange({ ...value, question: e.target.value })}
        placeholder="e.g. What is {star}'s favourite food?"
        maxLength={MAX_CUSTOM_QUESTION_LENGTH}
      />
      {value.choices.map((choice, i) => (
        <div key={i}>
          <label>Choice {i + 1}</label>
          <input
            value={choice}
            onChange={(e) => {
              const choices = [...value.choices] as CustomQuestionInput["choices"];
              choices[i] = e.target.value;
              onChange({ ...value, choices });
            }}
            maxLength={MAX_CUSTOM_CHOICE_LENGTH}
          />
        </div>
      ))}
    </>
  );
}
