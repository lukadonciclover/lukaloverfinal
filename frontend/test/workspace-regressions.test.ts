import { createTestWorkspace } from "./fixtures";
import { currentDcfResult, dcfFingerprint, fingerprint, valuationFingerprint } from "@/lib/fingerprint";
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
    const workspace = createTestWorkspace();
    workspace.documents = [{
      identifier: "document-1", name: "Report", document_type: "Annual report", reporting_period: "2025",
      pages: 1, warning: "", extraction_status: "complete", retained_by_server: false,
      chunks: [{ chunk_id: "source-1", page: 1, text: "Sensitive excerpt", document_name: "Report", document_identifier: "document-1", metadata: {} }],
      suggestions: [{ metric: "revenue", period: "2025", value: 10, currency: "USD", unit_scale: 1, page: 1, quote: "Sensitive quote", confidence: 0.8 }]
    }];
    workspace.agentRuns = { "Financial Analyst": run("Financial Analyst", fingerprint(workspace)) };
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
    const legacy = createTestWorkspace() as unknown as Record<string, unknown>;
    legacy.version = 1;
    legacy.settings = { mode: "Manual AI Mode", persistDocumentText: true };

    const migrated = parseWorkspace(legacy, false);

    expect(migrated.version).toBe(2);
    expect(migrated.settings.persistDocumentText).toBe(false);
    expect(migrated.dcfInputHash).toBeNull();
  });

  it("rejects malformed financial imports", () => {
    const malformed = createTestWorkspace();
    malformed.figures[0].unit_scale = 0;
    expect(() => parseWorkspace(malformed)).toThrow(/financial figure is malformed/i);
  });



  it("keeps a DCF stale after ledger changes until assumptions are reconciled", () => {
    const workspace = createTestWorkspace();
    workspace.dcfResult = { forecast: [], enterprise_value: 1, equity_value: 1, implied_share_value: 1, terminal_value: 1, pv_terminal_value: 1, upside_downside: null, timing_convention: "test", scenarios: {}, sensitivity: { rows: [], columns: [], values: [] } };
    workspace.dcfInputHash = valuationFingerprint(workspace);
    workspace.dcfCalculationHash = dcfFingerprint(workspace.dcfInputs);
    expect(currentDcfResult(workspace)).not.toBeNull();

    workspace.figures = workspace.figures.map((figure, index) => index === 0 ? { ...figure, value: (figure.value ?? 0) + 1 } : figure);
    expect(currentDcfResult(workspace)).toBeNull();
    expect(workspace.dcfCalculationHash).toBe(dcfFingerprint(workspace.dcfInputs));
  });


});
