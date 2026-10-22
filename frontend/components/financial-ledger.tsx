"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FinancialFigure } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Notice, formatPercent } from "@/components/ui";
import { FinancialReview } from "./financial-review";
import { LedgerBulkTools } from "./ledger-bulk-tools";
import {
  ensureRecordIds,
  ledgerMetrics as metrics,
  modifyFigure,
} from "@/lib/bulk-approval";
import { formatFinancialLabel } from "@/lib/financial-formatting";
export function FinancialLedger() {
  const { project } = useWorkspace();
  return <LedgerContent key={project.id} />;
}
function LedgerContent() {
  const { workspace, updateWorkspace } = useWorkspace();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    updateWorkspace(ensureRecordIds);
  }, [workspace.documents, workspace.figures, updateWorkspace]);
  function editFigure(id: string, field: keyof FinancialFigure, value: string) {
    updateWorkspace((w) => ({
      ...w,
      figures: w.figures.map((row) =>
        row.record_id === id
          ? modifyFigure(row, {
              [field]:
                field === "value"
                  ? value === ""
                    ? null
                    : Number(value)
                  : field === "unit_scale"
                    ? value === ""
                      ? 1
                      : Number(value)
                    : value,
            })
          : row,
      ),
    }));
  }
  return (
    <div className="space-y-5">
      <FinancialReview />
      <LedgerBulkTools selected={selected} setSelected={setSelected} />
      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Financial ledger</p>
            <h2 className="mt-1 text-xl font-semibold">
              Historical financial data and origins
            </h2>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              updateWorkspace((current) => ({
                ...current,
                figures: [
                  ...current.figures,
                  {
                    record_id: crypto.randomUUID(),
                    company_id: current.company.id,
                    metric: "revenue",
                    period: String(current.company.latest_financial_year ?? ""),
                    value: null,
                    currency: current.company.currency,
                    unit_scale: 1,
                    origin: "user-supplied",
                    notes: "",
                  },
                ],
              }))
            }
          >
            <Plus size={15} /> Add row
          </Button>
        </div>
        <p className="mb-3 text-xs text-mist">
          Values retain their entered currency and scale. Leave missing values
          blank.
        </p>
        {!workspace.figures.length && (
          <p className="mb-3 text-sm text-mist">
            No financial data available. Add a row or upload financial
            statements.
          </p>
        )}
        <div className="table-wrap max-h-[520px] overflow-y-auto">
          <table className="data-table">
            <thead className="sticky top-0">
              <tr>
                <th>Select</th>
                <th>Metric</th>
                <th>Period</th>
                <th>Value</th>
                <th>Currency</th>
                <th>Scale</th>
                <th>Origin</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {workspace.figures.map((figure, index) => (
                <tr key={figure.record_id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ledger row ${index + 1}`}
                      checked={selected.has(figure.record_id ?? "")}
                      onChange={(e) =>
                        setSelected((old) => {
                          const next = new Set(old);
                          if (e.target.checked) next.add(figure.record_id!);
                          else next.delete(figure.record_id!);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Metric row ${index + 1}`}
                      className="field min-w-44"
                      value={figure.metric}
                      onChange={(e) =>
                        editFigure(figure.record_id!, "metric", e.target.value)
                      }
                    >
                      {[...new Set([...metrics, figure.metric])].map(
                        (metric) => (
                          <option key={metric} value={metric}>
                            {formatFinancialLabel(metric)}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`Period row ${index + 1}`}
                      className="field w-24"
                      value={figure.period}
                      onChange={(e) =>
                        editFigure(figure.record_id!, "period", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Value row ${index + 1}`}
                      className="field w-28"
                      type="number"
                      step="any"
                      value={figure.value ?? ""}
                      onChange={(e) =>
                        editFigure(figure.record_id!, "value", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Currency row ${index + 1}`}
                      className="field w-20"
                      value={figure.currency}
                      onChange={(e) =>
                        editFigure(
                          figure.record_id!,
                          "currency",
                          e.target.value.toUpperCase(),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Scale row ${index + 1}`}
                      className="field w-28"
                      type="number"
                      min="1"
                      value={figure.unit_scale}
                      onChange={(e) =>
                        editFigure(
                          figure.record_id!,
                          "unit_scale",
                          e.target.value,
                        )
                      }
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Origin row ${index + 1}`}
                      className="field min-w-32"
                      value={figure.origin}
                      onChange={(e) =>
                        editFigure(figure.record_id!, "origin", e.target.value)
                      }
                    >
                      {[
                        "reported",
                        "derived",
                        "user-supplied",
                        "ai-estimate",
                      ].map((origin) => (
                        <option key={origin} value={origin}>
                          {origin === "ai-estimate"
                            ? "Unverified estimate"
                            : formatFinancialLabel(origin)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td
                    className="max-w-48 truncate"
                    title={figure.source?.quote}
                  >
                    {figure.source
                      ? `${figure.source.document_name}${figure.source.page ? `, p. ${figure.source.page}` : ""}`
                      : "No source"}
                    {figure.source && figure.origin === "user-supplied" && (
                      <p className="text-xs text-gold">
                        Modified; original source retained
                      </p>
                    )}
                  </td>
                  <td>
                    <button
                      aria-label="Delete figure"
                      className="min-h-10 min-w-10 text-mist hover:text-red-300"
                      onClick={() => {
                        if (window.confirm("Delete this financial figure?"))
                          updateWorkspace((w) => ({
                            ...w,
                            figures: w.figures.filter(
                              (row) => row.record_id !== figure.record_id,
                            ),
                          }));
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
