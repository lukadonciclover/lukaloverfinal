export type ValueOrigin = "reported" | "derived" | "user-supplied" | "ai-estimate";

export interface Company {
  id: number;
  name: string;
  ticker: string | null;
  country: string;
  industry: string;
  currency: string;
  reporting_standard: string;
  latest_financial_year: number | null;
  share_price: number | null;
  shares_outstanding: number | null;
  statement_dates: string;
  investment_horizon: string;
  required_return: number | null;
  analyst_notes: string;
  is_synthetic: boolean;
}

export interface SourceRef {
  document_id?: number | null;
  document_name: string;
  page?: number | null;
  quote: string;
  reporting_period: string;
  currency: string;
  unit_scale: number;
  confidence: number;
}

export interface FinancialFigure {
  id?: number | null;
  company_id: number;
  metric: string;
  period: string;
  value: number | null;
  currency: string;
  unit_scale: number;
  origin: ValueOrigin;
  source?: SourceRef | null;
  notes: string;
}

export interface EvidenceChunk {
  page: number;
  text: string;
  document_name: string;
  document_identifier?: string;
  metadata: Record<string, unknown>;
  score?: number;
}

export interface FigureSuggestion {
  metric: string;
  period: string;
  value: number;
  currency: string;
  unit_scale: number;
  page: number;
  quote: string;
  confidence: number;
  accepted?: boolean;
}

export interface DocumentRecord {
  identifier: string;
  name: string;
  document_type: string;
  reporting_period: string;
  pages: number;
  warning: string;
  extraction_status: string;
  retained_by_server: boolean;
  chunks: EvidenceChunk[];
  suggestions: FigureSuggestion[];
}

export interface DCFInputs {
  base_revenue: number;
  revenue_growth: number[];
  ebit_margin: number[];
  tax_rate: number[];
  depreciation_pct_revenue: number[];
  capex_pct_revenue: number[];
  nwc_pct_revenue: number[];
  wacc: number;
  terminal_growth: number;
  cash: number;
  debt: number;
  minority_interest: number;
  non_operating_assets: number;
  diluted_shares: number | null;
  reference_price: number | null;
}

export interface DCFResult {
  forecast: Record<string, number>[];
  enterprise_value: number;
  equity_value: number;
  implied_share_value: number | null;
  terminal_value: number;
  pv_terminal_value: number;
  upside_downside: number | null;
  timing_convention: string;
  scenarios: Record<string, DCFResult>;
  sensitivity: { rows: string[]; columns: string[]; values: Array<Array<number | null>> };
}

export interface Comparable {
  company: string;
  market_cap: number | null;
  debt: number | null;
  cash: number | null;
  enterprise_value: number | null;
  revenue: number | null;
  ebitda: number | null;
  ebit: number | null;
  net_income: number | null;
}

export interface AgentRun {
  agent_name: string;
  prompt: string;
  raw_output: string;
  parsed_output: Record<string, unknown> | null;
  valid: boolean;
  errors: string[];
  provenance: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: string[];
  provenance?: string;
}

export interface Experiment {
  id: string;
  strategy: string;
  task: string;
  output: string;
  metrics: Record<string, unknown>;
}

export interface Workspace {
  version: 1;
  company: Company;
  figures: FinancialFigure[];
  documents: DocumentRecord[];
  dcfInputs: DCFInputs;
  dcfResult: DCFResult | null;
  comparables: Comparable[];
  agentRuns: Record<string, AgentRun>;
  chats: ChatMessage[];
  experiments: Experiment[];
  settings: {
    mode: "Manual AI Mode" | "Configured External Inference" | "Financial Analytics Only";
    persistDocumentText: boolean;
  };
}
