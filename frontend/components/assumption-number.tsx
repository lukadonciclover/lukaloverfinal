"use client";
import { useState } from "react";
import { Field } from "./ui";
import { financialUnit } from "@/lib/financial-formatting";

// Keep the edit buffer separate: display rounding must never write back to storage.
export function AssumptionNumber({
  metric,
  label,
  value,
  onValue,
  hint,
  id,
  disabled = false,
}: {
  metric: string;
  label: string;
  value: number | null;
  onValue: (value: number | null) => void;
  hint?: string;
  id?: string;
  disabled?: boolean;
}) {
  const percent = financialUnit(metric) === "percentage";
  const [draft, setDraft] = useState<{
    text: string;
    value: number | null;
  } | null>(null);
  const display =
    value === null
      ? ""
      : percent
        ? String(Number((value * 100).toFixed(3)))
        : String(value);
  return (
    <Field
      id={id}
      label={label}
      hint={`${percent ? "% · " : ""}${hint ?? "Analyst Assumption"}`}
      type="number"
      step="any"
      disabled={disabled}
      value={draft && draft.value === value ? draft.text : display}
      onFocus={() => setDraft({ text: display, value })}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        const raw = event.target.value;
        const parsed = raw === "" ? null : Number(raw) / (percent ? 100 : 1);
        setDraft({ text: raw, value: parsed });
        if (parsed === null || Number.isFinite(parsed)) onValue(parsed);
      }}
    />
  );
}
