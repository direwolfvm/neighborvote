"use client";
import { useState } from "react";
import { castVoteAction } from "@/app/elections/[id]/actions";
import { SubmitButton } from "@/components/submit-button";
import type { Ballot } from "@/lib/ballot";
export function BallotForm({
  electionId,
  token,
  ballot
}: {
  electionId: string;
  token: string;
  ballot: Ballot;
}) {
  const [choiceId, setChoiceId] = useState("");
  const [review, setReview] = useState(false);
  return (
    <form action={castVoteAction} className="space-y-5">
      <input type="hidden" name="electionId" value={electionId} />
      <input type="hidden" name="token" value={token} />
      {review ? (
        <>
          <input type="hidden" name="choiceId" value={choiceId} />
          <div
            tabIndex={-1}
            ref={(el) => el?.focus()}
            className="space-y-3 rounded-xl bg-emerald-50 p-5"
          >
            <p className="eyebrow">Review your choice</p>
            <h2 className="text-xl font-semibold">
              {ballot.choices.find((c) => c.id === choiceId)?.label}
            </h2>
            <p className="text-sm leading-relaxed text-slate-600">
              Your vote is final once submitted. Take a moment to make sure this is the choice you
              want to record.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <SubmitButton idleText="Confirm & submit vote" pendingText="Recording your vote…" />
            <button type="button" className="btn-secondary" onClick={() => setReview(false)}>
              Change my choice
            </button>
          </div>
        </>
      ) : (
        <>
          <fieldset className="space-y-3">
            <legend className="mb-4 text-xl font-semibold">{ballot.title}</legend>
            {ballot.choices.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 ${choiceId === c.id ? "border-emerald-700 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <input
                  type="radio"
                  name="choiceId"
                  value={c.id}
                  checked={choiceId === c.id}
                  onChange={() => setChoiceId(c.id)}
                  required
                />
                {c.label}
              </label>
            ))}
          </fieldset>
          <button
            className="btn"
            type="button"
            disabled={!choiceId}
            onClick={() => setReview(true)}
          >
            Review my vote <span aria-hidden="true">→</span>
          </button>
        </>
      )}
    </form>
  );
}
