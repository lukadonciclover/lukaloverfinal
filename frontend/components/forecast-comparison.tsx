"use client";
import { useWorkspace } from "@/lib/workspace";
import {
  historicalCandidates,
  referencesCurrent,
} from "@/lib/historical-references";
import { currentValue } from "@/lib/assumptions";
import {
  formatFinancialLabel,
  formatFinancialValue,
} from "@/lib/financial-formatting";
import { Card } from "./ui";
export function ForecastComparison() {
  const { workspace: w } = useWorkspace();
  const rows = historicalCandidates(w, "forecast");
  return (
    <details className="my-5">
      <summary className="cursor-pointer font-semibold">
        Compare Forecast Assumptions with History
      </summary>
      <Card className="mt-3">
        {!referencesCurrent(w) ? (
          <p>
            Recalculate Financial Analysis to compare current historical
            references.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Financial Driver</th>
                  <th>Latest Historical Ratio</th>
                  <th>Historical Average</th>
                  <th>Forecast Assumption</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const metric = p.target.split(".")[1];
                  const average = w.historicalReferences?.averages.find(
                    (a) => a.source.id === p.source.id,
                  );
                  const latest = average?.observations.at(-1)?.value ?? null;
                  const current = currentValue(w, p.target);
                  const delta = current === null ? null : current - p.value;
                  return (
                    <tr key={p.target}>
                      <td>{formatFinancialLabel(metric)}</td>
                      <td>{formatFinancialValue(metric, latest)}</td>
                      <td>{formatFinancialValue(metric, p.value)}</td>
                      <td>{formatFinancialValue(metric, current)}</td>
                      <td>
                        {formatFinancialValue(metric, delta)}
                        {delta !== null && Math.abs(delta) >= 0.1
                          ? " · Review deviation (10 percentage points or more)"
                          : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-mist">
          Differences are review prompts, not forecast limits. No assumptions
          are changed automatically.
        </p>
      </Card>
    </details>
  );
}
