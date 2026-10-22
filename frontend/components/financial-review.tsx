"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import {
  approvalPreview,
  applyApproval,
  ledgerMetrics,
  reviewSuggestions,
  validCurrency,
} from "@/lib/bulk-approval";
import {
  formatFinancialLabel,
  formatPercent,
} from "@/lib/financial-formatting";
import { Button, Card, Field, Notice, Select } from "./ui";
import { ConfirmationDialog } from "./confirmation-dialog";

export function FinancialReview() {
  const { workspace, updateWorkspace } = useWorkspace();
  const reviewed = useMemo(() => reviewSuggestions(workspace), [workspace]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1),
    [size, setSize] = useState(25);
  const [year, setYear] = useState(""),
    [metric, setMetric] = useState(""),
    [document, setDocument] = useState(""),
    [status, setStatus] = useState(""),
    [issue, setIssue] = useState("");
  const [currency, setCurrency] = useState(workspace.company.currency),
    [scale, setScale] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [preview, setPreview] = useState<ReturnType<
    typeof approvalPreview
  > | null>(null);
  const [discard, setDiscard] = useState<string | null>(null);
  const ids = reviewed
    .filter((row) => selected.has(row.record.record_id))
    .map((row) => row.record.record_id);
  const filtered = reviewed.filter(
    ({ record: r, status: s, issues }) =>
      (!year || r.period.slice(0, 4) === year) &&
      (!metric || r.metric === metric) &&
      (!document || r.documentId === document) &&
      (!status || s === status) &&
      (!issue || issues.some((text) => text === issue)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / size)),
    currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * size, currentPage * size);
  function edit(id: string, field: string, value: string) {
    setError("");
    updateWorkspace((w) => ({
      ...w,
      documents: w.documents.map((d) => ({
        ...d,
        suggestions: d.suggestions.map((r) =>
          r.record_id === id
            ? {
                ...r,
                [field]:
                  field === "value"
                    ? value === ""
                      ? null
                      : Number(value)
                    : field === "unit_scale"
                      ? value === ""
                        ? 0
                        : Number(value)
                      : value,
                ...(field === "unit_scale"
                  ? { units_confirmed: false }
                  : field === "currency"
                    ? { currency_confirmed: false }
                    : {}),
              }
            : r,
        ),
      })),
    }));
  }
  function verify() {
    if (!ids.length) {
      setError("Select records to verify.");
      return;
    }
    if (
      (!currency && !scale.trim()) ||
      (currency && (!validCurrency(currency) || currency !== workspace.company.currency)) ||
      (scale.trim() && (!Number.isFinite(Number(scale)) || Number(scale) <= 0))
    ) {
      setError(
        "Enter the project currency or a positive unit scale verified against the source.",
      );
      return;
    }
    const chosen = new Set(ids);
    updateWorkspace((w) => ({
      ...w,
      documents: w.documents.map((d) => ({
        ...d,
        suggestions: d.suggestions.map((r) =>
          chosen.has(r.record_id ?? "")
            ? {
                ...r,
                ...(currency ? {currency, currency_confirmed: true} : {}),
                ...(scale.trim() ? {unit_scale: Number(scale), units_confirmed: true} : {}),
              }
            : r,
        ),
      })),
    }));
    setError("");
    setMessage(`Selected metadata confirmed for ${ids.length} records.`);
  }
  return (
    <Card>
      <h2>Document extraction suggestions</h2>
      <p className="my-3 text-sm text-mist">
        {reviewed.length} pending records · {ids.length} selected. Selection is
        retained across pages and filters.
      </p>
      <Notice>
        Review source excerpts and confirm units before approval. Acceptance is
        not independent verification.
      </Notice>
      {error && <Notice kind="error">{error}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      <div className="my-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            setSelected(new Set(reviewed.map((r) => r.record.record_id)))
          }
        >
          Select All
        </Button>
        <Button variant="secondary" onClick={() => setSelected(new Set())}>
          Deselect All
        </Button>
        <Button
          disabled={!ids.length}
          onClick={() => setPreview(approvalPreview(workspace, ids))}
        >
          Approve Selected
        </Button>
        <Button
          disabled={!reviewed.length}
          onClick={() =>
            setPreview(
              approvalPreview(
                workspace,
                reviewed.map((r) => r.record.record_id),
              ),
            )
          }
        >
          Approve All Eligible
        </Button>
      </div>
      <div className="my-4 grid gap-3 sm:grid-cols-3">
        <Field
          label="Confirmed currency"
          value={currency}
          maxLength={3}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
        />
        <Field
          label="Confirmed unit scale"
          type="number"
          step="any"
          placeholder="Enter verified scale"
          value={scale}
          onChange={(e) => setScale(e.target.value)}
        />
        <Button variant="secondary" disabled={!ids.length} onClick={verify}>
          Confirm Units for Selected
        </Button>
      </div>
      <p className="mb-4 text-xs text-mist">
        Leave a field blank to keep its existing setting and verification status.
        Apply only after checking the original statement. This updates metadata;
        it does not convert currencies or rescale entered values.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Select
          label="Reporting year"
          value={year}
          onChange={(e) => {
            setYear(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All years</option>
          {[...new Set(reviewed.map((r) => r.record.period.slice(0, 4)))]
            .sort()
            .map((v) => (
              <option key={v}>{v}</option>
            ))}
        </Select>
        <Select
          label="Financial metric"
          value={metric}
          onChange={(e) => {
            setMetric(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All metrics</option>
          {[...new Set(reviewed.map((r) => r.record.metric))].map((v) => (
            <option key={v} value={v}>
              {formatFinancialLabel(v)}
            </option>
          ))}
        </Select>
        <Select
          label="Source document"
          value={document}
          onChange={(e) => {
            setDocument(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All documents</option>
          {workspace.documents.map((d) => (
            <option key={d.identifier} value={d.identifier}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select
          label="Approval eligibility"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {["eligible", "unverified", "invalid", "duplicate", "conflict"].map(
            (v) => (
              <option key={v} value={v}>
                {formatFinancialLabel(v)}
              </option>
            ),
          )}
        </Select>
        <Select
          label="Validation issues"
          value={issue}
          onChange={(e) => {
            setIssue(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All issues</option>
          {[...new Set(reviewed.flatMap((r) => r.issues))].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
      </div>
      <div className="table-wrap mt-4">
        <table className="data-table">
          <thead>
            <tr>
              {[
                "Select",
                "Metric",
                "Period",
                "Value",
                "Unit Scale",
                "Currency",
                "Source",
                "Confidence",
                "Review",
                "Actions",
              ].map((v) => (
                <th key={v}>{v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(({ record: r, status: s, issues }, index) => (
              <tr key={r.record_id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select suggestion ${r.record_id}`}
                    checked={selected.has(r.record_id)}
                    onChange={(e) =>
                      setSelected((old) => {
                        const next = new Set(old);
                        if (e.target.checked) next.add(r.record_id);
                        else next.delete(r.record_id);
                        return next;
                      })
                    }
                  />
                </td>
                {(
                  [
                    "metric",
                    "period",
                    "value",
                    "unit_scale",
                    "currency",
                  ] as const
                ).map((field) => (
                  <td key={field}>
                    {field === "metric" ? (
                      <select
                        className="field min-w-48"
                        aria-label={`Review Metric suggestion ${index + 1}`}
                        value={r.metric}
                        onChange={(e) =>
                          edit(r.record_id, field, e.target.value)
                        }
                      >
                        {[...new Set([...ledgerMetrics, r.metric])].map((v) => (
                          <option key={v} value={v}>
                            {formatFinancialLabel(v)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="field w-28"
                        aria-label={`Review ${formatFinancialLabel(field)} suggestion ${index + 1}`}
                        type={
                          field === "value" || field === "unit_scale"
                            ? "number"
                            : "text"
                        }
                        step="any"
                        value={r[field] ?? ""}
                        onChange={(e) =>
                          edit(
                            r.record_id,
                            field,
                            field === "currency"
                              ? e.target.value.toUpperCase()
                              : e.target.value,
                          )
                        }
                      />
                    )}
                  </td>
                ))}
                <td>
                  <details className="max-w-72 whitespace-normal">
                    <summary>
                      {r.documentName}, p. {r.page}
                    </summary>
                    <p>{r.quote || "Source excerpt not retained."}</p>
                  </details>
                </td>
                <td>{formatPercent(r.confidence)}</td>
                <td className="max-w-72 whitespace-normal">
                  <span
                    className={s === "eligible" ? "text-teal" : "text-gold"}
                  >
                    {formatFinancialLabel(s)}
                  </span>
                  {issues.map((text) => (
                    <p key={text} className="text-xs">
                      {text}
                    </p>
                  ))}
                </td>
                <td>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setPreview(approvalPreview(workspace, [r.record_id]))
                    }
                  >
                    Accept
                  </Button>
                  <button
                    className="ml-3 text-sm text-mist"
                    onClick={() => setDiscard(r.record_id)}
                  >
                    Remove suggestion
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <p className="my-3 text-sm text-mist">No matching pending records.</p>
      )}
      <div className="my-4 flex flex-wrap items-center gap-3">
        <Select
          label="Rows per page"
          value={size}
          onChange={(e) => {
            setSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {[25, 50, 100].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
        <span>
          Page {currentPage} of {pages} · {filtered.length} matching records
        </span>
        <Button
          variant="secondary"
          disabled={currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={currentPage >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </Button>
      </div>
      <Link href="/financials" className="text-sm text-teal underline">
        Continue to Financial Analysis
      </Link>
      {preview && (
        <ConfirmationDialog
          title="Review Approval"
          confirmLabel="Approve Eligible Records"
          disabled={
            !preview.eligible.length || preview.revision !== workspace.revision
          }
          onCancel={() => setPreview(null)}
          onConfirm={() => {
            updateWorkspace((w) => applyApproval(w, preview));
            setSelected(
              (old) =>
                new Set(
                  [...old].filter(
                    (id) =>
                      !preview.eligible.some((r) => r.record.record_id === id),
                  ),
                ),
            );
            setMessage(
              `${preview.eligible.length} records approved. Excluded records remain pending.`,
            );
            setPreview(null);
          }}
        >
          <dl className="grid grid-cols-2 gap-2">
            <dt>Total records selected</dt>
            <dd>{preview.total}</dd>
            <dt>Eligible for approval</dt>
            <dd>{preview.eligible.length}</dd>
            <dt>Requiring review</dt>
            <dd>{preview.total - preview.eligible.length}</dd>
            <dt>Duplicate records</dt>
            <dd>
              {preview.records.filter((r) => r.status === "duplicate").length}
            </dd>
            <dt>Missing or invalid information</dt>
            <dd>
              {preview.records.filter((r) => r.status === "invalid").length}
            </dd>
            <dt>Unverified units</dt>
            <dd>
              {preview.records.filter((r) => r.status === "unverified").length}
            </dd>
            <dt>Existing financial ledger conflicts</dt>
            <dd>
              {
                preview.records.filter((r) =>
                  r.issues.some((issue) => issue.startsWith("Existing ledger")),
                ).length
              }
            </dd>
            <dt>Conflicting pending records</dt>
            <dd>
              {
                preview.records.filter((r) =>
                  r.issues.some((issue) => issue.startsWith("Pending records")),
                ).length
              }
            </dd>
          </dl>
          <p className="text-sm">
            Currency / scale:{" "}
            {[
              ...new Set(
                preview.records.map(
                  (r) => `${r.record.currency} / ${r.record.unit_scale}`,
                ),
              ),
            ].join(", ") || "None"}
          </p>
          <Notice>
            Approval records your acceptance of the extracted information, not
            independent verification. Excluded records remain available for
            correction.
          </Notice>
          {preview.revision !== workspace.revision && (
            <Notice kind="warning">
              Data changed. Cancel and review a new summary.
            </Notice>
          )}
        </ConfirmationDialog>
      )}
      {discard && (
        <ConfirmationDialog
          title="Remove Pending Suggestion"
          confirmLabel="Remove Suggestion"
          onCancel={() => setDiscard(null)}
          onConfirm={() => {
            updateWorkspace((w) => ({
              ...w,
              documents: w.documents.map((d) => ({
                ...d,
                suggestions: d.suggestions.filter(
                  (r) => r.record_id !== discard,
                ),
              })),
            }));
            setDiscard(null);
          }}
        >
          <p>
            The source document and approved ledger figures will remain stored.
          </p>
        </ConfirmationDialog>
      )}
    </Card>
  );
}
