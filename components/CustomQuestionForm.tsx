"use client";

import { useState } from "react";
import {
  emptyCustomQuestion,
  MAX_CUSTOM_CHOICE_LENGTH,
  MAX_CUSTOM_QUESTION_LENGTH,
  type CustomQuestionInput,
} from "../lib/custom-questions";

/**
 * Optional "add your own question" section for the join form. Collapsed by
 * default; collapsing clears the fields, so a hidden form never submits a
 * half-filled question. The question plays after the question bank, and
 * {subject} / {host} work in it like any other question.
 */
export default function CustomQuestionForm({
  value,
  onChange,
}: {
  value: CustomQuestionInput;
  onChange: (v: CustomQuestionInput) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="secondary" onClick={() => setOpen(true)}>
        + Add your own question (optional)
      </button>
    );
  }

  return (
    <div className="custom-question">
      <label>Your question</label>
      <input
        value={value.question}
        onChange={(e) => onChange({ ...value, question: e.target.value })}
        placeholder="e.g. What is {subject}'s favourite food?"
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
      <p>Plays after the question bank. Leave it out to just join.</p>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          onChange(emptyCustomQuestion());
          setOpen(false);
        }}
      >
        Remove question
      </button>
    </div>
  );
}
