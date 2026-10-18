import type { DCFInputs, FinancialFigure, Workspace } from "@/lib/types";

const history: Record<string, Record<string, number>> = {
  "2021": { revenue: 820, gross_profit: 328, ebitda: 139, ebit: 112, net_income: 70, cash: 95, short_term_investments: 15, total_assets: 900, current_assets: 290, current_liabilities: 165, short_term_debt: 25, long_term_debt: 220, total_equity: 390, operating_cash_flow: 125, capital_expenditure: 55 },
  "2022": { revenue: 910, gross_profit: 373, ebitda: 164, ebit: 133, net_income: 84, cash: 108, short_term_investments: 18, total_assets: 980, current_assets: 310, current_liabilities: 170, short_term_debt: 22, long_term_debt: 210, total_equity: 430, operating_cash_flow: 145, capital_expenditure: 62 },
  "2023": { revenue: 1020, gross_profit: 428, ebitda: 194, ebit: 158, net_income: 103, cash: 130, short_term_investments: 20, total_assets: 1080, current_assets: 345, current_liabilities: 180, short_term_debt: 20, long_term_debt: 195, total_equity: 495, operating_cash_flow: 174, capital_expenditure: 70 },
  "2024": { revenue: 1140, gross_profit: 490, ebitda: 228, ebit: 188, net_income: 124, cash: 152, short_term_investments: 25, total_assets: 1190, current_assets: 390, current_liabilities: 192, short_term_debt: 18, long_term_debt: 180, total_equity: 570, operating_cash_flow: 202, capital_expenditure: 78 },
  "2025": { revenue: 1265, gross_profit: 557, ebitda: 266, ebit: 221, net_income: 146, cash: 180, short_term_investments: 30, total_assets: 1320, current_assets: 440, current_liabilities: 205, short_term_debt: 15, long_term_debt: 165, total_equity: 660, operating_cash_flow: 235, capital_expenditure: 85 }
};

export function demoFigures(): FinancialFigure[] {
  return Object.entries(history).flatMap(([period, values]) =>
    Object.entries(values).map(([metric, value]) => ({
      company_id: 1,
      metric,
      period,
      value,
      currency: "USD",
      unit_scale: 1_000_000,
      origin: "reported" as const,
      source: {
        document_name: "Built-in synthetic dataset",
        quote: "Generated solely for product demonstration and testing.",
        reporting_period: "2021-2025",
        currency: "USD",
        unit_scale: 1_000_000,
        confidence: 1
      },
      notes: "Synthetic demonstration figure; amount shown in USD millions."
    }))
  );
}

export const defaultDCF: DCFInputs = {
  base_revenue: 1265,
  revenue_growth: [0.08, 0.08, 0.075, 0.07, 0.065],
  ebit_margin: [0.18, 0.185, 0.19, 0.195, 0.2],
  tax_rate: [0.25, 0.25, 0.25, 0.25, 0.25],
  depreciation_pct_revenue: [0.04, 0.04, 0.04, 0.04, 0.04],
  capex_pct_revenue: [0.05, 0.05, 0.05, 0.05, 0.05],
  nwc_pct_revenue: [0.1, 0.1, 0.1, 0.1, 0.1],
  wacc: 0.1,
  terminal_growth: 0.025,
  cash: 180,
  debt: 180,
  minority_interest: 0,
  non_operating_assets: 0,
  diluted_shares: 50,
  reference_price: 31.5
};

export function createDemoWorkspace(): Workspace {
  return {
    version: 2,
    revision: 0,
    company: {
      id: 1,
      name: "Northstar Components (Synthetic)",
      ticker: "SYNTH",
      country: "United States",
      industry: "Industrial technology",
      currency: "USD",
      reporting_standard: "Synthetic demonstration",
      latest_financial_year: 2025,
      share_price: 31.5,
      shares_outstanding: 50,
      statement_dates: "Fiscal year ending December 31",
      investment_horizon: "3-5 years",
      required_return: 0.1,
      analyst_notes: "All figures are synthetic and expressed in USD millions.",
      is_synthetic: true
    },
    figures: demoFigures(),
    documents: [],
    dcfInputs: structuredClone(defaultDCF),
    dcfResult: null,
    dcfInputHash: null,
    dcfCalculationHash: null,
    comparables: [],
    agentRuns: {},
    claimAssessments: [],
    chats: [],
    experiments: [],
    financialAnalysis: null,
    thesis: null,
    reportSnapshot: null,
    workflow: { active: false, current_step: 1 },
    settings: { mode: "Manual AI Mode", persistDocumentText: false }
  };
}

export function createBlankWorkspace(name = "Untitled company"): Workspace {
  const workspace = createDemoWorkspace();
  return {
    ...workspace,
    company: {
      ...workspace.company,
      id: Date.now(),
      name,
      ticker: null,
      country: "",
      industry: "",
      reporting_standard: "",
      latest_financial_year: null,
      share_price: null,
      shares_outstanding: null,
      statement_dates: "",
      analyst_notes: "",
      is_synthetic: false
    },
    figures: [],
    documents: [],
    dcfInputs: { ...structuredClone(defaultDCF), base_revenue: 0, cash: 0, debt: 0, diluted_shares: null, reference_price: null },
    comparables: [],
    workflow: { active: true, current_step: 1 }
  };
}
