"use client";

import { useEffect, useState } from "react";

type BallotChoice = {
  id: string;
  label: string;
};

type BallotShape = {
  title: string;
  choices: BallotChoice[];
};

function defaultBallot(): BallotShape {
  return {
    title: "",
    choices: [{ id: "option_1", label: "Option 1" }]
  };
}

function toPrettyJson(ballot: BallotShape): string {
  return JSON.stringify(ballot, null, 2);
}

function slugifyChoiceId(input: string, fallbackIndex: number): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `option_${fallbackIndex + 1}`;
}

function parseInitial(initialJson: string): { ballot: BallotShape; json: string } {
  try {
    const parsed = JSON.parse(initialJson) as Partial<BallotShape>;
    const title = typeof parsed?.title === "string" ? parsed.title : "";
    const choices = Array.isArray(parsed?.choices)
      ? parsed.choices
          .map((choice, index) => {
            const label = typeof choice?.label === "string" ? choice.label : "";
            const id =
              typeof choice?.id === "string" && choice.id.trim()
                ? choice.id
                : slugifyChoiceId(label, index);
            return { id, label };
          })
          .filter((choice) => choice.id && choice.label)
      : [];

    const ballot = {
      title,
      choices: choices.length > 0 ? choices : defaultBallot().choices
    };

    return { ballot, json: toPrettyJson(ballot) };
  } catch {
    const ballot = defaultBallot();
    return { ballot, json: initialJson || toPrettyJson(ballot) };
  }
}

export function AdminBallotEditor({
  name,
  initialJson,
  readOnly = false
}: {
  name: string;
  initialJson: string;
  readOnly?: boolean;
}) {
  const parsed = parseInitial(initialJson);
  const [mode, setMode] = useState<"wysiwyg" | "json">("wysiwyg");
  const [ballot, setBallot] = useState<BallotShape>(parsed.ballot);
  const [jsonValue, setJsonValue] = useState<string>(parsed.json);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "wysiwyg") return;
    setJsonValue(toPrettyJson(ballot));
    setJsonError(null);
  }, [ballot, mode]);

  function updateChoice(index: number, patch: Partial<BallotChoice>) {
    setBallot((current) => ({
      ...current,
      choices: current.choices.map((choice, choiceIndex) =>
        choiceIndex === index ? { ...choice, ...patch } : choice
      )
    }));
  }

  function addChoice() {
    setBallot((current) => ({
      ...current,
      choices: [
        ...current.choices,
        {
          id: `option_${current.choices.length + 1}`,
          label: `Option ${current.choices.length + 1}`
        }
      ]
    }));
  }

  function removeChoice(index: number) {
    setBallot((current) => ({
      ...current,
      choices: current.choices.filter((_, choiceIndex) => choiceIndex !== index)
    }));
  }

  function switchToJson() {
    setJsonValue(toPrettyJson(ballot));
    setJsonError(null);
    setMode("json");
  }

  function switchToWysiwyg() {
    try {
      const parsedJson = parseInitial(jsonValue);
      setBallot(parsedJson.ballot);
      setJsonValue(parsedJson.json);
      setJsonError(null);
      setMode("wysiwyg");
    } catch {
      setJsonError("Invalid JSON");
    }
  }

  function handleJsonChange(nextValue: string) {
    setJsonValue(nextValue);
    try {
      const parsed = JSON.parse(nextValue) as Partial<BallotShape>;
      const title = typeof parsed?.title === "string" ? parsed.title : "";
      const choices = Array.isArray(parsed?.choices)
        ? parsed.choices.map((choice, index) => ({
            id:
              typeof choice?.id === "string" && choice.id.trim()
                ? choice.id
                : slugifyChoiceId(typeof choice?.label === "string" ? choice.label : "", index),
            label: typeof choice?.label === "string" ? choice.label : ""
          }))
        : [];
      setBallot({ title, choices });
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON");
    }
  }

  return (
    <div className="space-y-3">
      <textarea className="hidden" name={name} readOnly value={jsonValue} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={mode === "wysiwyg" ? "btn-secondary" : "btn-secondary opacity-80"}
          onClick={() => setMode("wysiwyg")}
          disabled={mode === "wysiwyg"}
        >
          Form editor
        </button>
        <button
          type="button"
          className={mode === "json" ? "btn-secondary" : "btn-secondary opacity-80"}
          onClick={switchToJson}
          disabled={mode === "json"}
        >
          JSON
        </button>
        {mode === "json" ? (
          <button type="button" className="btn-secondary" onClick={switchToWysiwyg}>
            Apply JSON to form
          </button>
        ) : null}
      </div>

      {mode === "wysiwyg" ? (
        <div className="space-y-3 rounded-md bg-slate-50 p-3 ring-1 ring-slate-200">
          <label className="block text-sm">
            Question
            <input
              className="field"
              value={ballot.title}
              onChange={(event) => setBallot((current) => ({ ...current, title: event.target.value }))}
              readOnly={readOnly}
            />
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium">Options</p>
            {ballot.choices.map((choice, index) => (
              <div key={`${choice.id}-${index}`} className="grid grid-cols-1 gap-2 rounded-md bg-white p-2 ring-1 ring-slate-200 md:grid-cols-[1fr_1fr_auto]">
                <label className="block text-xs text-slate-600">
                  Label
                  <input
                    className="field"
                    value={choice.label}
                    onChange={(event) => {
                      const nextLabel = event.target.value;
                      updateChoice(index, {
                        label: nextLabel,
                        id:
                          choice.id.startsWith("option_") || !choice.id.trim()
                            ? slugifyChoiceId(nextLabel, index)
                            : choice.id
                      });
                    }}
                    readOnly={readOnly}
                  />
                </label>
                <label className="block text-xs text-slate-600">
                  ID
                  <input
                    className="field font-mono text-xs"
                    value={choice.id}
                    onChange={(event) => updateChoice(index, { id: event.target.value })}
                    readOnly={readOnly}
                  />
                </label>
                {!readOnly ? (
                  <button
                    type="button"
                    className="btn-secondary self-end"
                    onClick={() => removeChoice(index)}
                    disabled={ballot.choices.length <= 1}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            {!readOnly ? (
              <button type="button" className="btn-secondary" onClick={addChoice}>
                Add option
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            className="field font-mono text-xs"
            rows={10}
            value={jsonValue}
            onChange={(event) => handleJsonChange(event.target.value)}
            readOnly={readOnly}
          />
          {jsonError ? <p className="text-xs text-rose-700">{jsonError}</p> : null}
        </div>
      )}
    </div>
  );
}
