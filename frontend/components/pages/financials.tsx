"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Notice, PageHeader } from "@/components/ui";
import { FinancialDataTable } from "@/components/financial-data-table";
import { FinancialLineChart } from "@/components/financial-chart";
import { financialFingerprint } from "@/lib/fingerprint";
import {
  financialUnit,
  formatFinancialLabel,
  formatFinancialValue,
  formatFinancialMessage,
} from "@/lib/financial-formatting";
type AnalysisResponse = {
  analysis: Array<Record<string, number | string | null>>;
  quality_issues: string[];
  formulas: Record<string, string>;
};
export function FinancialsPage() {
  const { workspace, updateWorkspace, hydrated } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const figureHash = financialFingerprint(workspace.figures);
  const analysis =
    workspace.financialAnalysis?.input_hash === figureHash
      ? workspace.financialAnalysis
      : null;
  const currentHashRef = useRef(figureHash);
  currentHashRef.current = figureHash;
  const currency = workspace.company.currency;
  const currencyMismatch = workspace.figures.some(
    (f) => f.currency !== currency,
  );
  // The analysis endpoint returns monetary fields in the largest ledger scale.
  // Convert only displayed monetary amounts; ratios are dimensionless.
  const analysisScale = workspace.figures.length
    ? Math.max(...workspace.figures.map((f) => f.unit_scale))
    : 1;
  const history = useMemo(() => {
    if (currencyMismatch) return [];
    const periods = [...new Set(workspace.figures.map((f) => f.period))].sort();
    return periods.map((period) => ({
      period,
      ...Object.fromEntries(
        workspace.figures
          .filter((f) => f.period === period)
          .map((f) => [
            f.metric,
            f.value === null ? null : f.value * f.unit_scale,
          ]),
      ),
    }));
  }, [workspace.figures, currencyMismatch]);
  async function runAnalysis() {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const requestedHash = figureHash;
    setLoading(true);
    setError("");
    try {
      const response = await apiPost<AnalysisResponse>(
        "/v1/financials/analyze",
        { figures: workspace.figures },
        { signal: controller.signal },
      );
      if (requestedHash === currentHashRef.current)
        updateWorkspace((current) => ({
          ...current,
          financialAnalysis: {
            ...response,
            input_hash: requestedHash,
            created_at: new Date().toISOString(),
          },
        }));
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : "Analysis failed.");
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }
  useEffect(() => {
    requestRef.current?.abort();
    if (!hydrated || !workspace.figures.length || currencyMismatch || analysis)
      return;
    const timer = window.setTimeout(() => {
      void runAnalysis();
    }, 400);
    return () => {
      window.clearTimeout(timer);
      requestRef.current?.abort();
    };
  }, [
    analysis,
    figureHash,
    hydrated,
    workspace.figures.length,
    currencyMismatch,
  ]);

  const analysisRows = currencyMismatch ? [] : (analysis?.analysis ?? []);
  return (
    <>
      <PageHeader
        title="Financial Analysis"
        actions={
          <Button
            disabled={!workspace.figures.length || currencyMismatch}
            loading={loading}
            onClick={runAnalysis}
          >
            Calculate performance
          </Button>
        }
      />
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
      {!analysis && workspace.financialAnalysis && (
        <Notice kind="warning">
          Financial data changed. Recalculate performance to refresh the
          results.
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
            <p className="mt-2 text-xs text-mist">All calculated metrics are available in Historical Performance below.</p>
              {!analysis ? (
                <p className="mt-4 text-sm text-mist">
                  {loading
                    ? "Calculating performance..."
                    : "Calculate performance to view analysis."}
                </p>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {Object.entries(analysis.analysis.at(-1) ?? {})
                    .filter(([key]) => ["revenue_growth","gross_margin","ebitda_margin","net_profit_margin","return_on_equity","return_on_invested_capital","current_ratio","net_debt"].includes(key))
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
