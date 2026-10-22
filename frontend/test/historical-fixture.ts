import { createTestWorkspace } from "./fixtures";
import { financialFingerprint } from "@/lib/fingerprint";
import type { Assumption } from "@/lib/assumptions";
export function historicalFixture() {
  const w = createTestWorkspace();
  w.figures = [
    ...w.figures,
    ...Object.entries({
      ebitda: 20,
      ebit: 15,
      gross_profit: 40,
      capital_expenditure: -4,
      depreciation_amortization: 5,
      net_working_capital: 10,
      pretax_income: 10,
      tax_expense: 2,
      cash: 12,
      short_term_debt: 3,
      long_term_debt: 7,
      total_assets: 200,
      total_liabilities: 80,
      operating_expenses: 20,
    }).map(([metric, value]) => ({ ...w.figures[0], metric, value })),
  ];
  const source = (
    metric: string,
    value: number,
    unit = "percentage",
  ): Assumption => ({
    id: `synthetic-average-${metric}`,
    metric,
    value,
    minimum: null,
    maximum: null,
    unit,
    currency: "USD",
    unit_scale: 1,
    period: "2025",
    basis: unit === "percentage" ? "historical average" : "annual",
    scope: "consolidated",
    classification: "historical derived",
    explicit: false,
    document_id: "approved-ledger",
    document_name: "Approved historical ledger",
    page: null,
    excerpt: "",
    confidence: 1,
    status: "pending",
    rationale: "Synthetic test reference from approved ledger",
    inputs: [],
  });
  w.historicalReferences = {
    window: 3,
    periods: ["2025"],
    available_years: ["2025"],
    currency: "USD",
    input_hash: financialFingerprint(w.figures),
    created_at: "2026-01-01T00:00:00Z",
    issues: [],
    averages: Object.entries({
      revenue_growth: 0.1,
      gross_margin: 0.4,
      ebitda_margin: 0.2,
      ebit_margin: 0.15,
      capex_ratio: 0.04,
      depreciation_ratio: 0.05,
      nwc_ratio: 0.1,
      tax_rate: 0.2,
      opex_ratio: 0.2,
    }).map(([metric, value]) => ({
      metric,
      value,
      count: 1,
      periods: ["2025"],
      observations: [source(metric, value)],
      source: source(metric, value),
      unavailable: "",
      prefill_eligible: true,
    })),
    latest: Object.entries({
      base_revenue: 100,
      opening_nwc: 10,
      cash: 12,
      debt: 10,
      book_assets: 200,
      book_liabilities: 80,
    }).map(([metric, value]) => source(metric, value, "currency")),
  };
  return w;
}
