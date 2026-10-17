"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, Plus, Trash2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import type { FinancialFigure, FigureSuggestion } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Notice, PageHeader, formatNumber, formatPercent } from "@/components/ui";

type AnalysisResponse = { analysis: Array<Record<string, number | string | null>>; quality_issues: string[]; formulas: Record<string, string> };
const metrics = ["revenue", "cost_of_goods_sold", "gross_profit", "operating_expenses", "ebitda", "ebit", "interest_expense", "tax_expense", "net_income", "cash", "short_term_investments", "total_assets", "current_assets", "current_liabilities", "total_liabilities", "short_term_debt", "long_term_debt", "total_equity", "net_working_capital", "operating_cash_flow", "capital_expenditure", "investing_cash_flow", "financing_cash_flow", "free_cash_flow"];

export function FinancialsPage() {
  const { workspace, updateWorkspace } = useWorkspace();
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const suggestions = workspace.documents.flatMap((document) => document.suggestions.map((item) => ({ ...item, documentName: document.name, documentId: document.identifier })));
  const history = useMemo(() => {
    const periods = [...new Set(workspace.figures.map((figure) => figure.period))].sort();
    return periods.map((period) => ({ period, ...Object.fromEntries(workspace.figures.filter((figure) => figure.period === period).map((figure) => [figure.metric, figure.value])) }));
  }, [workspace.figures]);

  function editFigure(index: number, field: keyof FinancialFigure, value: string) {
    updateWorkspace((current) => ({ ...current, figures: current.figures.map((figure, itemIndex) => itemIndex === index ? { ...figure, [field]: field === "value" || field === "unit_scale" ? (value === "" ? null : Number(value)) : value } : figure) }));
  }
  function acceptSuggestion(item: FigureSuggestion & { documentName: string; documentId: string }) {
    const figure: FinancialFigure = { company_id: workspace.company.id, metric: item.metric, period: item.period || String(workspace.company.latest_financial_year ?? ""), value: item.value, currency: item.currency, unit_scale: item.unit_scale, origin: "reported", source: { document_name: item.documentName, page: item.page, quote: item.quote, reporting_period: item.period, currency: item.currency, unit_scale: item.unit_scale, confidence: item.confidence }, notes: "Accepted document extraction suggestion." };
    updateWorkspace((current) => ({ ...current, figures: [...current.figures.filter((existing) => !(existing.metric === figure.metric && existing.period === figure.period)), figure], documents: current.documents.map((document) => document.identifier === item.documentId ? { ...document, suggestions: document.suggestions.filter((suggestion) => suggestion !== item && !(suggestion.metric === item.metric && suggestion.page === item.page && suggestion.quote === item.quote)) } : document) }));
  }
  async function runAnalysis() {
    setLoading(true); setError("");
    try { setAnalysis(await apiPost<AnalysisResponse>("/v1/financials/analyze", { figures: workspace.figures })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Analysis failed."); }
    finally { setLoading(false); }
  }

  return (
    <>
      <PageHeader kicker="Financial statement analysis" title="Audit the history before forecasting it." description="Edit verified figures, preserve missing values, review source provenance, and calculate performance with the Python engine." actions={<Button loading={loading} onClick={runAnalysis}>Calculate performance</Button>} />
      {error && <Notice kind="error">{error}</Notice>}
      {suggestions.length > 0 && <Card className="mb-5"><p className="eyebrow">Pending review</p><h2 className="mt-1 text-xl font-semibold">Document extraction suggestions</h2><Notice kind="warning"><span className="font-semibold">Review required.</span> Suggestions do not affect calculations until accepted.</Notice><div className="table-wrap mt-4"><table className="data-table"><thead><tr><th>Metric</th><th>Period</th><th>Value</th><th>Scale</th><th>Source</th><th>Confidence</th><th></th></tr></thead><tbody>{suggestions.slice(0, 50).map((item, index) => <tr key={`${item.documentId}-${item.page}-${index}`}><td>{item.metric}</td><td>{item.period || "Missing"}</td><td>{formatNumber(item.value, 2)}</td><td>{formatNumber(item.unit_scale, 0)}</td><td className="max-w-72 truncate" title={item.quote}>{item.documentName}, p. {item.page}</td><td>{formatPercent(item.confidence)}</td><td><Button variant="secondary" onClick={() => acceptSuggestion(item)}><Check size={14}/> Accept</Button></td></tr>)}</tbody></table></div></Card>}
      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Verified ledger</p><h2 className="mt-1 text-xl font-semibold">Historical financial data</h2></div><Button variant="secondary" onClick={() => updateWorkspace((current) => ({ ...current, figures: [...current.figures, { company_id: current.company.id, metric: "revenue", period: String(current.company.latest_financial_year ?? ""), value: null, currency: current.company.currency, unit_scale: 1, origin: "user-supplied", notes: "" }] }))}><Plus size={15}/> Add row</Button></div>
        <div className="table-wrap max-h-[520px] overflow-y-auto"><table className="data-table"><thead className="sticky top-0"><tr><th>Metric</th><th>Period</th><th>Value</th><th>Currency</th><th>Scale</th><th>Origin</th><th>Source</th><th></th></tr></thead><tbody>{workspace.figures.map((figure, index) => <tr key={`${figure.metric}-${figure.period}-${index}`}><td><select className="field min-w-44" value={figure.metric} onChange={(e) => editFigure(index, "metric", e.target.value)}>{metrics.map((metric) => <option key={metric}>{metric}</option>)}</select></td><td><input className="field w-24" value={figure.period} onChange={(e) => editFigure(index, "period", e.target.value)}/></td><td><input className="field w-28" type="number" step="any" value={figure.value ?? ""} onChange={(e) => editFigure(index, "value", e.target.value)}/></td><td><input className="field w-20" value={figure.currency} onChange={(e) => editFigure(index, "currency", e.target.value.toUpperCase())}/></td><td><input className="field w-28" type="number" value={figure.unit_scale} onChange={(e) => editFigure(index, "unit_scale", e.target.value)}/></td><td><select className="field min-w-32" value={figure.origin} onChange={(e) => editFigure(index, "origin", e.target.value)}>{["reported", "derived", "user-supplied", "ai-estimate"].map((origin) => <option key={origin}>{origin}</option>)}</select></td><td className="max-w-48 truncate" title={figure.source?.quote}>{figure.source ? `${figure.source.document_name}${figure.source.page ? `, p. ${figure.source.page}` : ""}` : "No source"}</td><td><button aria-label="Delete figure" className="text-mist hover:text-red-300" onClick={() => updateWorkspace((current) => ({ ...current, figures: current.figures.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div>
      </Card>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card><p className="eyebrow">Operating record</p><h2 className="mt-1 text-xl font-semibold">Revenue, EBIT and cash flow</h2><div className="mt-4 h-80"><ResponsiveContainer width="100%" height="100%"><LineChart data={history}><CartesianGrid stroke="#1d3341" vertical={false}/><XAxis dataKey="period" stroke="#8fa6b3" fontSize={11}/><YAxis stroke="#8fa6b3" fontSize={11}/><Tooltip contentStyle={{ background: "#0d1821", border: "1px solid #1d3341" }}/><Legend/><Line type="monotone" dataKey="revenue" stroke="#45b6ad" strokeWidth={2}/><Line type="monotone" dataKey="ebit" stroke="#d4a84f" strokeWidth={2}/><Line type="monotone" dataKey="operating_cash_flow" stroke="#7d8fff" strokeWidth={2}/></LineChart></ResponsiveContainer></div></Card>
        <Card><p className="eyebrow">Calculated output</p><h2 className="mt-1 text-xl font-semibold">Latest performance ratios</h2>{!analysis ? <p className="mt-6 text-sm text-mist">Run Calculate performance to use the Python financial engine.</p> : <><div className="mt-5 grid grid-cols-2 gap-3">{Object.entries(analysis.analysis.at(-1) ?? {}).filter(([key]) => key !== "period").map(([key, value]) => <div key={key} className="border-b border-line pb-2"><p className="text-[10px] uppercase tracking-wider text-mist">{key.replaceAll("_", " ")}</p><p className="mt-1 font-semibold tabular-nums">{key.includes("margin") || key.includes("return") || key.includes("growth") || key === "cash_conversion" ? formatPercent(value as number | null) : formatNumber(value as number | null, 2)}</p></div>)}</div>{analysis.quality_issues.map((issue) => <div key={issue} className="mt-3"><Notice kind="warning">{issue}</Notice></div>)}</>}</Card>
      </div>
    </>
  );
}
