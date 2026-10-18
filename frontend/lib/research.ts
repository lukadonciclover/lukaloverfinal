import type { AgentRun, ClaimAssessment, DCFInputs, DCFResult, FinancialFigure, Workspace } from "@/lib/types";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function fingerprint(value: unknown): string {
  const text = JSON.stringify(canonical(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function dcfFingerprint(inputs: DCFInputs): string {
  return fingerprint(inputs);
}

export function valuationFingerprint(workspace: Workspace): string {
  return fingerprint({ inputs: workspace.dcfInputs, figures: financialFingerprint(workspace.figures), company: { id: workspace.company.id, currency: workspace.company.currency } });
}

export function financialFingerprint(figures: FinancialFigure[]): string {
  return fingerprint(figures.map(({ id: _id, ...figure }) => figure));
}

export function researchFingerprint(workspace: Workspace): string {
  const currentAnalysis = workspace.financialAnalysis?.input_hash === financialFingerprint(workspace.figures) ? workspace.financialAnalysis : null;
  return fingerprint({
    company: workspace.company,
    figures: workspace.figures,
    financialAnalysis: currentAnalysis,
    documents: workspace.documents.map((document) => ({
      identifier: document.identifier,
      chunks: document.chunks.map((chunk) => ({ id: chunk.chunk_id ?? `${document.identifier}:${chunk.page}`, page: chunk.page, text: fingerprint(chunk.text) }))
    })),
    dcfInputs: workspace.dcfInputs,
    dcfResult: workspace.dcfResult
  });
}

export function isAgentRunStale(run: AgentRun | undefined, workspace: Workspace): boolean {
  if (!run?.valid) return false;
  const parentIds = run.assumptions.parent_run_ids;
  const parentNames = parentIds && typeof parentIds === "object" && !Array.isArray(parentIds) ? Object.keys(parentIds as Record<string, unknown>) : [];
  if (parentNames.length) {
    const currentParents = Object.fromEntries(parentNames.map((name) => [name, workspace.agentRuns[name]?.id ?? null]));
    return run.input_hash !== fingerprint({ workspace: researchFingerprint(workspace), parents: currentParents });
  }
  return run.input_hash !== researchFingerprint(workspace);
}

export function agentInputFingerprint(workspace: Workspace, parentNames: string[]): string {
  if (!parentNames.length) return researchFingerprint(workspace);
  return fingerprint({ workspace: researchFingerprint(workspace), parents: Object.fromEntries(parentNames.map((name) => [name, workspace.agentRuns[name]?.id ?? null])) });
}

export function currentAgentOutputs(workspace: Workspace): Record<string, Record<string, unknown> | null> {
  return Object.fromEntries(Object.entries(workspace.agentRuns)
    .filter(([, run]) => run.valid && !isAgentRunStale(run, workspace))
    .map(([name, run]) => [name, run.parsed_output]));
}

export function currentDcfResult(workspace: Workspace): DCFResult | null {
  return workspace.dcfResult && workspace.dcfInputHash === valuationFingerprint(workspace) ? workspace.dcfResult : null;
}

export function currentClaimAssessments(workspace: Workspace): ClaimAssessment[] {
  const verifier = workspace.agentRuns["Evidence Verification Agent"];
  return verifier?.valid && !isAgentRunStale(verifier, workspace) ? workspace.claimAssessments : [];
}

export function verifiedFigureCount(figures: FinancialFigure[]): number {
  return figures.filter((figure) => figure.value !== null && figure.origin !== "ai-estimate" && (figure.source || figure.origin === "derived")).length;
}

export function thesisFingerprint(workspace: Workspace): string {
  return fingerprint({ company: workspace.company, figures: financialFingerprint(workspace.figures), valuation: currentDcfResult(workspace), agents: Object.fromEntries(Object.entries(workspace.agentRuns).filter(([, run]) => run.valid && !isAgentRunStale(run, workspace)).map(([name, run]) => [name, run.id])) });
}

export function reportFingerprint(workspace: Workspace): string {
  return fingerprint({ thesis: thesisFingerprint(workspace), claims: currentClaimAssessments(workspace), dcfInputs: workspace.dcfInputs });
}

export function workflowStatus(workspace: Workspace) {
  const currentDcf = Boolean(currentDcfResult(workspace));
  const analysisCurrent = workspace.financialAnalysis?.input_hash === financialFingerprint(workspace.figures);
  const coreAgents = ["Financial Analyst", "Valuation Analyst", "Risk Analyst"];
  const currentCore = coreAgents.filter((name) => workspace.agentRuns[name]?.valid && !isAgentRunStale(workspace.agentRuns[name], workspace));
  const critic = workspace.agentRuns["Investment Committee Critic"];
  const evidenceRun = workspace.agentRuns["Evidence Verification Agent"];
  const claimsCurrent = Boolean(evidenceRun?.valid && !isAgentRunStale(evidenceRun, workspace) && workspace.claimAssessments.length);
  const thesisCurrent = workspace.thesis?.input_hash === thesisFingerprint(workspace);
  const reportCurrent = workspace.reportSnapshot?.input_hash === reportFingerprint(workspace);
  return [
    { label: "Create or select company", route: "/workspace", complete: Boolean(workspace.company.name.trim() && workspace.company.name !== "Untitled company"), missing: "Confirm the active company identity." },
    { label: "Upload source documents", route: "/workspace", complete: workspace.documents.length > 0, missing: "Upload at least one annual report or financial statement." },
    { label: "Verify historical financials", route: "/financials", complete: verifiedFigureCount(workspace.figures) > 0, missing: "Accept or enter source-linked historical figures." },
    { label: "Generate financial analysis", route: "/financials", complete: analysisCurrent, missing: "Calculate current ratios and performance analysis." },
    { label: "Construct DCF valuation", route: "/valuation", complete: currentDcf, missing: "Resolve assumptions and calculate a current DCF." },
    { label: "Run research agents", route: "/research", complete: currentCore.length === coreAgents.length, missing: `Run ${coreAgents.length - currentCore.length} remaining or stale core agent(s).` },
    { label: "Challenge investment thesis", route: "/research", complete: Boolean(critic?.valid && !isAgentRunStale(critic, workspace)), missing: "Run the Investment Committee Critic." },
    { label: "Verify claims and sources", route: "/research", complete: claimsCurrent, missing: "Run the Evidence Verification Agent." },
    { label: "Create final recommendation", route: "/thesis", complete: Boolean(thesisCurrent && claimsCurrent && critic?.valid && !isAgentRunStale(critic, workspace)), missing: "Generate a recommendation after current committee and evidence review." },
    { label: "Export research report", route: "/report", complete: Boolean(reportCurrent && thesisCurrent && claimsCurrent), missing: "Export a report from the current reviewed research snapshot." }
  ];
}
