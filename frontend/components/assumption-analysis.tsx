"use client";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { apiPost } from "@/lib/api";
import {
  appliedValue,
  applyProposals,
  conflictsFor,
  currentValue,
  displayAssumption,
  proposalError,
  targetLabel,
  targetsFor,
  type Assumption,
  type Proposal,
} from "@/lib/assumptions";
import { settingsFor } from "@/lib/workbench";
import { Button, Card, Notice } from "./ui";
import { ConfirmationDialog } from "./confirmation-dialog";

export function AssumptionAnalysis() {
  const { workspace: w, updateWorkspace } = useWorkspace();
  const [history, setHistory] = useState<Assumption[]>([]),
    [error, setError] = useState("");
  const [filters, setFilters] = useState({
    metric: "",
    source: "",
    period: "",
    status: "",
    model: "",
    classification: "",
  });
  const [drafts, setDrafts] = useState<Record<string, Proposal>>({});
  const [preview, setPreview] = useState<{
    revision: number;
    rows: Proposal[];
  } | null>(null);
  const ledger = JSON.stringify(w.figures.map(({ record_id: _id, ...f }) => f));
  const evidence = JSON.stringify(
    (w.assumptions ?? [])
      .filter((a) => a.metric === "revenue" && a.status !== "rejected")
      .map((a) => ({ ...a, excerpt: "" })),
  );
  useEffect(() => {
    const controller = new AbortController();
    setHistory([]);
    if (ledger === "[]") return () => controller.abort();
    apiPost<Assumption[]>(
      "/v1/assumptions/derive",
      {
        figures: JSON.parse(ledger),
        currency: w.company.currency,
        assumptions: JSON.parse(evidence),
      },
      { signal: controller.signal },
    )
      .then((rows) => {
        if (!Array.isArray(rows))
          throw new Error("Historical assumption response is invalid.");
        if (!controller.signal.aborted) setHistory(rows);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [ledger, w.company.currency, evidence]);
  const rows = [
    ...(w.assumptions ?? []),
    ...history.filter((h) => !w.assumptions?.some((a) => a.id === h.id)),
  ];
  const visible = rows.filter(
    (a) =>
      (!filters.metric || a.metric === filters.metric) &&
      (!filters.source || a.document_name === filters.source) &&
      (!filters.period || a.period === filters.period) &&
      (!filters.status || a.status === filters.status) &&
      (!filters.classification ||
        a.classification === filters.classification) &&
      (!filters.model ||
        targetsFor(a, w).some((t) => t.startsWith(filters.model))),
  );
  function stage(a: Assumption) {
    setDrafts((old) => ({
      ...old,
      [a.id]: {
        source: a,
        target: targetsFor(a, w)[0] ?? "",
        value:
          a.value === null
            ? NaN
            : a.value * (a.unit === "currency" ? a.unit_scale : 1),
        period: "",
        rationale: "",
        reviewed: false,
      },
    }));
  }
  function patch(id: string, value: Partial<Proposal>) {
    setDrafts((old) => ({ ...old, [id]: { ...old[id], ...value } }));
  }
  function review(list: Proposal[]) {
    setError("");
    try {
      if (!list.length) throw new Error("Select at least one assumption.");
      // Validate the complete transaction before showing the confirmation.
      applyProposals(w, list, w.revision);
      setPreview({ revision: w.revision, rows: structuredClone(list) });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function confirm() {
    if (!preview) return;
    try {
      const next = applyProposals(w, preview.rows, preview.revision);
      updateWorkspace((current) =>
        current.revision === preview.revision ? next : current,
      );

      setDrafts({});
      setPreview(null);
      setError("");
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    }
  }
  const control =
    "w-full min-w-0 rounded border border-line bg-ink p-2 text-sm";
  return (
    <section id="assumption-analysis" className="my-6 scroll-mt-6">
      <Card>
        <h2>Assumption Analysis</h2>
        <p className="my-3 text-sm text-mist">
          Review source evidence before changing model inputs. Historical ratios
          are observations, not forecasts. Rates use percent; monetary proposals
          use the project currency in actual units.
        </p>
        <Notice>
          Quarterly, segment and multi-year guidance requires separate analysis
          before annual adoption. Import comparable companies and transactions
          through Models. Market capital weights require a verified total market
          capital value and paired weights; book values are not fair values.
        </Notice>
        <div className="my-4 grid gap-2 sm:grid-cols-3">
          {(
            [
              "metric",
              "source",
              "period",
              "status",
              "classification",
              "model",
            ] as const
          ).map((key) => {
            const choices =
              key === "model"
                ? ["forecast", "dcf", "wacc", "ddm", "assets"]
                : [
                    ...new Set(
                      rows.map((a) =>
                        key === "source" ? a.document_name : a[key],
                      ),
                    ),
                  ].sort();
            return (
              <label key={key} className="text-xs capitalize">
                {key}
                <select
                  aria-label={`Filter assumptions by ${key}`}
                  className={control}
                  value={filters[key]}
                  onChange={(e) =>
                    setFilters({ ...filters, [key]: e.target.value })
                  }
                >
                  <option value="">All</option>
                  {choices.map((v) => (
                    <option key={v} value={v}>
                      {v.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
        <div className="my-3 flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() =>
              setDrafts((old) => ({
                ...old,
                ...Object.fromEntries(
                  visible
                    .filter(
                      (a) => a.status !== "rejected" && targetsFor(a, w).length,
                    )
                    .map((a) => [
                      a.id,
                      old[a.id] ?? {
                        source: a,
                        target: targetsFor(a, w)[0] ?? "",
                        value:
                          a.value === null
                            ? NaN
                            : a.value *
                              (a.unit === "currency" ? a.unit_scale : 1),
                        period: "",
                        rationale: "",
                        reviewed: false,
                      },
                    ]),
                ),
              }))
            }
          >
            Select All Visible
          </Button>
          <Button variant="secondary" onClick={() => setDrafts({})}>
            Deselect All
          </Button>
        </div>
        {!rows.length && (
          <p className="my-4">
            No assumption evidence available. Upload documents or approve
            historical financial data.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Metric / period",
                  "Evidence",
                  "Value / range",
                  "Source",
                  "Status",
                  "Review",
                ].map((h) => (
                  <th key={h} className="p-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id} className="border-t border-line align-top">
                  <td className="p-2">
                    {a.metric.replaceAll("_", " ")}
                    <p className="text-xs text-mist">
                      {a.period} · {a.basis} · {a.scope}
                    </p>
                  </td>
                  <td className="p-2">
                    {a.classification}
                    <p className="text-xs">
                      {a.explicit ? "Explicit source" : "Derived calculation"} ·{" "}
                      {Math.round(a.confidence * 100)}% extraction confidence
                    </p>
                    {conflictsFor(a, rows).length > 0 && (
                      <p className="text-amber-200">
                        Conflicting source values — review both.
                      </p>
                    )}
                  </td>
                  <td className="p-2">{displayAssumption(a)}</td>
                  <td className="max-w-sm p-2">
                    <details>
                      <summary className="cursor-pointer">
                        {a.document_name}
                        {a.page ? ` · page ${a.page}` : ""}
                      </summary>
                      <p className="my-2 whitespace-pre-wrap break-words">
                        {a.excerpt ||
                          "Source text unavailable; review the original document."}
                      </p>
                      <p>{a.rationale}</p>
                      {a.inputs?.map((input, i) => (
                        <p key={i}>
                          {input.metric}: {input.value} × {input.unit_scale}{" "}
                          {input.currency} ({input.period})
                        </p>
                      ))}
                    </details>
                  </td>
                  <td className="p-2">{a.status}</td>
                  <td className="p-2">
                    <Button variant="secondary" onClick={() => stage(a)}>
                      Review
                    </Button>
                    <button
                      className="ml-2 p-2 text-mist"
                      onClick={() => {
                        setDrafts((old) => {
                          const next = { ...old };
                          delete next[a.id];
                          return next;
                        });
                        updateWorkspace((current) => ({
                          ...current,
                          assumptions: [
                            ...(current.assumptions ?? []).filter(
                              (row) => row.id !== a.id,
                            ),
                            { ...a, status: "rejected" },
                          ],
                        }));
                      }}
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {Object.values(drafts).map((p) => {
          const a = p.source,
            historical = history.filter((h) => h.metric === a.metric),
            guidance = rows.filter(
              (h) =>
                h.metric === a.metric &&
                h.classification === "management guidance",
            );
          const scale = a.unit === "percentage" ? 100 : 1;
          const model = p.target.split(".")[0];
          const enabled = settingsFor(w).enabled[model as "dcf"];
          return (
            <div key={a.id} className="my-4 border border-line p-4">
              <div className="flex justify-between gap-3">
                <h3>
                  {a.metric.replaceAll("_", " ")} — {a.period}
                </h3>
                <button
                  aria-label={`Remove proposal ${a.metric}`}
                  onClick={() =>
                    setDrafts((old) => {
                      const next = { ...old };
                      delete next[a.id];
                      return next;
                    })
                  }
                >
                  Remove
                </button>
              </div>
              <p className="my-2 text-sm">
                Latest historical observation:{" "}
                {historical.length
                  ? `${historical.at(-1)!.period}: ${displayAssumption(historical.at(-1)!)}`
                  : "Unavailable"}
              </p>
              <p className="my-2 text-sm">
                Historical trend:{" "}
                {historical.length
                  ? historical
                      .map((h) => `${h.period}: ${displayAssumption(h)}`)
                      .join("; ")
                  : "No comparable annual history"}
              </p>
              <p className="my-2 text-sm">
                Management guidance:{" "}
                {guidance.length
                  ? guidance
                      .map(
                        (h) =>
                          `${h.document_name}, ${h.period}: ${displayAssumption(h)}`,
                      )
                      .join("; ")
                  : "None detected"}
              </p>
              {p.target &&
                currentValue(w, p.target) !== null &&
                a.value !== null &&
                currentValue(w, p.target) !== a.value && (
                  <p className="my-2 text-sm text-amber-200">
                    Source evidence differs from the current model input. Review
                    the source period and definition before replacing it.
                  </p>
                )}
              <div className="grid gap-3 md:grid-cols-2">
                <label>
                  Model input
                  <select
                    className={control}
                    value={p.target}
                    onChange={(e) => patch(a.id, { target: e.target.value })}
                  >
                    <option value="">Select input and year</option>
                    {targetsFor(a, w).map((t) => (
                      <option key={t} value={t}>
                        {targetLabel(t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Proposed value{" "}
                  {a.unit === "percentage"
                    ? "(%)"
                    : a.unit === "currency"
                      ? `(${w.company.currency}, actual units)`
                      : ""}
                  <input
                    className={control}
                    type="number"
                    step="any"
                    value={Number.isFinite(p.value) ? p.value * scale : ""}
                    onChange={(e) =>
                      patch(a.id, {
                        value:
                          e.target.value === ""
                            ? NaN
                            : Number(e.target.value) / scale,
                      })
                    }
                  />
                </label>
                <label>
                  Application period / years
                  <input
                    className={control}
                    value={p.period}
                    onChange={(e) => patch(a.id, { period: e.target.value })}
                    placeholder="Specify fiscal year or full forecast horizon"
                  />
                </label>
                <label>
                  Selection rationale / corrections
                  <input
                    className={control}
                    value={p.rationale}
                    onChange={(e) => patch(a.id, { rationale: e.target.value })}
                    placeholder="Explain use of history, source conflicts or corrected values"
                  />
                </label>
              </div>
              {a.metric.endsWith("_weight") && (
                <label className="my-3 block">
                  Verified total market capital ({w.company.currency}, actual
                  units)
                  <input
                    type="number"
                    step="any"
                    className={control}
                    value={p.capitalBase ?? ""}
                    onChange={(e) =>
                      patch(a.id, {
                        capitalBase:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
              )}
              <p className="my-3 text-sm">
                Current input:{" "}
                {p.target
                  ? (currentValue(w, p.target) ?? "Not set")
                  : "Select a target"}{" "}
                (model units).{" "}
                {!enabled &&
                  p.target &&
                  "Model is disabled and will remain disabled."}{" "}
                {model === "forecast" &&
                  "This scalar applies to every year in the forecast horizon."}
              </p>
              <label className="my-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={p.reviewed}
                  onChange={(e) => patch(a.id, { reviewed: e.target.checked })}
                />
                I reviewed the original source, consolidated scope, currency,
                units, period and conflicting evidence. The proposed value and
                selected model years reflect my decision.
              </label>
              {proposalError(p, w) && (
                <p className="my-2 text-xs text-amber-200">
                  {proposalError(p, w)}
                </p>
              )}
              <Button onClick={() => review([p])}>
                Preview this assumption
              </Button>
            </div>
          );
        })}
        <div className="my-3">
          <Button
            disabled={!Object.keys(drafts).length}
            onClick={() =>
              review(Object.values(drafts).filter((p) => !proposalError(p, w)))
            }
          >
            Preview selected assumptions
          </Button>
        </div>
        {Object.values(drafts).some((p) => proposalError(p, w)) && (
          <p className="text-sm text-mist">
            Incomplete or invalid proposals are excluded from the batch preview.
            Review each proposal to include it.
          </p>
        )}
        {error && (
          <p role="alert" className="my-3 text-red-300">
            {error}
          </p>
        )}
        {(w.assumptionAdoptions ?? []).length > 0 && (
          <details className="my-4">
            <summary>
              Adoption history ({w.assumptionAdoptions!.length})
            </summary>
            {w.assumptionAdoptions!.map((a) => (
              <p className="my-2 text-sm" key={a.id}>
                {targetLabel(a.target)}: {a.value} · {a.period} ·{" "}
                {a.source.document_name} · {a.accepted_at} ·{" "}
                {currentValue(w, a.target) === a.value
                  ? "Matches current input"
                  : "Superseded by another value"}{" "}
                · {a.rationale}
              </p>
            ))}
          </details>
        )}
        {preview && (
          <ConfirmationDialog
            title="Apply assumptions"
            confirmLabel="Apply selected inputs"
            disabled={preview.revision !== w.revision}
            onCancel={() => setPreview(null)}
            onConfirm={confirm}
          >
            <p>Only these inputs will change. Model activation is unchanged.</p>
            {preview.rows.map((p) => (
              <div key={p.target}>
                <strong>{targetLabel(p.target)}</strong>
                <p>
                  {currentValue(w, p.target) ?? "Not set"} → {appliedValue(p)}{" "}
                  (model units)
                </p>
                <p>
                  {p.period} · {p.source.document_name} · {p.rationale}
                </p>
              </div>
            ))}
            {preview.revision !== w.revision && (
              <p>The project changed. Cancel and review a new preview.</p>
            )}
          </ConfirmationDialog>
        )}
      </Card>
    </section>
  );
}
