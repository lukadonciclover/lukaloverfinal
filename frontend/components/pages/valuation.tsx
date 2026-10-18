"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import { dcfFingerprint, fingerprint, valuationFingerprint } from "@/lib/research";
import type { Comparable, DCFInputs, DCFResult } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Field, Notice, PageHeader, Stat, formatMoney, formatNumber, formatPercent } from "@/components/ui";

type ComparablesResponse = { multiples: Array<Record<string, number | string | null>>; statistics: Array<Record<string, number | string | null>> };
type ForecastKey = "revenue_growth" | "ebit_margin" | "tax_rate" | "depreciation_pct_revenue" | "capex_pct_revenue" | "nwc_pct_revenue";

export function ValuationPage() {
  const { workspace, updateWorkspace, hydrated } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [peerLoading, setPeerLoading] = useState(false);
  const [error, setError] = useState("");
  const [peerError, setPeerError] = useState("");
  const [peerOutput, setPeerOutput] = useState<ComparablesResponse | null>(null);
  const [selectedSensitivity, setSelectedSensitivity] = useState<{ row: string; column: string; value: number | null } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const peerRequestRef = useRef(0);
  const inputs = workspace.dcfInputs;
  const inputHash = valuationFingerprint(workspace);
  const calculationHash = dcfFingerprint(inputs);
  const currentHashRef = useRef(inputHash);
  currentHashRef.current = inputHash;
  const resultCurrent = Boolean(workspace.dcfResult && workspace.dcfInputHash === inputHash);
  const calculationRequired = !workspace.dcfResult || workspace.dcfCalculationHash !== calculationHash;
  const latestRevenueFigure = [...workspace.figures].filter((figure) => figure.metric === "revenue" && figure.value !== null).sort((left, right) => left.period.localeCompare(right.period)).at(-1);
  const latestRevenue = latestRevenueFigure?.value ?? null;

  const updateInput = <K extends keyof DCFInputs>(key: K, value: DCFInputs[K]) => updateWorkspace((current) => ({ ...current, dcfInputs: { ...current.dcfInputs, [key]: value } }));
  const updateYear = (key: ForecastKey, index: number, value: number) => updateInput(key, inputs[key].map((item, itemIndex) => itemIndex === index ? value : item));

  async function runValuation() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestedHash = inputHash;
    const requestedCalculationHash = calculationHash;
    setLoading(true);
    setError("");
    try {
      const result = await apiPost<DCFResult>("/v1/valuation/dcf", inputs, { signal: controller.signal });
      if (requestedHash === currentHashRef.current) updateWorkspace((current) => ({ ...current, dcfResult: result, dcfInputHash: requestedHash, dcfCalculationHash: requestedCalculationHash }));
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Valuation failed.");
    } finally {
      if (controllerRef.current === controller) setLoading(false);
    }
  }

  useEffect(() => {
    if (!hydrated || !calculationRequired) return;
    const timer = window.setTimeout(() => {
      void runValuation();
    }, 450);
    return () => { window.clearTimeout(timer); controllerRef.current?.abort(); };
  }, [calculationHash, calculationRequired, hydrated, inputHash]);

  const result = resultCurrent ? workspace.dcfResult : null;
  const scenarioData = result ? Object.entries(result.scenarios).map(([scenario, scenarioResult]) => ({
    scenario,
    equity: scenarioResult.equity_value,
    share: scenarioResult.implied_share_value,
    revenue: scenarioResult.forecast.at(-1)?.revenue ?? null,
    margin: scenarioResult.forecast.at(-1)?.ebit_margin ?? null
  })) : [];
  const baseScenario = scenarioData.find((row) => row.scenario === "base");
  const scenarioWaterfall = scenarioData.map((row) => ({
    scenario: row.scenario,
    revenueDelta: row.revenue !== null && baseScenario?.revenue !== null && baseScenario?.revenue !== undefined ? row.revenue - baseScenario.revenue : 0,
    marginDeltaBps: row.margin !== null && baseScenario?.margin !== null && baseScenario?.margin !== undefined ? (row.margin - baseScenario.margin) * 10_000 : 0
  }));
  const bridgeData = result ? [
    { item: "Enterprise value", value: result.enterprise_value },
    { item: "Debt", value: -inputs.debt },
    { item: "Cash", value: inputs.cash },
    { item: "Minority", value: -inputs.minority_interest },
    { item: "Non-operating", value: inputs.non_operating_assets },
    { item: "Equity value", value: result.equity_value }
  ] : [];
  const sharePriceData = result ? [
    { item: "Reference", value: inputs.reference_price },
    ...scenarioData.map((row) => ({ item: row.scenario, value: row.share }))
  ] : [];

  function editComparable(index: number, key: keyof Comparable, value: string) {
    peerRequestRef.current += 1;
    setPeerLoading(false);
    setPeerOutput(null);
    updateWorkspace((current) => ({ ...current, comparables: current.comparables.map((row, itemIndex) => itemIndex === index ? { ...row, [key]: key === "company" ? value : value === "" ? null : Number(value) } : row) }));
  }

  async function calculatePeers() {
    const rows = workspace.comparables.filter((row) => row.company.trim());
    if (!rows.length) { setPeerError("Add at least one named comparable company."); return; }
    const request = ++peerRequestRef.current;
    setPeerLoading(true); setPeerError("");
    try {
      const response = await apiPost<ComparablesResponse>("/v1/valuation/comparables", { rows });
      if (request === peerRequestRef.current) setPeerOutput(response);
    } catch (reason) {
      if (request === peerRequestRef.current) setPeerError(reason instanceof Error ? reason.message : "Comparable analysis failed.");
    } finally {
      if (request === peerRequestRef.current) setPeerLoading(false);
    }
  }

  const modelState = loading ? "Recalculating" : error ? "Model error" : resultCurrent ? "Model synchronized" : "Result stale";

  return (
    <>
      <PageHeader
        kicker="Valuation lab"
        title="Make the assumptions visible."
        description="The Python engine recalculates after each edit using year-end discounting. WACC must exceed terminal growth. Every result is tied to an exact input fingerprint."
        actions={<span className="flex items-center gap-2 text-xs text-mist"><span className={`h-2 w-2 rounded-full ${loading ? "animate-pulse bg-gold" : resultCurrent ? "bg-teal" : "bg-red-400"}`}/>{modelState}</span>}
      />
      {error && <Notice kind="error">{error} The previous result remains visible only as stale and will not be treated as current downstream.</Notice>}
      {!resultCurrent && workspace.dcfResult && !loading && !error && <Notice kind="warning">Inputs, financial figures, or company currency changed after this valuation was calculated. Stale outputs are hidden. {!calculationRequired && <Button variant="secondary" className="ml-2" onClick={() => void runValuation()}>Confirm assumptions and recalculate</Button>}</Notice>}
      {latestRevenue !== null && latestRevenue !== inputs.base_revenue && <div className="mt-3"><Notice kind="warning">Latest ledger revenue is {formatNumber(latestRevenue, 2)} in source display units, while DCF base revenue is {formatNumber(inputs.base_revenue, 2)}. <Button variant="secondary" className="ml-2" onClick={() => updateInput("base_revenue", latestRevenue)}>Use latest revenue</Button></Notice></div>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Enterprise value" value={formatMoney(result?.enterprise_value, workspace.company.currency)} detail={resultCurrent ? "Current" : "Stale"} />
        <Stat label="Equity value" value={formatMoney(result?.equity_value, workspace.company.currency)} detail={resultCurrent ? "Current" : "Stale"} />
        <Stat label="Implied share value" value={formatMoney(result?.implied_share_value, workspace.company.currency)} tone="positive" />
        <Stat label="Upside / downside" value={formatPercent(result?.upside_downside)} tone={(result?.upside_downside ?? 0) >= 0 ? "positive" : "warning"} />
      </div>

      <Card className="mt-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9">
          <Field label="Base revenue" hint="Analyst assumption; use ledger units" type="number" step="any" value={inputs.base_revenue} onChange={(event) => updateInput("base_revenue", Number(event.target.value))} />
          <Field label="WACC" hint="Decimal, e.g. 0.10" type="number" step="0.005" value={inputs.wacc} onChange={(event) => updateInput("wacc", Number(event.target.value))} />
          <Field label="Terminal growth" hint="Decimal, e.g. 0.025" type="number" step="0.005" value={inputs.terminal_growth} onChange={(event) => updateInput("terminal_growth", Number(event.target.value))} />
          {(["cash", "debt", "minority_interest", "non_operating_assets"] as const).map((key) => <Field key={key} label={key.replaceAll("_", " ")} hint="Analyst assumption" type="number" step="any" value={inputs[key]} onChange={(event) => updateInput(key, Number(event.target.value))} />)}
          <Field label="Diluted shares" hint="Share-count assumption" type="number" step="any" value={inputs.diluted_shares ?? ""} onChange={(event) => updateInput("diluted_shares", event.target.value === "" ? null : Number(event.target.value))} />
          <Field label="Reference price" hint={`Company profile: ${workspace.company.share_price ?? "not set"}`} type="number" step="0.01" value={inputs.reference_price ?? ""} onChange={(event) => updateInput("reference_price", event.target.value === "" ? null : Number(event.target.value))} />
        </div>
        <div className="table-wrap mt-5"><table className="data-table"><thead><tr><th>Year</th><th>Revenue growth</th><th>EBIT margin</th><th>Tax rate</th><th>D&amp;A / revenue</th><th>Capex / revenue</th><th>NWC / revenue</th></tr></thead><tbody>{inputs.revenue_growth.map((_, index) => <tr key={index}><td>{index + 1}</td>{(["revenue_growth", "ebit_margin", "tax_rate", "depreciation_pct_revenue", "capex_pct_revenue", "nwc_pct_revenue"] as const).map((key) => <td key={key}><input aria-label={`${key} year ${index + 1}`} className="field w-28" type="number" step="0.005" value={inputs[key][index]} onChange={(event) => updateYear(key, index, Number(event.target.value))}/></td>)}</tr>)}</tbody></table></div>
      </Card>

      {result && <>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Card><p className="eyebrow">Scenario comparison</p><h2 className="mt-1 text-xl font-semibold">Bear / base / bull equity value</h2><div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={scenarioData}><CartesianGrid stroke="#1d3341" vertical={false}/><XAxis dataKey="scenario" stroke="#8fa6b3"/><YAxis stroke="#8fa6b3"/><Tooltip contentStyle={{ background: "#0d1821", border: "1px solid #1d3341" }}/><Bar dataKey="equity" fill="#45b6ad"/></BarChart></ResponsiveContainer></div><div className="table-wrap mt-3"><table className="data-table"><thead><tr><th>Scenario</th><th>Final revenue</th><th>EBIT margin</th><th>Equity</th><th>Per share</th></tr></thead><tbody>{scenarioData.map((row) => <tr key={row.scenario}><td>{row.scenario}</td><td>{formatNumber(row.revenue, 2)}</td><td>{formatPercent(row.margin)}</td><td>{formatNumber(row.equity, 2)}</td><td>{formatNumber(row.share, 2)}</td></tr>)}</tbody></table></div></Card>
          <Card><p className="eyebrow">Interactive sensitivity</p><h2 className="mt-1 text-xl font-semibold">WACC versus terminal growth</h2><div className="table-wrap mt-4"><table className="data-table"><thead><tr><th>Terminal growth</th>{result.sensitivity.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{result.sensitivity.rows.map((row, index) => <tr key={row}><td>{row}</td>{result.sensitivity.values[index].map((value, itemIndex) => <td key={itemIndex}><button className="min-w-16 border border-transparent px-2 py-1 text-right hover:border-gold focus:border-gold" onClick={() => setSelectedSensitivity({ row, column: result.sensitivity.columns[itemIndex], value })}>{formatNumber(value, 2)}</button></td>)}</tr>)}</tbody></table></div>{selectedSensitivity && <Notice kind="info">{selectedSensitivity.row}, {selectedSensitivity.column}: implied share value {formatMoney(selectedSensitivity.value, workspace.company.currency)}.</Notice>}<p className="mt-3 text-xs text-mist">{result.timing_convention}</p></Card>
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          <Card><p className="eyebrow">Scenario waterfall</p><h2 className="mt-1 text-lg font-semibold">Revenue and margin deltas vs. base</h2><div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={scenarioWaterfall}><CartesianGrid stroke="#1d3341" vertical={false}/><XAxis dataKey="scenario" stroke="#8fa6b3"/><YAxis stroke="#8fa6b3"/><Tooltip contentStyle={{ background: "#0d1821", border: "1px solid #1d3341" }}/><Legend/><Bar dataKey="revenueDelta" fill="#45b6ad"/><Bar dataKey="marginDeltaBps" fill="#d4a84f"/></BarChart></ResponsiveContainer></div></Card>
          <Card><p className="eyebrow">Valuation bridge</p><h2 className="mt-1 text-lg font-semibold">Enterprise to equity value</h2><div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={bridgeData}><CartesianGrid stroke="#1d3341" vertical={false}/><XAxis dataKey="item" stroke="#8fa6b3" fontSize={10}/><YAxis stroke="#8fa6b3"/><Tooltip contentStyle={{ background: "#0d1821", border: "1px solid #1d3341" }}/><Bar dataKey="value" fill="#7d8fff"/></BarChart></ResponsiveContainer></div></Card>
          <Card><p className="eyebrow">Share price comparison</p><h2 className="mt-1 text-lg font-semibold">Reference and scenario values</h2><div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={sharePriceData}><CartesianGrid stroke="#1d3341" vertical={false}/><XAxis dataKey="item" stroke="#8fa6b3"/><YAxis stroke="#8fa6b3"/><Tooltip contentStyle={{ background: "#0d1821", border: "1px solid #1d3341" }}/><Bar dataKey="value" fill="#d4a84f"/></BarChart></ResponsiveContainer></div></Card>
        </div>
        <Card className="mt-5"><p className="eyebrow">Explicit forecast</p><h2 className="mt-1 text-xl font-semibold">Free cash flow build</h2><div className="table-wrap mt-4"><table className="data-table"><thead><tr>{Object.keys(result.forecast[0] ?? {}).map((key) => <th key={key}>{key.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{result.forecast.map((row, index) => <tr key={index}>{Object.values(row).map((value, itemIndex) => <td key={itemIndex}>{formatNumber(value, 2)}</td>)}</tr>)}</tbody></table></div></Card>
      </>}

      <Card className="mt-5">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Relative valuation</p><h2 className="mt-1 text-xl font-semibold">Comparable companies</h2></div><div className="flex gap-2"><Button variant="secondary" onClick={() => { peerRequestRef.current += 1; setPeerOutput(null); updateWorkspace((current) => ({ ...current, comparables: [...current.comparables, { company: "", market_cap: null, debt: null, cash: null, enterprise_value: null, revenue: null, ebitda: null, ebit: null, net_income: null }] })); }}><Plus size={15}/> Add peer</Button><Button loading={peerLoading} onClick={calculatePeers}>Calculate multiples</Button></div></div>
        {peerError && <div className="mt-3"><Notice kind="error">{peerError}</Notice></div>}
        <div className="table-wrap mt-4"><table className="data-table"><thead><tr><th>Company</th>{["market_cap", "debt", "cash", "enterprise_value", "revenue", "ebitda", "ebit", "net_income"].map((key) => <th key={key}>{key.replaceAll("_", " ")}</th>)}<th></th></tr></thead><tbody>{workspace.comparables.map((row, index) => <tr key={index}><td><input aria-label={`Peer company ${index + 1}`} className="field w-40" value={row.company} onChange={(event) => editComparable(index, "company", event.target.value)}/></td>{(["market_cap", "debt", "cash", "enterprise_value", "revenue", "ebitda", "ebit", "net_income"] as const).map((key) => <td key={key}><input aria-label={`${key} for peer ${index + 1}`} className="field w-28" type="number" step="any" value={row[key] ?? ""} onChange={(event) => editComparable(index, key, event.target.value)}/></td>)}<td><button className="min-h-10 min-w-10" aria-label={`Delete peer ${index + 1}`} onClick={() => { peerRequestRef.current += 1; setPeerOutput(null); updateWorkspace((current) => ({ ...current, comparables: current.comparables.filter((_, itemIndex) => itemIndex !== index) })); }}><Trash2 size={15} className="text-mist hover:text-red-300"/></button></td></tr>)}</tbody></table></div>
        {workspace.comparables.length === 0 && <p className="mt-4 text-sm text-mist">Add only genuinely comparable companies. No market-data API is used. Record currency, scale and period in your research notes because this demo does not normalize peer data.</p>}
        {peerOutput && <div className="mt-5 grid gap-5 xl:grid-cols-2"><div><h3 className="font-semibold">Calculated multiples</h3><div className="table-wrap mt-3"><table className="data-table"><thead><tr>{Object.keys(peerOutput.multiples[0] ?? {}).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{peerOutput.multiples.map((row, index) => <tr key={index}>{Object.values(row).map((value, itemIndex) => <td key={itemIndex}>{typeof value === "number" ? formatNumber(value, 2) : value ?? "Excluded"}</td>)}</tr>)}</tbody></table></div></div><div><h3 className="font-semibold">Peer statistics</h3><div className="table-wrap mt-3"><table className="data-table"><thead><tr>{Object.keys(peerOutput.statistics[0] ?? {}).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{peerOutput.statistics.map((row, index) => <tr key={index}>{Object.values(row).map((value, itemIndex) => <td key={itemIndex}>{typeof value === "number" ? formatNumber(value, 2) : value ?? "—"}</td>)}</tr>)}</tbody></table></div></div></div>}
      </Card>
      <p className="mt-3 text-[10px] text-mist">Input fingerprint: {inputHash}. Comparable fingerprint: {fingerprint(workspace.comparables)}.</p>
    </>
  );
}
