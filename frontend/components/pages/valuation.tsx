"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import type { Comparable, DCFInputs, DCFResult } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Field, Notice, PageHeader, Stat, formatMoney, formatNumber, formatPercent } from "@/components/ui";

type ComparablesResponse = { multiples: Array<Record<string, number | string | null>>; statistics: Array<Record<string, number | string | null>> };

export function ValuationPage() {
  const { workspace, updateWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [peerOutput, setPeerOutput] = useState<ComparablesResponse | null>(null);
  const inputs = workspace.dcfInputs;
  const updateInput = <K extends keyof DCFInputs>(key: K, value: DCFInputs[K]) => updateWorkspace((current) => ({ ...current, dcfInputs: { ...current.dcfInputs, [key]: value } }));
  const updateYear = (key: keyof Pick<DCFInputs, "revenue_growth" | "ebit_margin" | "tax_rate" | "depreciation_pct_revenue" | "capex_pct_revenue" | "nwc_pct_revenue">, index: number, value: number) => updateInput(key, inputs[key].map((item, itemIndex) => itemIndex === index ? value : item));

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const result = await apiPost<DCFResult>("/v1/valuation/dcf", inputs);
        updateWorkspace((current) => ({ ...current, dcfResult: result }));
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Valuation failed."); }
      finally { setLoading(false); }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [inputs, updateWorkspace]);

  const scenarioData = workspace.dcfResult ? Object.entries(workspace.dcfResult.scenarios).map(([scenario, result]) => ({ scenario, equity: result.equity_value, share: result.implied_share_value })) : [];
  function editComparable(index: number, key: keyof Comparable, value: string) { updateWorkspace((current) => ({ ...current, comparables: current.comparables.map((row, itemIndex) => itemIndex === index ? { ...row, [key]: key === "company" ? value : value === "" ? null : Number(value) } : row) })); }
  async function calculatePeers() { setError(""); try { setPeerOutput(await apiPost<ComparablesResponse>("/v1/valuation/comparables", { rows: workspace.comparables.filter((row) => row.company) })); } catch (reason) { setError(reason instanceof Error ? reason.message : "Comparable analysis failed."); } }

  return (
    <>
      <PageHeader kicker="Valuation lab" title="Make the assumptions visible." description="The Python engine recalculates after each edit using year-end discounting. WACC must exceed terminal growth." actions={<span className="flex items-center gap-2 text-xs text-mist"><span className={`h-2 w-2 rounded-full ${loading ? "animate-pulse bg-gold" : "bg-teal"}`}/>{loading ? "Recalculating" : "Model synchronized"}</span>} />
      {error && <Notice kind="error">{error}</Notice>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Enterprise value" value={formatMoney(workspace.dcfResult?.enterprise_value, workspace.company.currency)} />
        <Stat label="Equity value" value={formatMoney(workspace.dcfResult?.equity_value, workspace.company.currency)} />
        <Stat label="Implied share value" value={formatMoney(workspace.dcfResult?.implied_share_value, workspace.company.currency)} tone="positive" />
        <Stat label="Upside / downside" value={formatPercent(workspace.dcfResult?.upside_downside)} tone={(workspace.dcfResult?.upside_downside ?? 0) >= 0 ? "positive" : "warning"} />
      </div>
      <Card className="mt-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {(["base_revenue", "wacc", "terminal_growth", "cash", "debt", "minority_interest", "non_operating_assets", "diluted_shares"] as const).map((key) => <Field key={key} label={key.replaceAll("_", " ")} type="number" step="any" value={inputs[key] ?? ""} onChange={(e) => updateInput(key, (e.target.value === "" ? null : Number(e.target.value)) as never)} />)}
        </div>
        <div className="table-wrap mt-5"><table className="data-table"><thead><tr><th>Year</th><th>Revenue growth</th><th>EBIT margin</th><th>Tax rate</th><th>D&amp;A / revenue</th><th>Capex / revenue</th><th>NWC / revenue</th></tr></thead><tbody>{inputs.revenue_growth.map((_, index) => <tr key={index}><td>{index + 1}</td>{(["revenue_growth", "ebit_margin", "tax_rate", "depreciation_pct_revenue", "capex_pct_revenue", "nwc_pct_revenue"] as const).map((key) => <td key={key}><input aria-label={`${key} year ${index + 1}`} className="field w-28" type="number" step="0.005" value={inputs[key][index]} onChange={(e) => updateYear(key, index, Number(e.target.value))}/></td>)}</tr>)}</tbody></table></div>
      </Card>
      {workspace.dcfResult && <div className="mt-5 grid gap-5 xl:grid-cols-2"><Card><p className="eyebrow">Scenario dispersion</p><h2 className="mt-1 text-xl font-semibold">Bear / base / bull equity value</h2><div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={scenarioData}><CartesianGrid stroke="#1d3341" vertical={false}/><XAxis dataKey="scenario" stroke="#8fa6b3"/><YAxis stroke="#8fa6b3"/><Tooltip contentStyle={{ background: "#0d1821", border: "1px solid #1d3341" }}/><Legend/><Bar dataKey="equity" fill="#45b6ad"/><Bar dataKey="share" fill="#d4a84f"/></BarChart></ResponsiveContainer></div></Card><Card><p className="eyebrow">Sensitivity matrix</p><h2 className="mt-1 text-xl font-semibold">WACC versus terminal growth</h2><div className="table-wrap mt-4"><table className="data-table"><thead><tr><th>Terminal growth</th>{workspace.dcfResult.sensitivity.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{workspace.dcfResult.sensitivity.rows.map((row, index) => <tr key={row}><td>{row}</td>{workspace.dcfResult!.sensitivity.values[index].map((value, itemIndex) => <td key={itemIndex}>{formatNumber(value, 2)}</td>)}</tr>)}</tbody></table></div><p className="mt-3 text-xs text-mist">{workspace.dcfResult.timing_convention}</p></Card></div>}
      {workspace.dcfResult && <Card className="mt-5"><p className="eyebrow">Explicit forecast</p><h2 className="mt-1 text-xl font-semibold">Free cash flow build</h2><div className="table-wrap mt-4"><table className="data-table"><thead><tr>{Object.keys(workspace.dcfResult.forecast[0] ?? {}).map((key) => <th key={key}>{key.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{workspace.dcfResult.forecast.map((row, index) => <tr key={index}>{Object.values(row).map((value, itemIndex) => <td key={itemIndex}>{formatNumber(value, 2)}</td>)}</tr>)}</tbody></table></div></Card>}
      <Card className="mt-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Relative valuation</p><h2 className="mt-1 text-xl font-semibold">Comparable companies</h2></div><div className="flex gap-2"><Button variant="secondary" onClick={() => updateWorkspace((current) => ({ ...current, comparables: [...current.comparables, { company: "", market_cap: null, debt: null, cash: null, enterprise_value: null, revenue: null, ebitda: null, ebit: null, net_income: null }] }))}><Plus size={15}/> Add peer</Button><Button onClick={calculatePeers}>Calculate multiples</Button></div></div>
        <div className="table-wrap mt-4"><table className="data-table"><thead><tr><th>Company</th>{["market_cap", "debt", "cash", "enterprise_value", "revenue", "ebitda", "ebit", "net_income"].map((key) => <th key={key}>{key.replaceAll("_", " ")}</th>)}<th></th></tr></thead><tbody>{workspace.comparables.map((row, index) => <tr key={index}><td><input className="field w-40" value={row.company} onChange={(e) => editComparable(index, "company", e.target.value)}/></td>{(["market_cap", "debt", "cash", "enterprise_value", "revenue", "ebitda", "ebit", "net_income"] as const).map((key) => <td key={key}><input className="field w-28" type="number" step="any" value={row[key] ?? ""} onChange={(e) => editComparable(index, key, e.target.value)}/></td>)}<td><button aria-label="Delete peer" onClick={() => updateWorkspace((current) => ({ ...current, comparables: current.comparables.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={15} className="text-mist hover:text-red-300"/></button></td></tr>)}</tbody></table></div>
        {workspace.comparables.length === 0 && <p className="mt-4 text-sm text-mist">Add only genuinely comparable companies. No market-data API is used.</p>}
        {peerOutput && <div className="mt-5 grid gap-5 xl:grid-cols-2"><div><h3 className="font-semibold">Calculated multiples</h3><div className="table-wrap mt-3"><table className="data-table"><thead><tr>{Object.keys(peerOutput.multiples[0] ?? {}).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{peerOutput.multiples.map((row, index) => <tr key={index}>{Object.values(row).map((value, itemIndex) => <td key={itemIndex}>{typeof value === "number" ? formatNumber(value, 2) : value ?? "Excluded"}</td>)}</tr>)}</tbody></table></div></div><div><h3 className="font-semibold">Peer statistics</h3><div className="table-wrap mt-3"><table className="data-table"><thead><tr>{Object.keys(peerOutput.statistics[0] ?? {}).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{peerOutput.statistics.map((row, index) => <tr key={index}>{Object.values(row).map((value, itemIndex) => <td key={itemIndex}>{typeof value === "number" ? formatNumber(value, 2) : value ?? "—"}</td>)}</tr>)}</tbody></table></div></div></div>}
      </Card>
    </>
  );
}
