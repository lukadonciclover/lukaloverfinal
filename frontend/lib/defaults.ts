import type { DCFInputs, Workspace } from "./types";

export const defaultDCF: DCFInputs = {
  base_revenue: null, revenue_growth: [null,null,null,null,null], ebit_margin: [null,null,null,null,null],
  tax_rate: [null,null,null,null,null], depreciation_pct_revenue: [null,null,null,null,null],
  capex_pct_revenue: [null,null,null,null,null], nwc_pct_revenue: [null,null,null,null,null],
  wacc: null, terminal_growth: null, cash: null, debt: null, minority_interest: 0,
  non_operating_assets: 0, diluted_shares: null, reference_price: null
};
export function createBlankWorkspace(name = "Untitled company"): Workspace {
  return {
    version: 2, revision: 0,
    company: { id: Date.now(), name, ticker: null, country: "", industry: "",
      currency: "USD", reporting_standard: "", latest_financial_year: null,
      share_price: null, shares_outstanding: null, statement_dates: "",
      investment_horizon: "", required_return: null, analyst_notes: "", is_synthetic: false },
    figures: [], documents: [], dcfInputs: structuredClone(defaultDCF),
    dcfResult: null, dcfInputHash: null, dcfCalculationHash: null,
    comparables: [], agentRuns: {}, claimAssessments: [], chats: [], experiments: [],
    financialAnalysis: null, thesis: null, reportSnapshot: null,
    workflow: { active: true, current_step: 1 },
    settings: { mode: "Financial Analytics Only", persistDocumentText: false }
  };
}
