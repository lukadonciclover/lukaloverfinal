"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, CheckCircle2, CircleDashed } from "lucide-react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { dcfFingerprint, verifiedFigureCount, workflowStatus } from "@/lib/research";
import { useWorkspace } from "@/lib/workspace";
import { Card, Notice, PageHeader, Stat, formatMoney } from "@/components/ui";

export function DashboardPage() {
  const { workspace } = useWorkspace();
  const [backend, setBackend] = useState<"checking" | "online" | "offline">("checking");
  useEffect(() => { apiGet<{ status: string }>("/health").then(() => setBackend("online")).catch(() => setBackend("offline")); }, []);
  const history = useMemo(() => {
    const grouped: Record<string, Record<string, number>> = {};
    for (const figure of workspace.figures) {
      if (figure.value !== null) grouped[figure.period] = { ...grouped[figure.period], [figure.metric]: figure.value };
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([period, values]) => ({ period, ...values }));
  }, [workspace.figures]);
  const latest: Record<string, number | string> = history.at(-1) ?? { period: "" };
  const steps = workflowStatus(workspace);
  const currentDcf = workspace.dcfResult && workspace.dcfInputHash === dcfFingerprint(workspace.dcfInputs);
  const evidenceChunks = workspace.documents.reduce((total, document) => total + document.chunks.length, 0);
  const stepLinks = ["/workspace", "/workspace", "/financials", "/valuation", "/research", "/research", "/report"];

  return (
    <>
      <PageHeader kicker="Research control room" title="Decision-grade analysis, with receipts." description="Trace every figure from source to model, pressure-test the valuation, and challenge the thesis before capital is committed." />
      <Notice kind={backend === "online" ? "success" : backend === "offline" ? "error" : "info"}>
        Python engine: <strong>{backend}</strong>{backend === "offline" && ". Start both services or verify the backend binding; workspace editing remains available in this browser."}
      </Notice>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Latest revenue" value={formatMoney(typeof latest.revenue === "number" ? latest.revenue : null, workspace.company.currency)} detail={`${workspace.company.latest_financial_year} · source units`} />
        <Stat label="Source-linked figures" value={verifiedFigureCount(workspace.figures)} detail={`${workspace.figures.length} total ledger rows`} tone="positive" />
        <Stat label="Retrievable evidence" value={evidenceChunks} detail={`${workspace.documents.length} source document(s)`} />
        <Stat label="Implied share value" value={formatMoney(currentDcf ? workspace.dcfResult?.implied_share_value : null, workspace.company.currency)} detail={currentDcf ? "Current deterministic DCF" : "Valuation missing or stale"} tone="warning" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="mb-5 flex items-start justify-between"><div><p className="eyebrow">Five-year operating view</p><h2 className="mt-1 text-xl font-semibold">Revenue trajectory</h2></div><ArrowUpRight className="text-teal" /></div>
          <div className="h-72">
            {history.length === 0 && <div className="flex h-full items-center justify-center text-sm text-mist">Add financial history to populate this chart.</div>}
            {history.length > 0 &&
             <ResponsiveContainer width="100%" height="100%"><AreaChart data={history}><defs><linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#45b6ad" stopOpacity={0.45}/><stop offset="100%" stopColor="#45b6ad" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#1d3341" vertical={false}/><XAxis dataKey="period" stroke="#8fa6b3" fontSize={11}/><YAxis stroke="#8fa6b3" fontSize={11}/><Tooltip contentStyle={{ background: "#0d1821", border: "1px solid #1d3341" }}/><Area type="monotone" dataKey="revenue" stroke="#45b6ad" strokeWidth={2} fill="url(#revenue)"/></AreaChart></ResponsiveContainer>
            }
          </div>
        </Card>
        <Card>
          <p className="eyebrow">Workflow status</p><h2 className="mt-1 text-xl font-semibold">Research readiness</h2>
          <div className="mt-5 space-y-3">
            {steps.map((step, index) => <Link key={step.label} href={stepLinks[index]} className="block border-b border-line pb-3 hover:bg-white/[0.02]"><span className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-3">{step.complete ? <CheckCircle2 size={17} className="text-teal"/> : <CircleDashed size={17} className="text-gold"/>}{step.label}</span><span className={`text-xs font-semibold uppercase tracking-wider ${step.complete ? "text-teal" : "text-gold"}`}>{step.complete ? "Complete" : "Open"}</span></span>{!step.complete && <span className="mt-1 block pl-8 text-xs text-mist">{step.missing}</span>}</Link>)}
          </div>
        </Card>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {["Verify source figures before modeling", "Change one assumption at a time", "Require evidence before conviction"].map((title, index) => <Card key={title}><p className="text-xs font-bold text-gold">0{index + 1}</p><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-mist">{index === 0 ? "Document suggestions never enter calculations until accepted." : index === 1 ? "Scenario outputs always come from the Python engine." : "Manual AI output remains labeled and schema-validated."}</p></Card>)}
      </div>
    </>
  );
}
