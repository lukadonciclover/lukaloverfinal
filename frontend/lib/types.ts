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
  document_identifier?: string;
  document_name: string;
  page?: number | null;
  quote: string;
  reporting_period: string;
  currency: string;
  unit_scale: number;
  confidence: number;
}

export interface FinancialFigure {
  record_id?: string;
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
  chunk_id?: string;
  page: number;
  text: string;
  document_name: string;
  document_identifier?: string;
  metadata: Record<string, unknown>;
  score?: number;
}

export interface FigureSuggestion {
  record_id?: string;
  units_confirmed?: boolean;
  currency_confirmed?: boolean;
  metric: string;
  period: string;
  value: number | null;
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
  base_revenue: number | null;
  revenue_growth: (number | null)[];
  ebit_margin: (number | null)[];
  tax_rate: (number | null)[];
  depreciation_pct_revenue: (number | null)[];
  capex_pct_revenue: (number | null)[];
  nwc_pct_revenue: (number | null)[];
  wacc: number | null;
  terminal_growth: number | null;
  cash: number | null;
  debt: number | null;
  minority_interest: number | null;
  non_operating_assets: number | null;
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
  id: string;
  agent_name: string;
  prompt: string;
  raw_output: string;
  parsed_output: Record<string, unknown> | null;
  valid: boolean;
  schema_valid: boolean;
  errors: string[];
  provenance: string;
  model_id: string;
  prompt_version: string;
  prompt_hash: string;
  input_hash: string;
  source_ids: string[];
  assumptions: Record<string, unknown>;
  created_at: string;
}

export type ClaimStatus = "verified" | "partially_supported" | "unsupported" | "contradicted";

export interface ClaimCitation {
  source_id: string;
  document_name: string;
  page: number | null;
  excerpt: string;
}

export interface ClaimAssessment {
  claim_id: string;
  claim: string;
  status: ClaimStatus;
  citations: ClaimCitation[];
  rationale: string;
  checks: string[];
  human_review_required: boolean;
  calculation_value?: number | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: string[];
  provenance?: string;
  input_hash?: string;
  source_ids?: string[];
}

export interface Experiment {
  id: string;
  strategy: string;
  task: string;
  prompt: string;
  prompt_version: string;
  benchmark_version: string;
  model_id: string;
  output: string;
  objective_metrics: Record<string, unknown>;
  human_judgments: { rating: number | null; notes: string };
  created_at: string;
}

export interface FinancialAnalysisSnapshot {
  analysis: Array<Record<string, number | string | null>>;
  quality_issues: string[];
  formulas: Record<string, string>;
  input_hash: string;
  created_at: string;
}

export interface ThesisSnapshot {
  sections: Record<string, Array<{ classification: string; text: string }>>;
  input_hash: string;
  created_at: string;
}

export interface ReportSnapshot {
  input_hash: string;
  format: "docx" | "pdf" | "xlsx";
  filename: string;
  created_at: string;
}

export interface WorkflowState {
  active: boolean;
  current_step: number;
}

export interface Workspace {
  assumptions?: import("./assumptions").Assumption[];
  assumptionAdoptions?: import("./assumptions").Adoption[];
  valuationWorkbench?: import("./workbench").WorkbenchSettings;
  version: 2;
  revision: number;
  company: Company;
  figures: FinancialFigure[];
  documents: DocumentRecord[];
  dcfInputs: DCFInputs;
  dcfResult: DCFResult | null;
  dcfInputHash: string | null;
  dcfCalculationHash: string | null;
  comparables: Comparable[];
  agentRuns: Record<string, AgentRun>;
  claimAssessments: ClaimAssessment[];
  chats: ChatMessage[];
  experiments: Experiment[];
  financialAnalysis: FinancialAnalysisSnapshot | null;
  thesis: ThesisSnapshot | null;
  reportSnapshot: ReportSnapshot | null;
  workflow: WorkflowState;
  settings: {
    mode: "Manual AI Mode" | "Configured External Inference" | "Financial Analytics Only";
    persistDocumentText: boolean;
  };
}

export interface ResearchProject {
  id: string;
  name: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  workspace: Workspace;
}

export interface Portfolio {
  portfolio_version: 1;
  active_project_id: string;
  projects: ResearchProject[];
}
