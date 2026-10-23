import { historicalFixture } from "./historical-fixture";
import { fillHistorical } from "@/lib/historical-references";
export function sourcedWorkspace() {
  let w = historicalFixture();
  const document = {
    identifier: "source",
    name: "Synthetic report",
    document_type: "Financial dataset",
    reporting_period: "2025",
    pages: 1,
    warning: "",
    extraction_status: "processed",
    retained_by_server: false,
    chunks: [],
    suggestions: [],
  };
  w.documents = [
    document,
    { ...document, identifier: "other", name: "Unrelated report" },
  ];
  w.figures = w.figures.map((f) => ({
    ...f,
    source: {
      document_identifier: "source",
      document_name: document.name,
      quote: "private excerpt",
      reporting_period: f.period,
      currency: "USD",
      unit_scale: 1,
      confidence: 1,
    },
  }));
  for (const source of [
    ...w.historicalReferences!.averages.map((a) => a.source),
    ...w.historicalReferences!.latest,
  ])
    source.inputs = [
      {
        metric: w.figures[0].metric,
        period: w.figures[0].period,
        value: w.figures[0].value!,
        unit_scale: 1,
        currency: "USD",
        document_id: "source",
      },
    ];
  w = fillHistorical(w, "forecast").workspace;
  w = fillHistorical(w, "valuation").workspace;
  w.financialAnalysis = {
    analysis: [],
    quality_issues: [],
    formulas: {},
    input_hash: "test",
    created_at: "2026-01-01",
  };
  return w;
}
