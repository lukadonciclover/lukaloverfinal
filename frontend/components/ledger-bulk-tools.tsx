"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import { useWorkspace } from "@/lib/workspace";
import {
  modifyFigure,
  parseSpreadsheet,
  validCurrency,
} from "@/lib/bulk-approval";
import { formatFinancialLabel } from "@/lib/financial-formatting";
import { Button, Card, Field, Notice, TextArea } from "./ui";
import { ConfirmationDialog } from "./confirmation-dialog";
export function LedgerBulkTools({
  selected,
  setSelected,
}: {
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
}) {
  const { workspace, updateWorkspace } = useWorkspace();
  const [currency, setCurrency] = useState(workspace.company.currency),
    [scale, setScale] = useState(""),
    [paste, setPaste] = useState(""),
    [error, setError] = useState("");
  const [action, setAction] = useState<"delete" | "edit" | "paste" | null>(
    null,
  );
  const ids = workspace.figures
    .filter((r) => selected.has(r.record_id ?? ""))
    .map((r) => r.record_id!);
  const rows = paste.trim()
    ? parseSpreadsheet(paste, workspace.company.currency)
    : [];
  const keys = rows.map((r) => JSON.stringify([r.row.metric, r.row.period]));
  const preview = rows.map((r, i) => ({
    ...r,
    issues: [
      ...r.issues,
      ...(keys.some((key, index) => index !== i && key === keys[i])
        ? ["Duplicate pasted metric and period."]
        : []),
      ...(workspace.figures.some(
        (f) => f.metric === r.row.metric && f.period === r.row.period,
      )
        ? ["Existing ledger conflict."]
        : []),
    ],
  }));
  const valid = preview.filter((r) => !r.issues.length);
  const [revision, setRevision] = useState(0);
  const open = (next: typeof action) => {
    setRevision(workspace.revision);
    setAction(next);
  };
  function apply() {
    if (workspace.revision !== revision) {
      setError("Data changed. Review and confirm again.");
      setAction(null);
      return;
    }
    const chosen = new Set(ids);
    updateWorkspace((w) => {
      if (w.revision !== revision) return w;
      if (action === "delete")
        return {
          ...w,
          figures: w.figures.filter((r) => !chosen.has(r.record_id ?? "")),
        };
      if (action === "edit")
        return {
          ...w,
          figures: w.figures.map((r) =>
            chosen.has(r.record_id ?? "")
              ? modifyFigure(r, {
                  ...(currency ? { currency } : {}),
                  ...(scale ? { unit_scale: Number(scale) } : {}),
                })
              : r,
          ),
        };
      return {
        ...w,
        figures: [
          ...w.figures,
          ...valid.map(({ row }) => ({
            ...row,
            record_id: crypto.randomUUID(),
            company_id: w.company.id,
            origin: "user-supplied" as const,
            source: null,
            notes:
              "Spreadsheet paste; currency and unit scale confirmed by user.",
          })),
        ],
      };
    });
    if (action === "paste")
      setPaste(
        preview
          .filter((r) => r.issues.length)
          .map((r) =>
            [
              r.row.metric,
              r.row.period,
              r.row.value ?? "",
              r.row.currency,
              r.row.unit_scale,
            ].join("\t"),
          )
          .join("\n"),
      );
    if (action === "delete") setSelected(new Set());
    setAction(null);
  }
  return (
    <Card>
      <h2>Ledger Bulk Actions</h2>
      <p className="my-3 text-sm text-mist">
        {ids.length} ledger rows selected
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="my-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            setSelected(
              new Set(
                workspace.figures.map((r) => r.record_id!).filter(Boolean),
              ),
            )
          }
        >
          Select All Ledger Rows
        </Button>
        <Button variant="secondary" onClick={() => setSelected(new Set())}>
          Deselect Ledger Rows
        </Button>
        <Button
          variant="danger"
          disabled={!ids.length}
          onClick={() => open("delete")}
        >
          Delete Selected
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Ledger currency"
          value={currency}
          placeholder="Leave blank to keep"
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
        />
        <Field
          label="Ledger unit scale"
          type="number"
          step="any"
          placeholder="Leave blank to keep"
          value={scale}
          onChange={(e) => setScale(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={!ids.length}
          onClick={() => {
            if (
              (!currency && !scale) ||
              (currency &&
                (!validCurrency(currency) ||
                  currency !== workspace.company.currency)) ||
              (scale && (!Number.isFinite(Number(scale)) || Number(scale) <= 0))
            ) {
              setError(
                "Enter a valid project currency or positive unit scale.",
              );
              return;
            }
            setError("");
            open("edit");
          }}
        >
          Update Selected Units
        </Button>
      </div>
      <p className="my-3 text-xs text-mist">
        Metadata changes do not convert currencies or rescale values. Original
        source references are retained; modified rows are marked user-supplied.
      </p>
      <TextArea
        label="Paste spreadsheet rows"
        placeholder="Metric [tab] Period [tab] Value [tab] Currency [tab] Unit scale"
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
      />
      {preview.length > 0 && (
        <>
          <p className="my-3">
            {valid.length} valid / {preview.length} pasted rows
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Metric</th>
                  <th>Period</th>
                  <th>Value</th>
                  <th>Currency</th>
                  <th>Scale</th>
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>{formatFinancialLabel(r.row.metric)}</td>
                    <td>{r.row.period}</td>
                    <td>{r.row.value ?? "Missing"}</td>
                    <td>{r.row.currency}</td>
                    <td>{r.row.unit_scale}</td>
                    <td className="whitespace-normal">
                      {r.issues.join(" ") || "Eligible"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            className="mt-3"
            disabled={!valid.length}
            onClick={() => open("paste")}
          >
            Save Valid Pasted Rows
          </Button>
        </>
      )}
      {action && (
        <ConfirmationDialog
          title={
            action === "delete"
              ? "Delete Selected Figures"
              : action === "edit"
                ? "Update Selected Units"
                : "Save Pasted Figures"
          }
          confirmLabel={
            action === "delete"
              ? "Delete Figures"
              : action === "edit"
                ? "Apply Unit Changes"
                : "Save Figures"
          }
          onCancel={() => setAction(null)}
          onConfirm={apply}
          disabled={workspace.revision !== revision}
        >
          <p>
            {action === "delete"
              ? `Delete ${ids.length} selected financial figures?`
              : action === "edit"
                ? `Update ${ids.length} rows to currency ${currency || "unchanged"} and scale ${scale || "unchanged"}? Original source references will remain attached.`
                : `Save ${valid.length} valid rows? Confirm currencies and scales against the source. Invalid and conflicting rows will not be saved.`}
          </p>
          {workspace.revision !== revision && (
            <Notice kind="warning">
              Data changed. Cancel and review again.
            </Notice>
          )}
        </ConfirmationDialog>
      )}
    </Card>
  );
}
