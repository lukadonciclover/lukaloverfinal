"use client";
import { useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/lib/workspace";
import {
  historicalCandidates,
  referencesCurrent,
} from "@/lib/historical-references";
import {
  applyProposals,
  currentValue,
  conflictsFor,
  displayAssumption,
  proposalError,
  targetsFor,
  type Proposal,
} from "@/lib/assumptions";
import { assumptionStatus } from "@/lib/assumption-status";
import {
  formatFinancialLabel,
  formatFinancialValue,
} from "@/lib/financial-formatting";
import { settingsFor, profitabilityMethod } from "@/lib/workbench";
import { Button, Card, Notice } from "./ui";
import { ConfirmationDialog } from "./confirmation-dialog";

export function UnifiedAssumptionReview() {
  const { workspace: w, project, updateWorkspace } = useWorkspace();
  const [selected, setSelected] = useState<string[]>([]);
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    rows: Proposal[];
    revision: number;
    project: string;
  } | null>(null);
  const historical = [
    ...historicalCandidates(w, "forecast"),
    ...historicalCandidates(w, "valuation"),
  ];
  const guidance = (w.assumptions ?? []).filter(
    (a) =>
      a.classification === "management guidance" &&
      a.status === "accepted" &&
      a.source_availability !== "removed",
  );
  const allGuidance = (w.assumptions ?? []).filter(
    (a) =>
      a.classification === "management guidance" && a.status !== "rejected",
  );
  const candidates = guidance.flatMap((source) =>
    source.value === null || conflictsFor(source, w.assumptions ?? []).length
      ? []
      : targetsFor(source, w)
          .map((target): Proposal => ({
            source,
            target,
            value: source.value!,
            period: source.period,
            rationale: `Use reviewed guidance from ${source.document_name}; ${source.rationale}`,
            reviewed: true,
          }))
          .filter((p) => !proposalError(p, w)),
  );
  const forecastKeys = [
    "growth",
    "gross_margin",
    profitabilityMethod(settingsFor(w)) === "opex"
      ? "opex_ratio"
      : "ebitda_margin",
    "depreciation_ratio",
    "tax_rate",
    "capex_ratio",
    "nwc_ratio",
    "interest_rate",
  ];
  const targets = [
    ...new Set([
      ...forecastKeys.map((k) => `forecast.${k}`),
      ...historical.map((p) => p.target),
      ...allGuidance.flatMap((a) => targetsFor(a, w)),
    ]),
  ];
  const sourcesFor = (target: string) =>
    allGuidance.filter((a) => targetsFor(a, w).includes(target));
  const eligible = targets.filter(
    (t) =>
      historical.some((p) => p.target === t) ||
      candidates.some((p) => p.target === t),
  );
  function propose(kind: "historical" | "guidance" | "empty", target?: string) {
    const pool = kind === "guidance" ? candidates : historical;
    const rows = pool.filter((p) =>
      target
        ? p.target === target
        : kind === "empty"
          ? currentValue(w, p.target) === null &&
            !settingsFor(w).edited_inputs?.includes(p.target) &&
            !(w.assumptionAdoptions ?? []).some(
              (a) => a.target === p.target && a.user_modified_at,
            )
          : selected.includes(p.target),
    );
    const unique = new Map<string, Proposal>();
    for (const row of rows) {
      if (unique.has(row.target)) {
        setError(
          "Multiple reviewed sources target an input. Select one explicitly in the source review below.",
        );
        return;
      }
      unique.set(row.target, row);
    }
    if (!rows.length) {
      setError(
        "No eligible assumptions selected. Recalculate historical analysis or review guidance below.",
      );
      return;
    }
    setError("");
    setPreview({ rows, revision: w.revision, project: project.id });
  }
  return (
    <Card className="mb-5">
      <h2>Unified Assumption Review</h2>
      <p className="my-3 text-sm text-mist">
        Compare historical references, reviewed guidance and current model
        inputs. Replacements require confirmation. A guidance range requires
        explicit point selection in source review below; no midpoint is assumed.
      </p>
      {!referencesCurrent(w) && (
        <Notice>
          Historical averages need recalculation.{" "}
          <Link href="/financials" className="text-teal underline">
            Review Financial Analysis
          </Link>
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="my-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setSelected(eligible)}>
          Select All Eligible
        </Button>
        <Button variant="secondary" onClick={() => setSelected([])}>
          Deselect All
        </Button>
        <Button variant="secondary" onClick={() => propose("empty")}>
          Fill All Empty Fields
        </Button>
        <Button
          disabled={!selected.length}
          onClick={() => propose("historical")}
        >
          Apply Selected Historical Averages
        </Button>
        <Button disabled={!selected.length} onClick={() => propose("guidance")}>
          Apply Selected Reviewed Guidance
        </Button>
        <Button
          variant="secondary"
          onClick={() => setConflictsOnly(!conflictsOnly)}
        >
          {conflictsOnly ? "Show All Assumptions" : "Review Conflicts"}
        </Button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Financial Driver</th>
              <th>Historical Average / Reference</th>
              <th>Management Guidance</th>
              <th>Current Assumption</th>
              <th>Source / Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {targets
              .filter(
                (t) =>
                  !conflictsOnly ||
                  sourcesFor(t).some(
                    (a) => conflictsFor(a, w.assumptions ?? []).length,
                  ),
              )
              .map((target) => {
                const h = historical.find((p) => p.target === target),
                  g = candidates.filter((p) => p.target === target),
                  sources = sourcesFor(target);
                return (
                  <tr key={target}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${target}`}
                        checked={selected.includes(target)}
                        disabled={!eligible.includes(target)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, target]
                              : selected.filter((t) => t !== target),
                          )
                        }
                      />
                    </td>
                    <td>
                      {formatFinancialLabel(target.split(".")[0])} /{" "}
                      {formatFinancialLabel(target.split(".")[1])}
                      {target.split(".")[2] !== undefined
                        ? ` / Year ${Number(target.split(".")[2]) + 1}`
                        : ""}
                    </td>
                    <td>{h ? displayAssumption(h.source) : "Unavailable"}</td>
                    <td>
                      {sources.map((a) => (
                        <p key={a.id}>
                          {displayAssumption(a)} · {a.status}
                          {conflictsFor(a, w.assumptions ?? []).length
                            ? " · Conflict"
                            : ""}
                        </p>
                      ))}
                    </td>
                    <td>
                      {formatFinancialValue(
                        target.split(".")[1],
                        currentValue(w, target),
                        { currency: w.company.currency },
                      )}
                    </td>
                    <td className="max-w-96">
                      <p className="whitespace-normal">
                        {assumptionStatus(w, target)}
                      </p>
                      {h && (
                        <p className="whitespace-normal text-xs text-mist">
                          {h.source.document_name} · {h.source.period}
                        </p>
                      )}
                      {sources.map((a) => (
                        <p key={a.id} className="whitespace-normal text-xs">
                          {a.document_name}
                          {a.page ? `, p. ${a.page}` : ""}
                        </p>
                      ))}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          disabled={!h}
                          onClick={() => propose("historical", target)}
                        >
                          Use Historical
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={g.length !== 1}
                          onClick={() => propose("guidance", target)}
                        >
                          Use Reviewed Guidance
                        </Button>
                        <Link
                          className="text-teal underline"
                          href={
                            target.startsWith("forecast.")
                              ? "/forecasting"
                              : "/valuation"
                          }
                        >
                          Edit Manually / Keep Current
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {preview && (
        <ConfirmationDialog
          title="Review Assumption Replacements"
          confirmLabel="Confirm Assumptions"
          disabled={
            preview.revision !== w.revision || preview.project !== project.id
          }
          onCancel={() => setPreview(null)}
          onConfirm={() => {
            try {
              if (preview.project !== project.id)
                throw new Error("Project changed. Review a new preview.");
              updateWorkspace((current) =>
                applyProposals(current, preview.rows, preview.revision),
              );
              setPreview(null);
              setSelected([]);
            } catch (reason) {
              setError(
                reason instanceof Error ? reason.message : "Adoption failed.",
              );
            }
          }}
        >
          <p>
            Current → proposed values. Existing analyst assumptions will be
            replaced only for these selected targets.
          </p>
          {preview.rows.map((p) => (
            <p key={p.target}>
              {formatFinancialLabel(p.target)}:{" "}
              {currentValue(w, p.target) ?? "Missing"} →{" "}
              {displayAssumption(p.source, p.value)}
            </p>
          ))}
          {preview.revision !== w.revision && (
            <Notice kind="warning">
              The project changed. Cancel and review a fresh preview.
            </Notice>
          )}
        </ConfirmationDialog>
      )}
    </Card>
  );
}
