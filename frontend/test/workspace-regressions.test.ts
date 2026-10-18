import { createDemoWorkspace } from "@/lib/demo";
import { agentInputFingerprint, dcfFingerprint, isAgentRunStale, researchFingerprint } from "@/lib/research";
import { parseWorkspace, persistenceCopy } from "@/lib/workspace";
import type { AgentRun } from "@/lib/types";

function run(agent: string, inputHash: string, parentRunIds: Record<string, string | null> = {}): AgentRun {
  return {
    id: `${agent}-run`, agent_name: agent, prompt: "source prompt", raw_output: "source response",
    parsed_output: { summary: "source-derived conclusion" }, valid: true, schema_valid: true, errors: [],
    provenance: "manual", model_id: "test-model", prompt_version: "v1", prompt_hash: "prompt",
    input_hash: inputHash, source_ids: ["source-1"], assumptions: { parent_run_ids: parentRunIds },
    created_at: new Date(0).toISOString()
  };
}

describe("workspace safety regressions", () => {
  it("removes source-bearing text when persistence consent is off", () => {
    const workspace = createDemoWorkspace();
    workspace.documents = [{
      identifier: "document-1", name: "Report", document_type: "Annual report", reporting_period: "2025",
      pages: 1, warning: "", extraction_status: "complete", retained_by_server: false,
      chunks: [{ chunk_id: "source-1", page: 1, text: "Sensitive excerpt", document_name: "Report", document_identifier: "document-1", metadata: {} }],
      suggestions: [{ metric: "revenue", period: "2025", value: 10, currency: "USD", unit_scale: 1, page: 1, quote: "Sensitive quote", confidence: 0.8 }]
    }];
    workspace.agentRuns = { "Financial Analyst": run("Financial Analyst", researchFingerprint(workspace)) };
    workspace.claimAssessments = [{ claim_id: "c1", claim: "Sensitive claim", status: "verified", citations: [], rationale: "", checks: [], human_review_required: false }];
    workspace.chats = [{ id: "m1", role: "assistant", content: "Sensitive answer", citations: ["source-1"] }];

    const copy = persistenceCopy(workspace);

    expect(copy.documents[0].chunks).toEqual([]);
    expect(copy.documents[0].suggestions[0].quote).toBe("");
    expect(copy.figures[0].source?.quote).toBe("");
    expect(copy.agentRuns["Financial Analyst"].parsed_output).toBeNull();
    expect(copy.claimAssessments).toEqual([]);
    expect(copy.chats).toEqual([]);
  });

  it("migrates version-one workspaces and disables imported text retention", () => {
    const legacy = createDemoWorkspace() as unknown as Record<string, unknown>;
    legacy.version = 1;
    legacy.settings = { mode: "Manual AI Mode", persistDocumentText: true };

    const migrated = parseWorkspace(legacy, false);

    expect(migrated.version).toBe(2);
    expect(migrated.settings.persistDocumentText).toBe(false);
    expect(migrated.dcfInputHash).toBeNull();
  });

  it("rejects malformed financial imports", () => {
    const malformed = createDemoWorkspace();
    malformed.figures[0].unit_scale = 0;
    expect(() => parseWorkspace(malformed)).toThrow(/financial figure is malformed/i);
  });

  it("marks valuation and dependent agents stale after upstream inputs change", () => {
    const workspace = createDemoWorkspace();
    workspace.dcfInputHash = dcfFingerprint(workspace.dcfInputs);
    const financialHash = researchFingerprint(workspace);
    workspace.agentRuns["Financial Analyst"] = run("Financial Analyst", financialHash);
    const valuationHash = agentInputFingerprint(workspace, ["Financial Analyst"]);
    workspace.agentRuns["Valuation Analyst"] = run("Valuation Analyst", valuationHash, { "Financial Analyst": "Financial Analyst-run" });

    expect(isAgentRunStale(workspace.agentRuns["Financial Analyst"], workspace)).toBe(false);
    expect(isAgentRunStale(workspace.agentRuns["Valuation Analyst"], workspace)).toBe(false);

    workspace.dcfInputs = { ...workspace.dcfInputs, wacc: workspace.dcfInputs.wacc + 0.01 };
    expect(workspace.dcfInputHash).not.toBe(dcfFingerprint(workspace.dcfInputs));
    expect(isAgentRunStale(workspace.agentRuns["Financial Analyst"], workspace)).toBe(true);
    expect(isAgentRunStale(workspace.agentRuns["Valuation Analyst"], workspace)).toBe(true);
  });
});
