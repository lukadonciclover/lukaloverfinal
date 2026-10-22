"use client";
import { useWorkspace } from "@/lib/workspace";
import {
  financialMetrics,
  formatFinancialLabel,
  formatFinancialValue,
} from "@/lib/financial-formatting";
import type { NumericRow } from "@/lib/workbench";
export function FinancialDataTable({
  rows,
  scale = 1,
  caption,
}: {
  rows: NumericRow[];
  scale?: number;
  caption?: string;
}) {
  const { workspace } = useWorkspace();
  const keys = [...new Set(rows.flatMap(Object.keys))];
  if (!rows.length)
    return (
      <p className="py-5 text-sm text-mist">
        Complete the required assumptions to generate results.
      </p>
    );
  return (
    <div
      className="table-wrap mt-4"
      tabIndex={0}
      aria-label={caption ?? "Financial results"}
    >
      <table className="data-table">
        {caption && (
          <caption className="p-3 text-left text-sm text-mist">
            {caption}
          </caption>
        )}
        <thead>
          <tr>
            {keys.map((key) => (
              <th
                scope="col"
                className={
                  financialMetrics[key] || rows.some((row) => typeof row[key] === "number")
                    ? "numeric"
                    : ""
                }
                key={key}
              >
                {formatFinancialLabel(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {keys.map((key) => (
                <td
                  key={key}
                  className={
                    typeof row[key] === "number" || row[key] == null
                      ? "numeric"
                      : ""
                  }
                >
                  {formatFinancialValue(key, row[key], {
                    currency: workspace.company.currency,
                    scale,
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
