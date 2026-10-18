"use client";

import { useState } from "react";
import { Download, FileArchive, FileSpreadsheet, FileText } from "lucide-react";
import { apiDownload, saveBlob } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Notice, PageHeader } from "@/components/ui";
import { currentAgentOutputs, currentClaimAssessments, dcfFingerprint, isAgentRunStale } from "@/lib/research";

export function ReportPage() {
  const { workspace } = useWorkspace();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  async function download(format: "docx" | "pdf" | "xlsx") {
    if (loading) return;
    setLoading(format); setError("");
    try {
      const valuationCurrent = workspace.dcfInputHash === dcfFingerprint(workspace.dcfInputs);
      const result = await apiDownload(`/v1/reports/${format}`, { company: workspace.company, figures: workspace.figures, valuation: valuationCurrent ? workspace.dcfResult ?? {} : {}, agent_outputs: currentAgentOutputs(workspace), dcf_inputs: workspace.dcfInputs, claim_assessments: currentClaimAssessments(workspace) });
      saveBlob(result.blob, result.filename);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Export failed."); }
    finally { setLoading(""); }
  }
  const valuationCurrent = Boolean(workspace.dcfResult && workspace.dcfInputHash === dcfFingerprint(workspace.dcfInputs));
  const staleAgents = Object.values(workspace.agentRuns).filter((run) => isAgentRunStale(run, workspace)).length;
  const currentClaims = currentClaimAssessments(workspace);
  const unsupportedClaims = currentClaims.filter((claim) => claim.status === "unsupported" || claim.status === "contradicted").length;
  const exports = [{ format: "docx" as const, title: "Research memorandum", detail: "Editable investment report with thesis, historical figures, valuation and assumptions.", icon: FileText }, { format: "pdf" as const, title: "Committee PDF", detail: "Presentation-ready fixed report generated from the same saved workspace snapshot.", icon: FileArchive }, { format: "xlsx" as const, title: "Financial model", detail: "Historical figures, DCF assumptions, forecast mechanics and valuation summary.", icon: FileSpreadsheet }];
  return <><PageHeader kicker="Investment report" title="One model. Three accountable exports." description="Every format is generated server-side from current figures and assumptions. The backend recalculates DCF instead of trusting a stored valuation payload."/>{!valuationCurrent && <Notice kind="warning">The on-screen DCF result is missing or stale. Export will recalculate directly from current assumptions.</Notice>}{staleAgents > 0 && <div className="mt-3"><Notice kind="warning">{staleAgents} stale agent output(s) will be excluded.</Notice></div>}{unsupportedClaims > 0 && <div className="mt-3"><Notice kind="warning">{unsupportedClaims} unsupported or contradicted claim(s) require review before committee use.</Notice></div>}{error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}<div className="mt-5 grid gap-5 lg:grid-cols-3">{exports.map(({ format, title, detail, icon: Icon }) => <Card key={format} className="flex flex-col"><Icon size={28} className="text-gold"/><p className="eyebrow mt-6">{format.toUpperCase()}</p><h2 className="mt-1 text-xl font-semibold">{title}</h2><p className="mt-3 flex-1 text-sm leading-6 text-mist">{detail}</p><Button aria-label={`Generate and download ${format.toUpperCase()}`} loading={loading === format} disabled={Boolean(loading)} className="mt-6 w-full" onClick={() => download(format)}><Download size={15}/> Generate and download {format.toUpperCase()}</Button></Card>)}</div><Card className="mt-5"><p className="eyebrow">Reconciliation controls</p><div className="mt-4 grid gap-4 md:grid-cols-5">{[["As-of date", new Date().toISOString().slice(0, 10)], ["Currency", workspace.company.currency], ["Historical figures", workspace.figures.length], ["Current agents", Object.keys(currentAgentOutputs(workspace)).length], ["Claim checks", workspace.claimAssessments.length]].map(([label, value]) => <div key={String(label)} className="border-b border-line pb-3"><p className="text-xs uppercase tracking-wider text-mist">{label}</p><p className="mt-2 font-semibold">{value}</p></div>)}</div></Card></>;
}
