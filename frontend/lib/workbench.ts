import type { Workspace } from "./types";

export interface ForecastSettings {
  horizon: 3 | 5 | 10;
  growth: number | null;
  gross_margin: number | null;
  ebitda_margin: number | null;
  opex_ratio: number | null;
  depreciation_ratio: number | null;
  tax_rate: number | null;
  capex_ratio: number | null;
  nwc_ratio: number | null;
  interest_rate: number | null;
  net_borrowing: number | null;
  dividends: number | null;
  minimum_cash: number | null;
  financing: "revolver" | "none";
}
export interface PeerInput {
  company: string;
  selected: boolean;
  currency: string;
  unit_scale: number;
  acquisition_date: string;
  market_cap: number | null;
  enterprise_value: number | null;
  debt: number | null;
  cash: number | null;
  revenue: number | null;
  ebitda: number | null;
  ebit: number | null;
  net_income: number | null;
  book_equity: number | null;
}
export interface WorkbenchSettings {
  enabled: {
    forecast: boolean;
    dcf: boolean;
    wacc: boolean;
    ddm: boolean;
    assets: boolean;
    peers: boolean;
    transactions: boolean;
  };
  edited_inputs?: string[];
  profitability_method?: "ebitda" | "opex";
  forecast: ForecastSettings;
  wacc: {
    risk_free: number | null;
    beta: number | null;
    equity_risk_premium: number | null;
    cost_of_debt: number | null;
    tax_rate: number | null;
    market_equity: number | null;
    market_debt: number | null;
  };
  ddm: {
    dividend: number | null;
    growth: number | null;
    terminal_growth: number | null;
    cost_of_equity: number | null;
    horizon: 0 | 3 | 5 | 10;
  };
  assets: {
    book_assets: number | null;
    book_liabilities: number | null;
    asset_adjustment: number | null;
    liability_adjustment: number | null;
  };
  peers: PeerInput[];
  transactions: PeerInput[];
  cash: number | null;
  debt: number | null;
  shares: number | null;
  price: number | null;
  minority: number | null;
  non_operating_assets: number | null;
  terminal_method: "growth" | "exit_multiple";
  exit_multiple: number | null;
  opening_nwc: number | null;
  scenarios: Record<
    string,
    {
      growth_delta: number | null;
      margin_delta: number | null;
      wacc_delta: number | null;
      terminal_delta: number | null;
      exit_delta: number | null;
    }
  >;
}
export function settingsFor(w: Workspace): WorkbenchSettings {
  return (
    w.valuationWorkbench ?? {
      enabled: {
        forecast: false,
        dcf: false,
        wacc: false,
        ddm: false,
        assets: false,
        peers: false,
        transactions: false,
      },
      forecast: {
        horizon: 5,
        growth: null,
        gross_margin: null,
        ebitda_margin: null,
        opex_ratio: null,
        depreciation_ratio: null,
        tax_rate: null,
        capex_ratio: null,
        nwc_ratio: null,
        interest_rate: null,
        net_borrowing: 0,
        dividends: 0,
        minimum_cash: 0,
        financing: "revolver",
      },
      wacc: {
        risk_free: null,
        beta: null,
        equity_risk_premium: null,
        cost_of_debt: null,
        tax_rate: null,
        market_equity: null,
        market_debt: null,
      },
      ddm: {
        dividend: null,
        growth: null,
        terminal_growth: null,
        cost_of_equity: null,
        horizon: 5,
      },
      assets: {
        book_assets: null,
        book_liabilities: null,
        asset_adjustment: 0,
        liability_adjustment: 0,
      },
      peers: [],
      transactions: [],
      cash: null,
      debt: null,
      shares: w.company.shares_outstanding,
      price: w.company.share_price,
      minority: 0,
      non_operating_assets: 0,
      terminal_method: "growth",
      exit_multiple: null,
      opening_nwc: null,
      scenarios: {
        Bear: {
          growth_delta: -0.02,
          margin_delta: -0.02,
          wacc_delta: 0.01,
          terminal_delta: 0,
          exit_delta: -1,
        },
        Base: {
          growth_delta: 0,
          margin_delta: 0,
          wacc_delta: 0,
          terminal_delta: 0,
          exit_delta: 0,
        },
        Bull: {
          growth_delta: 0.02,
          margin_delta: 0.02,
          wacc_delta: -0.01,
          terminal_delta: 0,
          exit_delta: 1,
        },
      },
    }
  );
}
export function payloadFor(w: Workspace) {
  const s = settingsFor(w);
  return {
    currency: w.company.currency,
    figures: w.figures.map(({ record_id: _recordId, ...figure }) => figure),
    forecast: s.enabled.forecast
      ? {
          ...s.forecast,
          opex_ratio:
            profitabilityMethod(s) === "ebitda" ? null : s.forecast.opex_ratio,
          ebitda_margin:
            profitabilityMethod(s) === "opex"
              ? s.forecast.opex_ratio === null
                ? null
                : 0
              : s.forecast.ebitda_margin,
        }
      : null,
    dcf: s.enabled.dcf
      ? {
          ...w.dcfInputs,
          cash: s.cash,
          debt: s.debt,
          minority_interest: s.minority,
          non_operating_assets: s.non_operating_assets,
          diluted_shares: s.shares,
          reference_price: s.price,
          terminal_method: s.terminal_method,
          exit_multiple: s.exit_multiple,
          opening_nwc: s.opening_nwc,
        }
      : null,
    wacc: s.enabled.wacc ? s.wacc : null,
    ddm: s.enabled.ddm ? s.ddm : null,
    assets: s.enabled.assets ? s.assets : null,
    peers: s.enabled.peers ? s.peers : [],
    transactions: s.enabled.transactions ? s.transactions : [],
    cash: s.cash,
    debt: s.debt,
    shares: s.shares,
    price: s.price,
    minority: s.minority,
    non_operating_assets: s.non_operating_assets,
    scenarios: s.scenarios,
  };
}
export type NumericRow = Record<string, number | string | null>;
export interface ModelOutput {
  forecast?: NumericRow[];
  book_equity?: number;
  terminal_value?: number;
  pv_terminal_value?: number;
  equity_value?: number;
  per_share?: number | null;
  enterprise_value?: number;
  ranges?: Array<{
    multiple: string;
    low: number;
    high: number;
    equity_value: number;
    per_share: number | null;
    enterprise_value?: number | null;
  }>;
  multiples?: NumericRow[];
  statistics?: Record<string, Record<string, number>>;
  note?: string;
}
export interface WorkbenchResult {
  currency: string;
  unit_scale: number;
  history: Record<string, Record<string, number>>;
  forecast: NumericRow[];
  models: Record<string, ModelOutput>;
  errors: Record<string, string>;
  wacc?: Record<string, number>;
  scenarios: Record<string, ModelOutput | null>;
  sensitivities: Record<
    string,
    { columns: number[]; rows: number[]; values: (number | null)[][] }
  >;
}

export function profitabilityMethod(s: WorkbenchSettings): "ebitda" | "opex" {
  return (
    s.profitability_method ??
    (s.forecast.opex_ratio !== null ? "opex" : "ebitda")
  );
}
