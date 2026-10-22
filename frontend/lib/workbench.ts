import type { Workspace } from "./types";

export interface ForecastSettings {
  horizon: 3 | 5 | 10;
  growth: number;
  gross_margin: number;
  ebitda_margin: number;
  opex_ratio: number | null;
  depreciation_ratio: number;
  tax_rate: number;
  capex_ratio: number;
  nwc_ratio: number;
  interest_rate: number;
  net_borrowing: number;
  dividends: number;
  minimum_cash: number;
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
  forecast: ForecastSettings;
  wacc: {
    risk_free: number;
    beta: number;
    equity_risk_premium: number;
    cost_of_debt: number;
    tax_rate: number;
    market_equity: number;
    market_debt: number;
  };
  ddm: {
    dividend: number;
    growth: number;
    terminal_growth: number;
    cost_of_equity: number;
    horizon: 0 | 3 | 5 | 10;
  };
  assets: {
    book_assets: number;
    book_liabilities: number;
    asset_adjustment: number;
    liability_adjustment: number;
  };
  peers: PeerInput[];
  transactions: PeerInput[];
  cash: number | null;
  debt: number | null;
  shares: number | null;
  price: number | null;
  minority: number;
  non_operating_assets: number;
  terminal_method: "growth" | "exit_multiple";
  exit_multiple: number;
  opening_nwc: number | null;
  scenarios: Record<
    string,
    {
      growth_delta: number;
      margin_delta: number;
      wacc_delta: number;
      terminal_delta: number;
      exit_delta: number;
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
        growth: 0.05,
        gross_margin: 0.4,
        ebitda_margin: 0.2,
        opex_ratio: null,
        depreciation_ratio: 0.03,
        tax_rate: 0.25,
        capex_ratio: 0.04,
        nwc_ratio: 0.15,
        interest_rate: 0.05,
        net_borrowing: 0,
        dividends: 0,
        minimum_cash: 0,
        financing: "revolver",
      },
      wacc: {
        risk_free: 0.04,
        beta: 1,
        equity_risk_premium: 0.05,
        cost_of_debt: 0.05,
        tax_rate: 0.25,
        market_equity: 0,
        market_debt: 0,
      },
      ddm: {
        dividend: 0,
        growth: 0.05,
        terminal_growth: 0.02,
        cost_of_equity: 0.1,
        horizon: 5,
      },
      assets: {
        book_assets: 0,
        book_liabilities: 0,
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
      exit_multiple: 10,
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
    figures: w.figures,
    forecast: s.enabled.forecast ? s.forecast : null,
    dcf: s.enabled.dcf
      ? {
          ...w.dcfInputs,
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
