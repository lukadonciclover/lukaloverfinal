"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileArchive, FileSpreadsheet, FileText } from "lucide-react";
import { apiDownload, saveBlob } from "@/lib/api";
import { currentAgentOutputs, currentClaimAssessments, currentDcfResult, isAgentRunStale, reportFingerprint } from "@/lib/research";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Notice, PageHeader } from "@/components/ui";

const exports = [
  { format: "docx" as const, title: "Research memorandum", detail: "Editable investment report with thesis, historical figures, valuation and assumptions.", icon: FileText },
  { format: "pdf" as const, title: "Committee PDF", detail: "Presentation-ready report generated from one captured research snapshot.", icon: FileArchive },
  { format: "xlsx" as const, title: "Financial model", detail: "Historical figures, DCF assumptions, forecast mechanics and evidence review.", icon: FileSpreadsheet }
];

export function ReportPage() {
  const { workspace, updateWorkspace } = useWorkspace();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const currentClaims = currentClaimAssessments(workspace);
  const currentReportHash = reportFingerprint(workspace);
  const currentHashRef = useRef(currentReportHash);
  const mountedRef = useRef(true);
  currentHashRef.current = currentReportHash;
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const reportCurrent = workspace.reportSnapshot?.input_hash === currentReportHash;
  const valuationCurrent = Boolean(currentDcfResult(workspace));
  const staleAgents = Object.values(workspace.agentRuns).filter((run) => isAgentRunStale(run, workspace)).length;
  const unsupportedClaims = currentClaims.filter((claim) => claim.status === "unsupported" || claim.status === "contradicted").length;

  async function download(format: "docx" | "pdf" | "xlsx") {
    if (loading) return;
    const requestedHash = currentReportHash;
    setLoading(format); setError("");
    try {
      const result = await apiDownload(`/v1/reports/${format}`, {
        company: workspace.company, figures: workspace.figures, valuation: currentDcfResult(workspace) ?? {},
        agent_outputs: currentAgentOutputs(workspace), dcf_inputs: workspace.dcfInputs, claim_assessments: currentClaims
      });
      if (!mountedRef.current || currentHashRef.current !== requestedHash) {
        if (mountedRef.current) setError("Project inputs changed during export. Generate a new report from the current snapshot.");
        return;
      }
      saveBlob(result.blob, result.filename);
      updateWorkspace((current) => reportFingerprint(current) === requestedHash ? { ...current, reportSnapshot: { input_hash: requestedHash, format, filename: result.filename, created_at: new Date().toISOString() } } : current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Export failed."); }
    finally { setLoading(""); }
  }

  return <>
    <PageHeader kicker="Investment report" title="One model. Three accountable exports." description="Every format is generated server-side from one current company snapshot. The backend recalculates DCF instead of trusting a stored valuation payload."/>
    {!reportCurrent && workspace.reportSnapshot && <Notice kind="warning">Research inputs changed after the last export. Regenerate the report before relying on it.</Notice>}
    {!valuationCurrent && <div className="mt-3"><Notice kind="warning">The DCF result is missing or stale. Export will recalculate current assumptions, but complete the valuation step first for workflow readiness.</Notice></div>}
    {staleAgents > 0 && <div className="mt-3"><Notice kind="warning">{staleAgents} stale agent output(s) will be excluded.</Notice></div>}
    {unsupportedClaims > 0 && <div className="mt-3"><Notice kind="warning">{unsupportedClaims} unsupported or contradicted claim(s) require review before committee use.</Notice></div>}
    {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
    <div className="mt-5 grid gap-5 lg:grid-cols-3">{exports.map(({ format, title, detail, icon: Icon }) => <Card key={format} className="flex flex-col"><Icon size={28} className="text-gold"/><p className="eyebrow mt-6">{format.toUpperCase()}</p><h2 className="mt-1 text-xl font-semibold">{title}</h2><p className="mt-3 flex-1 text-sm leading-6 text-mist">{detail}</p><Button aria-label={`Generate and download ${format.toUpperCase()}`} loading={loading === format} disabled={Boolean(loading)} className="mt-6 w-full" onClick={() => download(format)}><Download size={15}/> Generate and download {format.toUpperCase()}</Button></Card>)}</div>
    <Card className="mt-5"><p className="eyebrow">Reconciliation controls</p><div className="mt-4 grid gap-4 md:grid-cols-5">{[["As-of date", new Date().toISOString().slice(0, 10)], ["Currency", workspace.company.currency], ["Historical figures", workspace.figures.length], ["Current agents", Object.keys(currentAgentOutputs(workspace)).length], ["Current claim checks", currentClaims.length]].map(([label, value]) => <div key={String(label)} className="border-b border-line pb-3"><p className="text-xs uppercase tracking-wider text-mist">{label}</p><p className="mt-2 font-semibold">{value}</p></div>)}</div>{workspace.reportSnapshot && <p className="mt-4 text-xs text-mist">Last export: {workspace.reportSnapshot.filename} at {new Date(workspace.reportSnapshot.created_at).toLocaleString()} · {reportCurrent ? "current" : "stale"}</p>}</Card>
  </>;
}
