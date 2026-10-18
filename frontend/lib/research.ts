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

export function financialFingerprint(figures: FinancialFigure[]): string {
  return fingerprint(figures.map(({ id: _id, ...figure }) => figure));
}

export function researchFingerprint(workspace: Workspace): string {
  return fingerprint({
    company: workspace.company,
    figures: workspace.figures,
    documents: workspace.documents.map((document) => ({
      identifier: document.identifier,
      chunks: document.chunks.map((chunk) => chunk.chunk_id ?? `${document.identifier}:${chunk.page}:${fingerprint(chunk.text)}`)
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
  return workspace.dcfResult && workspace.dcfInputHash === dcfFingerprint(workspace.dcfInputs) ? workspace.dcfResult : null;
}

export function currentClaimAssessments(workspace: Workspace): ClaimAssessment[] {
  const verifier = workspace.agentRuns["Evidence Verification Agent"];
  return verifier?.valid && !isAgentRunStale(verifier, workspace) ? workspace.claimAssessments : [];
}

export function verifiedFigureCount(figures: FinancialFigure[]): number {
  return figures.filter((figure) => figure.value !== null && figure.origin !== "ai-estimate" && (figure.source || figure.origin === "derived")).length;
}

export function workflowStatus(workspace: Workspace) {
  const currentDcf = Boolean(workspace.dcfResult && workspace.dcfInputHash === dcfFingerprint(workspace.dcfInputs));
  const requiredAgents = ["Financial Analyst", "Valuation Analyst", "Risk Analyst", "Investment Committee Critic"];
  const currentAgents = requiredAgents.filter((name) => workspace.agentRuns[name]?.valid && !isAgentRunStale(workspace.agentRuns[name], workspace));
  const evidenceRun = workspace.agentRuns["Evidence Verification Agent"];
  return [
    { label: "Company selected", complete: Boolean(workspace.company.name.trim()), missing: "Add a company name." },
    { label: "Sources uploaded", complete: workspace.documents.length > 0, missing: "Upload at least one source document." },
    { label: "Financials verified", complete: verifiedFigureCount(workspace.figures) > 0, missing: "Add sourced or derived financial figures." },
    { label: "Valuation current", complete: currentDcf, missing: "Open Valuation Lab and resolve model errors." },
    { label: "Core agents current", complete: currentAgents.length === requiredAgents.length, missing: `Run ${requiredAgents.length - currentAgents.length} remaining or stale core agent(s).` },
    { label: "Claims checked", complete: Boolean(evidenceRun?.valid && !isAgentRunStale(evidenceRun, workspace) && workspace.claimAssessments.length), missing: "Run the Evidence Verification Agent." },
    { label: "Report ready", complete: currentDcf && currentAgents.length === requiredAgents.length, missing: "Complete current valuation and agent analysis." }
  ];
}
