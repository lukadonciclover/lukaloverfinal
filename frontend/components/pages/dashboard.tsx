"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, Database, FileCheck2, Scale, Workflow } from "lucide-react";
import { apiGet } from "@/lib/api";
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

  return (
    <>
      <PageHeader kicker="Research control room" title="Decision-grade analysis, with receipts." description="Trace every figure from source to model, pressure-test the valuation, and challenge the thesis before capital is committed." />
      <Notice kind={backend === "online" ? "success" : backend === "offline" ? "error" : "info"}>
        Python engine: <strong>{backend}</strong>{backend === "offline" && ". Start both services or verify the backend binding; workspace editing remains available in this browser."}
      </Notice>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Latest revenue" value={formatMoney(typeof latest.revenue === "number" ? latest.revenue : null, workspace.company.currency)} detail={`${workspace.company.latest_financial_year} · source units`} />
        <Stat label="Verified figures" value={workspace.figures.length} detail="Reported and user-reviewed values" tone="positive" />
        <Stat label="Attached sources" value={workspace.documents.length} detail="Server retains no uploaded files" />
        <Stat label="Implied share value" value={formatMoney(workspace.dcfResult?.implied_share_value, workspace.company.currency)} detail={workspace.dcfResult ? "Saved deterministic DCF" : "Run the Valuation Lab"} tone="warning" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="mb-5 flex items-start justify-between"><div><p className="eyebrow">Five-year operating view</p><h2 className="mt-1 text-xl font-semibold">Revenue trajectory</h2></div><ArrowUpRight className="text-teal" /></div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={history}><defs><linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#45b6ad" stopOpacity={0.45}/><stop offset="100%" stopColor="#45b6ad" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#1d3341" vertical={false}/><XAxis dataKey="period" stroke="#8fa6b3" fontSize={11}/><YAxis stroke="#8fa6b3" fontSize={11}/><Tooltip contentStyle={{ background: "#0d1821", border: "1px solid #1d3341" }}/><Area type="monotone" dataKey="revenue" stroke="#45b6ad" strokeWidth={2} fill="url(#revenue)"/></AreaChart></ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <p className="eyebrow">Workflow status</p><h2 className="mt-1 text-xl font-semibold">Research readiness</h2>
          <div className="mt-5 space-y-4">
            {[
              [Database, "Workspace data", workspace.figures.length ? "Ready" : "Missing"],
              [FileCheck2, "Document evidence", workspace.documents.length ? "Available" : "Optional"],
              [Scale, "Valuation model", workspace.dcfResult ? "Calculated" : "Pending"],
              [Workflow, "Committee challenge", workspace.agentRuns["Investment Committee Critic"]?.valid ? "Validated" : "Pending"]
            ].map(([Icon, label, status]) => {
              const Component = Icon as typeof Database;
              return <div key={String(label)} className="flex items-center justify-between border-b border-line pb-3"><span className="flex items-center gap-3 text-sm"><Component size={17} className="text-mist" />{String(label)}</span><span className="text-xs font-semibold uppercase tracking-wider text-gold">{String(status)}</span></div>;
            })}
          </div>
        </Card>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {["Verify source figures before modeling", "Change one assumption at a time", "Require evidence before conviction"].map((title, index) => <Card key={title}><p className="text-xs font-bold text-gold">0{index + 1}</p><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-mist">{index === 0 ? "Document suggestions never enter calculations until accepted." : index === 1 ? "Scenario outputs always come from the Python engine." : "Manual AI output remains labeled and schema-validated."}</p></Card>)}
      </div>
    </>
  );
}
