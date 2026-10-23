"use client";
import { SourceReview } from "./source-review";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/lib/workspace";
import { apiPost } from "@/lib/api";
import { financialFingerprint } from "@/lib/fingerprint";
import {
  currentValue,
  displayAssumption,
  targetLabel,
} from "@/lib/assumptions";
import {
  fillHistorical,
  historicalCandidates,
  historicalLabel,
  referencesCurrent,
  type HistoricalReferences,
  type HistoricalScope,
} from "@/lib/historical-references";
import { operatingSummary } from "@/lib/assumption-status";
import { profitabilityMethod, settingsFor } from "@/lib/workbench";
import { formatFinancialLabel } from "@/lib/financial-formatting";
import { Button, Card, Notice } from "./ui";
import { ConfirmationDialog } from "./confirmation-dialog";

export function HistoricalReferenceControls({
  scope,
}: {
  scope: HistoricalScope;
}) {
  const { workspace: w, project, updateWorkspace } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [restore, setRestore] = useState<{
    target: string;
    revision: number;
  } | null>(null);
  const hash = financialFingerprint(w.figures),
    key = `${project.id}:${w.company.currency}:${hash}`;
  const latest = useRef({ w, key, updateWorkspace });
  latest.current = { w, key, updateWorkspace };
  const request = useRef<AbortController | null>(null),
    attempted = useRef("");
  const refs = w.historicalReferences,
    current = referencesCurrent(w);
  async function calculate(window: 2 | 3 | 5 = refs?.window ?? 3) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const captured = latest.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiPost<HistoricalReferences>(
        "/v1/assumptions/historical-averages",
        {
          figures: captured.w.figures.map(({ record_id: _id, ...f }) => f),
          currency: captured.w.company.currency,
          window,
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted || latest.current.key !== captured.key)
        return;
      if (!Array.isArray(result.averages) || !Array.isArray(result.latest))
        throw new Error(
          "Historical reference response is incomplete. Retry the calculation.",
        );
      const snapshot = {
        ...result,
        input_hash: financialFingerprint(captured.w.figures),
        created_at: new Date().toISOString(),
      };
      captured.updateWorkspace((value) =>
        financialFingerprint(value.figures) !== snapshot.input_hash ||
        value.company.currency !== snapshot.currency
          ? value
          : { ...value, historicalReferences: snapshot },
      );
      setMessage(
        "Historical suggestions recalculated. Existing inputs are preserved.",
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Could not calculate historical references.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    setBusy(false);
    setError("");
    setMessage("");
    if (
      !latest.current.w.historicalReferences &&
      latest.current.w.figures.length &&
      attempted.current !== key
    ) {
      attempted.current = key;
      void calculate();
    }
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [key]);
  useEffect(() => {
    if (!refs || !current) return;
    const result = fillHistorical(latest.current.w, scope);
    if (result.count) {
      updateWorkspace((value) => fillHistorical(value, scope).workspace);
      setMessage(
        `Filled ${result.count} empty inputs from approved historical data. Existing values are preserved.`,
      );
    }
  }, [
    project.id,
    refs?.created_at,
    scope,
    current,
    w.valuationWorkbench?.profitability_method,
    updateWorkspace,
  ]);
  function fill() {
    const result = fillHistorical(w, scope);
    updateWorkspace((value) => fillHistorical(value, scope).workspace);
    setMessage(
      result.count
        ? `Filled ${result.count} empty inputs.`
        : "No eligible empty fields. Existing and user-modified inputs were preserved.",
    );
  }
  const candidates = historicalCandidates(w, scope);
  const summary = operatingSummary(w);
  return (
    <Card className="mb-5">
      <SourceReview />
      <h2>Historical Starting Assumptions</h2>
      {scope === "forecast" && (
        <div className="my-3 text-sm" aria-live="polite">
          <p>
            {summary.sourced} of {summary.total} applicable operating
            assumptions populated from approved financial data.{" "}
            {summary.missing.length} require additional information. Optional
            financing policies and inactive drivers are excluded.
          </p>
          {!!summary.missing.length && (
            <a
              className="text-teal underline"
              href={`#assumption-forecast-${summary.missing[0]}`}
            >
              Review Missing Inputs
            </a>
          )}
        </div>
      )}
      <Link
        href="/workspace#assumption-analysis"
        className="text-sm text-teal underline"
      >
        Supply Financial Data or review source-backed assumptions
      </Link>
      <p className="my-2 text-sm text-mist">
        Annual historical averages are editable starting inputs, not management
        forecasts. Reported effective tax may differ from forecast cash tax.
      </p>
      <div className="my-3 flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Historical window{" "}
          <select
            className="field ml-2"
            aria-label="Historical average window"
            value={refs?.window ?? 3}
            disabled={busy}
            onChange={(e) =>
              void calculate(Number(e.target.value) as 2 | 3 | 5)
            }
          >
            {[2, 3, 5].map((n) => (
              <option
                key={n}
                value={n}
                disabled={
                  !!refs &&
                  refs.available_years.length < n &&
                  n !== (refs.window ?? 3)
                }
              >
                {n} years
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" disabled={!current || busy} onClick={fill}>
          Fill Empty Fields
        </Button>
        <Button
          variant="secondary"
          loading={busy}
          disabled={!w.figures.length}
          onClick={() => void calculate()}
        >
          Recalculate Historical Suggestions
        </Button>
      </div>
      <div role="status" aria-live="polite">
        {busy ? "Calculating historical references..." : message}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {refs && !current && (
        <Notice kind="warning">
          Historical references are stale because approved data or project
          currency changed. Recalculate suggestions; existing assumptions will
          remain unchanged.
        </Notice>
      )}
      {!w.figures.length && (
        <p className="my-3 text-sm">
          Approve annual financial statements to generate historical references.
        </p>
      )}
      {scope === "forecast" && (
        <p className="my-3 text-sm">
          Active profitability driver:{" "}
          {profitabilityMethod(settingsFor(w)) === "opex"
            ? "Gross margin minus operating expense ratio (overrides EBITDA margin)"
            : "EBITDA margin"}
          . Interest and financing assumptions require reviewed inputs.
        </p>
      )}
      {scope === "valuation" && (
        <p className="my-3 text-sm">
          WACC, terminal growth and fair-value adjustments require explicit
          reviewed inputs. Cash, debt and book balances use the latest annual
          position, not averages.{" "}
          {settingsFor(w).enabled.forecast &&
            "DCF operating inputs remain linked to Forecasting."}
        </p>
      )}
      {refs && (
        <details className="my-3">
          <summary className="cursor-pointer">
            Review Historical Averages
          </summary>
          <p className="my-3 text-xs text-mist">
            {refs.periods.join(", ") || "No valid annual periods"} · Calculated{" "}
            {new Date(refs.created_at).toLocaleString()}
          </p>
          {refs.issues.map((issue) => (
            <Notice key={issue} kind="warning">
              {issue}
            </Notice>
          ))}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Metric",
                    "Annual observations",
                    "Average / count",
                    "Source / requirements",
                  ].map((label) => (
                    <th className="p-2" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {refs.averages.map((a) => (
                  <tr key={a.metric} className="border-t border-line align-top">
                    <td className="p-2">{formatFinancialLabel(a.metric)}</td>
                    <td className="p-2">
                      {a.observations.map((o) => (
                        <p key={o.id}>
                          {o.period}: {displayAssumption(o)}
                        </p>
                      ))}
                    </td>
                    <td className="p-2">
                      {a.value === null
                        ? "Unavailable"
                        : displayAssumption(a.source)}{" "}
                      · {a.count} observations
                    </td>
                    <td className="p-2">
                      <details>
                        <summary>Approved ledger sources</summary>
                        {a.source.inputs?.map((i, n) => (
                          <p key={n}>
                            {formatFinancialLabel(i.metric)} {i.period}:{" "}
                            {i.value} × {i.unit_scale} {i.currency} ·{" "}
                            {i.document_id || "Manual ledger record"}
                          </p>
                        ))}
                        <p>{a.unavailable || a.source.rationale}</p>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="my-3">Current Model Inputs</h3>
          <div className="max-h-96 overflow-auto">
            {candidates.map((p) => (
              <div
                key={p.target}
                className="my-2 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2 text-sm"
              >
                <div>
                  <p>
                    {targetLabel(p.target)}:{" "}
                    {currentValue(w, p.target) ?? "Blank"}
                  </p>
                  <p className="text-xs text-mist">
                    {historicalLabel(w, p.target) ||
                      (currentValue(w, p.target) !== null
                        ? "Existing analyst input or adopted guidance"
                        : "Not filled")}{" "}
                    · Reference: {displayAssumption(p.source)}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setRestore({ target: p.target, revision: w.revision })
                  }
                >
                  Restore Historical Average
                </Button>
              </div>
            ))}
          </div>
          <Link
            href="/workspace#assumption-analysis"
            className="my-3 inline-block text-teal underline"
          >
            Open Assumption Analysis and source guidance
          </Link>
        </details>
      )}
      {restore && (
        <ConfirmationDialog
          title="Restore historical reference"
          confirmLabel="Restore this input"
          disabled={restore.revision !== w.revision || !current}
          onCancel={() => setRestore(null)}
          onConfirm={() => {
            const target = restore.target;
            updateWorkspace((value) =>
              value.revision === restore.revision
                ? fillHistorical(value, scope, target).workspace
                : value,
            );
            setRestore(null);
            setMessage(
              "Historical reference restored for the selected input only.",
            );
          }}
        >
          <p>{targetLabel(restore.target)}</p>
          <p>
            Current: {currentValue(w, restore.target) ?? "Blank"} → Proposed:{" "}
            {candidates.find((p) => p.target === restore.target)?.value ??
              "Unavailable"}
          </p>
          <p>
            Only this input will be replaced. Other model inputs and model
            activation remain unchanged.
          </p>
          {restore.revision !== w.revision && (
            <p>The project changed. Cancel and review a fresh preview.</p>
          )}
        </ConfirmationDialog>
      )}
    </Card>
  );
}
