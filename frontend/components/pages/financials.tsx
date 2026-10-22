"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useFinancialAnalysis } from "@/lib/use-financial-analysis";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Notice, PageHeader } from "@/components/ui";
import { FinancialDataTable } from "@/components/financial-data-table";
import { FinancialLineChart } from "@/components/financial-chart";
import {
  financialUnit,
  formatFinancialLabel,
  formatFinancialValue,
  formatFinancialMessage,
} from "@/lib/financial-formatting";
export function FinancialsPage() {
  const { workspace } = useWorkspace();
  const {
    loading,
    error,
    completed,
    run,
    hash: figureHash,
  } = useFinancialAnalysis();
  const current =
    workspace.financialAnalysis?.input_hash === figureHash &&
    (!workspace.financialAnalysis.currency ||
      workspace.financialAnalysis.currency === workspace.company.currency);
  const analysis = workspace.financialAnalysis;
  const currency = workspace.company.currency;
  const currencyMismatch = workspace.figures.some(
    (f) => f.currency !== currency,
  );
  // The analysis endpoint returns monetary fields in the largest ledger scale.
  // Convert only displayed monetary amounts; ratios are dimensionless.
  const analysisScale =
    analysis?.unit_scale ??
    (workspace.figures.length
      ? Math.max(...workspace.figures.map((f) => f.unit_scale))
      : 1);
  const history = useMemo(() => {
    if (currencyMismatch) return [];
    const periods = [...new Set(workspace.figures.map((f) => f.period))].sort();
    return periods.map((period) => ({
      period,
      ...Object.fromEntries(
        workspace.figures
          .filter(
            (f) =>
              f.period === period &&
              workspace.figures.filter(
                (other) => other.period === period && other.metric === f.metric,
              ).length === 1,
          )
          .map((f) => [
            f.metric,
            f.value === null ? null : f.value * f.unit_scale,
          ]),
      ),
    }));
  }, [workspace.figures, currencyMismatch]);
  const analysisRows = currencyMismatch ? [] : (analysis?.analysis ?? []);
  return (
    <>
      <PageHeader
        title="Financial Analysis"
        actions={
          <Button
            disabled={!workspace.figures.length || currencyMismatch}
            loading={loading}
            onClick={() => void run(true)}
          >
            {loading
              ? "Calculating..."
              : current
                ? "Recalculate Performance"
                : "Calculate Performance"}
          </Button>
        }
      />
      <div className="mb-4 space-y-2" role="status" aria-live="polite">
        <p>
          {loading
            ? "Calculating financial performance..."
            : completed ||
              (current ? "Analysis is up to date" : "Ready to calculate")}
        </p>
        {current && completed && <p>Analysis is up to date</p>}
        {analysis && (
          <p className="text-sm text-mist">
            Latest successful calculation:{" "}
            {new Date(analysis.created_at).toLocaleString()} |{" "}
            {workspace.company.name} |{" "}
            {analysis.analysis.map((row) => row.period).join(", ")}
          </p>
        )}
        {workspace.historicalReferences && (
          <p className="text-sm">
            Historical averages:{" "}
            {
              workspace.historicalReferences.averages.filter(
                (a) => a.value !== null,
              ).length
            }{" "}
            available;{" "}
            {
              workspace.historicalReferences.averages.filter(
                (a) => a.value === null,
              ).length
            }{" "}
            unavailable. Review missing inputs in Forecasting.
          </p>
        )}
      </div>
      {current && (
        <Link
          href="/forecasting"
          className="mb-4 block text-sm text-teal underline"
        >
          Review Forecast Assumptions
        </Link>
      )}
      <div className="mb-4">
        <Link className="text-sm text-teal underline" href="/workspace">
          Edit financial data
        </Link>
      </div>
      {error && <Notice kind="error">{formatFinancialMessage(error)}</Notice>}
      {currencyMismatch && (
        <Notice kind="warning">
          Financial data currency differs from the project currency. Correct the
          currencies in Financial Data before comparing results.
        </Notice>
      )}
      {!current && workspace.financialAnalysis && (
        <Notice kind="warning">
          Previously calculated results are stale. Recalculate performance to
          refresh them.
        </Notice>
      )}
      {!workspace.figures.length ? (
        <Card>
          <p className="text-sm text-mist">
            Add financial data to view performance analysis.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <h2>Revenue, EBIT and Cash Flow</h2>
              <FinancialLineChart
                rows={history}
                metrics={["revenue", "ebit", "operating_cash_flow"]}
                currency={currency}
              />
            </Card>
            <Card>
              <h2>Latest Key Ratios</h2>
              <p className="mt-2 text-xs text-mist">
                All calculated metrics are available in Historical Performance
                below.
              </p>
              {!analysis ? (
                <p className="mt-4 text-sm text-mist">
                  {loading
                    ? "Calculating performance..."
                    : "Calculate performance to view analysis."}
                </p>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {Object.entries(analysis.analysis.at(-1) ?? {})
                    .filter(([key]) =>
                      [
                        "revenue_growth",
                        "gross_margin",
                        "ebitda_margin",
                        "net_profit_margin",
                        "return_on_equity",
                        "return_on_invested_capital",
                        "current_ratio",
                        "net_debt",
                      ].includes(key),
                    )
                    .map(([key, value]) => (
                      <div key={key} className="border-b border-line pb-3">
                        <p className="text-xs text-mist">
                          {formatFinancialLabel(key)}
                        </p>
                        <p className="mt-1 font-semibold tabular-nums">
                          {formatFinancialValue(
                            key,
                            currencyMismatch &&
                              financialUnit(key) === "currency"
                              ? null
                              : value,
                            { currency, scale: analysisScale },
                          )}
                        </p>
                        {value === null && (
                          <p className="mt-2 text-xs text-mist">
                            {analysis.unavailable_reasons?.[
                              String(analysis.analysis.at(-1)?.period)
                            ]?.[key] ??
                              "Required approved inputs are missing or the denominator is not valid. Review Financial Data."}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </Card>
          </div>
          {analysis?.quality_issues.map((issue) => (
            <div className="mt-3" key={issue}>
              <Notice kind="warning">{formatFinancialMessage(issue)}</Notice>
            </div>
          ))}
          {analysis && (
            <Card className="mt-5">
              <h2>Historical Performance</h2>
              <FinancialDataTable
                rows={analysisRows}
                scale={analysisScale}
                caption={
                  currency +
                  " - amounts in actual units; ratios shown as percentages or multiples"
                }
              />
            </Card>
          )}
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {[
              {
                title: "Profitability Trends",
                rows: analysisRows,
                metrics: [
                  "gross_margin",
                  "ebitda_margin",
                  "operating_margin",
                  "net_profit_margin",
                ],
              },
              {
                title: "Capital Structure",
                rows: history,
                metrics: [
                  "cash",
                  "short_term_debt",
                  "long_term_debt",
                  "total_equity",
                ],
              },
              {
                title: "Cash Flow Trends",
                rows: history,
                metrics: [
                  "operating_cash_flow",
                  "capital_expenditure",
                  "investing_cash_flow",
                  "financing_cash_flow",
                ],
              },
            ].map((chart) => (
              <Card key={chart.title}>
                <h2>{chart.title}</h2>
                <FinancialLineChart
                  rows={chart.rows}
                  metrics={chart.metrics}
                  currency={currency}
                />
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
