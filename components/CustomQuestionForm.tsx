"use client";

import {
  MAX_CUSTOM_CHOICE_LENGTH,
  MAX_CUSTOM_QUESTION_LENGTH,
  type CustomQuestionInput,
} from "../lib/custom-questions";

/**
 * Optional "add your own question" section for the join form. Always
 * visible — no toggle, no remove button. If the question is left blank the
 * player just joins; if they fill it in, all 4 choices are required (the
 * join handler enforces that). The question plays after the question bank,
 * and {star} / {host} work in it like any other question.
 */
export default function CustomQuestionForm({
  value,
  onChange,
}: {
  value: CustomQuestionInput;
  onChange: (v: CustomQuestionInput) => void;
}) {
  return (
    <>
      <label>Your own question (optional)</label>
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
            placeholder={`Choice ${i + 1}`}
            maxLength={MAX_CUSTOM_CHOICE_LENGTH}
          />
        </div>
      ))}
    </>
  );
}
