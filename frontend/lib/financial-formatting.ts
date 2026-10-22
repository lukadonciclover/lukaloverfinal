export type FinancialUnit =
  | "currency"
  | "percentage"
  | "multiple"
  | "per-share"
  | "quantity"
  | "year"
  | "number";

type Metric = { label: string; unit: FinancialUnit };

const groups: Record<FinancialUnit, string[]> = {
  currency: [
    "revenue",
    "cost_of_goods_sold",
    "gross_profit",
    "operating_expenses",
    "ebitda",
    "ebit",
    "interest_expense",
    "tax_expense",
    "net_income",
    "cash",
    "short_term_investments",
    "total_assets",
    "current_assets",
    "current_liabilities",
    "total_liabilities",
    "short_term_debt",
    "long_term_debt",
    "total_equity",
    "net_working_capital",
    "operating_cash_flow",
    "capital_expenditure",
    "investing_cash_flow",
    "financing_cash_flow",
    "free_cash_flow",
    "depreciation_amortization",
    "accounts_receivable",
    "inventory",
    "accounts_payable",
    "property_plant_equipment",
    "changes_in_working_capital",
    "working_capital",
    "net_debt",
    "base_revenue",
    "debt",
    "minority",
    "minority_interest",
    "non_operating_assets",
    "opening_nwc",
    "net_borrowing",
    "dividends",
    "minimum_cash",
    "market_equity",
    "market_debt",
    "market_cap",
    "book_assets",
    "book_liabilities",
    "asset_adjustment",
    "liability_adjustment",
    "enterprise_value",
    "equity_value",
    "book_equity",
    "low",
    "high",
    "terminal_value",
    "pv_terminal_value",
    "depreciation",
    "capex",
    "nwc",
    "change_nwc",
    "fcff",
    "pv_fcff",
    "cash_taxes",
    "nopat",
    "other_assets",
    "other_liabilities",
    "balance_check",
    "revolver_draw",
    "range",
  ],

  percentage: [
    "growth",
    "revenue_growth",
    "ebitda_growth",
    "ebit_growth",
    "net_income_growth",
    "revenue_cagr",
    "gross_margin",
    "ebitda_margin",
    "ebit_margin",
    "operating_margin",
    "net_profit_margin",
    "return_on_equity",
    "return_on_assets",
    "return_on_invested_capital",
    "operating_cash_flow_margin",
    "free_cash_flow_margin",
    "capex_intensity",
    "cash_conversion",
    "cash_flow_conversion",
    "tax_rate",
    "depreciation_pct_revenue",
    "capex_pct_revenue",
    "nwc_pct_revenue",
    "wacc",
    "terminal_growth",
    "opex_ratio",
    "depreciation_ratio",
    "capex_ratio",
    "nwc_ratio",
    "interest_rate",
    "risk_free",
    "equity_risk_premium",
    "cost_of_debt",
    "cost_of_equity",
    "growth_delta",
    "margin_delta",
    "wacc_delta",
    "terminal_delta",
    "upside_downside",
    "confidence",
    "equity_weight",
    "debt_weight",
  ],

  multiple: [
    "ev_ebitda",
    "ev_ebit",
    "ev_revenue",
    "pe",
    "pb",
    "ps",
    "exit_multiple",
    "exit_delta",
    "current_ratio",
    "debt_to_equity",
    "interest_coverage",
    "median",
    "average",
    "minimum",
    "maximum",
  ],

  "per-share": [
    "per_share",
    "implied_share_value",
    "price",
    "reference_price",
    "dividend",
    "share_price",
  ],

  quantity: ["shares", "diluted_shares", "shares_outstanding", "count"],

  year: ["year", "horizon"],

  number: ["unit_scale", "beta", "discount_factor"],
};

const labels: Record<string, string> = {
  ebit: "EBIT",
  ebitda: "EBITDA",
  revenue_cagr: "Revenue CAGR",
  fcff: "Free Cash Flow to Firm (FCFF)",

  nopat: "Net Operating Profit After Tax (NOPAT)",
  nwc: "Net Working Capital (NWC)",
  net_working_capital: "Net Working Capital (NWC)",

  return_on_equity: "Return on Equity (ROE)",
  return_on_assets: "Return on Assets (ROA)",
  return_on_invested_capital: "Return on Invested Capital (ROIC)",

  depreciation_amortization: "Depreciation & Amortization",
  pv_terminal_value: "PV of Terminal Value",
  pv_fcff: "PV of FCFF",

  ev_ebitda: "EV/EBITDA",
  ev_ebit: "EV/EBIT",
  ev_revenue: "EV/Revenue",
  pe: "P/E",
  pb: "P/B",
  ps: "P/S",

  wacc: "WACC",
  per_share: "Value Per Share",
  implied_share_value: "Implied Value Per Share",

  growth: "Growth Rate",
  growth_delta: "Revenue Growth Adjustment",
  margin_delta: "EBIT Margin Adjustment",

  wacc_delta: "WACC Adjustment",
  terminal_delta: "Terminal Growth Adjustment",
  exit_delta: "Exit Multiple Adjustment",

  opening_nwc: "Opening Net Working Capital",
  market_equity: "Market Value of Equity",
  market_debt: "Market Value of Debt",

  risk_free: "Risk-Free Rate",
  cost_of_equity: "Cost of Equity",
  cost_of_debt: "Cost of Debt",
  debt_to_equity: "Debt-to-Equity",
  non_operating_assets: "Non-Operating Assets",
  terminal_growth: "Terminal Growth Rate",
  net_borrowing: "Net Borrowing",

  depreciation_pct_revenue: "Depreciation / Revenue",
  capex_pct_revenue: "Capital Expenditure / Revenue",
  nwc_pct_revenue: "NWC / Revenue",

  opex_ratio: "Operating Expenses / Revenue",
  depreciation_ratio: "Depreciation / Revenue",
  capex_ratio: "Capital Expenditure / Revenue",
  nwc_ratio: "NWC / Revenue",

  dividend: "Dividend Per Share",
  dividends: "Total Dividends",
  price: "Reference Share Price",
  reference_price: "Reference Share Price",

  minority: "Minority Interest",
  change_nwc: "Change in NWC",
  unit_scale: "Unit Scale",
  exit_multiple: "Exit EV/EBITDA Multiple",

  range: "Equity Value Range",
  low: "Low Equity Value",
  high: "High Equity Value",
  balance_check: "Balance Sheet Check",

  cash_flow_conversion: "Operating Cash Flow / EBITDA",
  cash_conversion: "Operating Cash Flow / Net Income",

  DCF: "DCF",
  DDM: "DDM",
  Assets: "Asset-Based Valuation",
  Peers: "Trading Comparables",
  Transactions: "Precedent Transactions",
};

const acronyms: Record<string, string> = {
  ebit: "EBIT",
  ebitda: "EBITDA",
  wacc: "WACC",
  dcf: "DCF",
  ddm: "DDM",
  nwc: "NWC",
  fcff: "FCFF",
  cagr: "CAGR",
  pv: "PV",
  eps: "EPS",
};

function readable(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map(
      (word) =>
        acronyms[word.toLowerCase()] ??
        word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export const financialMetrics: Record<string, Metric> = Object.fromEntries(
  Object.entries(groups).flatMap(([unit, keys]) =>
    keys.map((key) => [
      key,
      { label: labels[key] ?? readable(key), unit: unit as FinancialUnit },
    ]),
  ),
);

export const formatFinancialLabel = (key: string) =>
  labels[key] ?? financialMetrics[key]?.label ?? readable(key);

export const financialUnit = (key: string): FinancialUnit =>
  financialMetrics[key]?.unit ?? "number";

const valid = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function formatCurrency(
  value: unknown,
  currency = "USD",
  compact = false,
): string {
  if (!valid(value)) return "Unavailable";

  const code = /^[A-Z]{3}$/.test(currency) ? currency : "USD";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    notation: compact && Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 2,
    minimumFractionDigits: compact && Math.abs(value) >= 10000 ? 0 : 2,
  }).format(value);
}

export function formatPercent(value: unknown) {
  return valid(value)
    ? new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 2,
      }).format(value)
    : "Unavailable";
}

export function formatMultiple(value: unknown) {
  return valid(value)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
        value,
      ) + "×"
    : "Unavailable";
}

export function formatFinancialValue(
  key: string,
  value: unknown,
  options: {
    currency?: string;
    compact?: boolean;
    scale?: number;
    unit?: FinancialUnit;
  } = {},
): string {
  if (typeof value === "string")
    return key === "multiple" ? formatFinancialLabel(value) : value;

  if (!valid(value)) return "Unavailable";

  const unit = options.unit ?? financialUnit(key);

  if (unit === "currency")
    return formatCurrency(
      value * (options.scale ?? 1),
      options.currency,
      options.compact,
    );

  if (unit === "per-share")
    return formatCurrency(value, options.currency) + "/share";

  if (unit === "percentage") return formatPercent(value);

  if (unit === "multiple") return formatMultiple(value);

  if (unit === "year") return String(value);

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: unit === "quantity" ? 4 : 6,
  }).format(value);
}

export function financialInputHint(key: string, currency: string) {
  const unit = financialUnit(key);

  return unit === "percentage"
    ? "Decimal rate (0.05 = 5%)"
    : unit === "currency"
      ? currency + " - actual units"
      : unit === "per-share"
        ? currency + " per share"
        : unit === "multiple"
          ? "Multiple (×)"
          : unit === "quantity"
            ? "Actual quantity"
            : undefined;
}

// Preserve backend messages, making identifiers readable only at presentation.

export const formatFinancialMessage = (message: string) =>
  message.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, formatFinancialLabel);
