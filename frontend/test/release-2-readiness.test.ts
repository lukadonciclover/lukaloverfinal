import { createBlankWorkspace } from "@/lib/defaults";
import { evaluateReadiness } from "@/lib/valuation-readiness";
import { payloadFor, settingsFor, type WorkbenchResult } from "@/lib/workbench";
import { historicalFixture } from "./historical-fixture";
import { sourcedWorkspace } from "./release-fixture";
import { workbookFingerprint } from "@/lib/export-fingerprint";
import { financialFingerprint } from "@/lib/fingerprint";
import { removeSource } from "@/lib/source-dependencies";
import { previewProjectBackup } from "@/lib/workspace";
const emptyResult = (): WorkbenchResult => ({
  currency: "USD",
  unit_scale: 1,
  history: {},
  forecast: [],
  models: {},
  errors: {},
  scenarios: {},
  sensitivities: {},
});
function stages(
  w: ReturnType<typeof createBlankWorkspace>,
  result?: WorkbenchResult,
) {
  return evaluateReadiness(
    w,
    result ? { input: JSON.stringify(payloadFor(w)), result } : undefined,
  );
}
it("describes an empty project without investment quality scores", () => {
  const rows = stages(createBlankWorkspace());
  expect(rows).toHaveLength(7);
  expect(rows[1].status).toBe("Missing Information");
  expect(rows[6].status).toBe("Missing Information");
});
it("distinguishes pending extraction suggestions from approved data", () => {
  const w = historicalFixture();
  w.documents = [
    {
      identifier: "doc",
      name: "Report",
      document_type: "financial",
      reporting_period: "2025",
      pages: 1,
      warning: "",
      extraction_status: "complete",
      retained_by_server: false,
      chunks: [],
      suggestions: [
        {
          metric: "revenue",
          period: "2025",
          value: 123,
          currency: "USD",
          unit_scale: 1,
          page: 1,
          quote: "",
          confidence: 1,
        },
      ],
    },
  ];
  expect(stages(w)[1]).toMatchObject({
    status: "Ready for Review",
    href: "/workspace#pending",
  });
});
it("recognizes approved figures and stale analysis", () => {
  const w = historicalFixture();
  expect(stages(w)[1].status).toBe("Complete");
  expect(stages(w)[2].status).toBe("Needs Recalculation");
});
it("recognizes current historical analysis and reference availability", () => {
  const w = historicalFixture();
  w.financialAnalysis = {
    analysis: [{ period: "2025" }],
    quality_issues: [],
    formulas: {},
    input_hash: financialFingerprint(w.figures),
    created_at: "",
  };
  expect(stages(w)[2].status).toBe("Complete");
  expect(w.historicalReferences?.averages.length).toBeGreaterThan(0);
});
it("explains missing operating assumptions", () => {
  const w = historicalFixture();
  w.valuationWorkbench = settingsFor(w);
  w.valuationWorkbench.enabled.forecast = true;
  expect(stages(w)[3].status).toBe("Missing Information");
  expect(stages(w)[3].explanation).toContain("Tax Rate");
});
it("shows backend forecast validation without calculating on the dashboard", () => {
  const w = historicalFixture(),
    result = emptyResult();
  w.valuationWorkbench = settingsFor(w);
  w.valuationWorkbench.enabled.forecast = true;
  result.errors.forecast = "Opening balance sheet does not balance.";
  expect(stages(w, result)[4]).toMatchObject({
    status: "Blocked by Validation",
    explanation: "Opening balance sheet does not balance.",
  });
});
it("recognizes a current valid DCF and export review", () => {
  const w = historicalFixture(),
    result = emptyResult();
  w.valuationWorkbench = settingsFor(w);
  w.valuationWorkbench.enabled.dcf = true;
  w.valuationWorkbench.cash = 0;
  w.valuationWorkbench.debt = 0;
  w.dcfInputs.wacc = 0.1;
  w.dcfInputs.terminal_growth = 0.02;
  w.dcfInputs.base_revenue = 100;
  for (const key of [
    "revenue_growth",
    "ebit_margin",
    "tax_rate",
    "depreciation_pct_revenue",
    "capex_pct_revenue",
    "nwc_pct_revenue",
  ] as const)
    w.dcfInputs[key] = Array(5).fill(0.05);
  result.models.DCF = { equity_value: 100 };
  expect(stages(w, result)[5].status).toBe("Complete");
  expect(stages(w, result)[6].status).toBe("Ready for Review");
});
it("identifies missing WACC", () => {
  const w = historicalFixture();
  w.valuationWorkbench = settingsFor(w);
  w.valuationWorkbench.enabled.dcf = true;
  expect(stages(w)[5].status).toBe("Missing Information");
  expect(stages(w)[5].explanation).toContain("WACC");
});
it("blocks incompatible peer reporting periods using the actual model error", () => {
  const w = historicalFixture(),
    result = emptyResult();
  result.errors["Trading comparables"] =
    "Annual multiples are incompatible with TTM target financials.";
  expect(stages(w, result)[5].status).toBe("Blocked by Validation");
  expect(stages(w, result)[5].explanation).toContain("incompatible");
});
it("retains removed-source blocks in readiness and backup round trips", () => {
  const w = sourcedWorkspace();
  w.valuationWorkbench = settingsFor(w);
  w.valuationWorkbench.enabled.dcf = true;
  const removed = removeSource(w, "source", w.revision);
  expect(stages(removed)[5].status).toBe("Blocked by Validation");
  const imported = previewProjectBackup(
    JSON.stringify({
      equitylens_project_version: 1,
      project: { name: "Backup", workspace: removed },
    }),
  );
  expect(imported.name).toBe("Backup");
  expect(stages(imported.workspace)[5].status).toBe("Blocked by Validation");
});
it("rejects stale results after changes and identifies duplicate ledger rows", () => {
  const w = historicalFixture(),
    snapshot = {
      input: JSON.stringify(payloadFor(historicalFixture())),
      result: emptyResult(),
    };
  snapshot.result.models.DCF = { equity_value: 123 };
  w.figures.push({ ...w.figures[0] });
  expect(evaluateReadiness(w, snapshot)[1].status).toBe(
    "Blocked by Validation",
  );
});
it("rejects invalid backups without creating projects", () => {
  expect(() => previewProjectBackup("{}")).toThrow();
  expect(() => previewProjectBackup("not JSON")).toThrow();
});

it("marks the full validated workflow complete only after a current export", () => {
  const w = historicalFixture(),
    result = emptyResult();
  w.valuationWorkbench = settingsFor(w);
  w.valuationWorkbench.enabled.forecast = true;
  w.valuationWorkbench.enabled.dcf = true;
  w.valuationWorkbench.forecast = {
    ...w.valuationWorkbench.forecast,
    growth: 0.05,
    gross_margin: 0.4,
    ebitda_margin: 0.2,
    depreciation_ratio: 0.03,
    tax_rate: 0.25,
    capex_ratio: 0.04,
    nwc_ratio: 0.1,
    interest_rate: 0.05,
  };
  w.valuationWorkbench.cash = 0;
  w.valuationWorkbench.debt = 0;
  w.dcfInputs.wacc = 0.1;
  w.dcfInputs.terminal_growth = 0.02;
  w.financialAnalysis = {
    analysis: [{ period: "2025" }],
    quality_issues: [],
    formulas: {},
    input_hash: financialFingerprint(w.figures),
    created_at: "",
  };
  result.forecast = [{ year: 2026 }];
  result.models.DCF = { equity_value: 100 };
  w.modelExport = {
    input_hash: workbookFingerprint(w),
    filename: "model.xlsx",
    created_at: "",
  };
  expect(stages(w, result).every((s) => s.status === "Complete")).toBe(true);
  w.valuationWorkbench.cash = 10;
  expect(stages(w, result)[6].status).toBe("Ready for Review");
});
