"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createBlankWorkspace } from "@/lib/defaults";
import { dcfFingerprint, valuationFingerprint } from "@/lib/fingerprint";
import { deleteIndexedWorkspace, loadIndexedWorkspace, saveIndexedWorkspace } from "@/lib/storage";
import type { AgentRun, Experiment, Portfolio, ResearchProject, Workspace } from "@/lib/types";
import { markHistoricalEdits } from "./historical-references";
import { redactEvidence, validateAssumptions } from "./assumptions";
import { settingsFor } from "@/lib/workbench";

const LEGACY_STORAGE_KEY = "equitylens-workspace-v1";
const RETENTION_OPT_OUT_KEY = "equitylens-document-retention-disabled";
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_PROJECTS = 100;

export type PersistenceStatus = "loading" | "saving" | "saved" | "local-only" | "error";

interface WorkspaceContextValue {
  workspace: Workspace | null;
  project: ResearchProject | null;
  projects: ResearchProject[];
  activeProjectId: string;
  hydrated: boolean;
  persistenceStatus: PersistenceStatus;
  persistenceMessage: string;
  updateWorkspace: (updater: Workspace | ((current: Workspace) => Workspace)) => void;
  createProject: (name?: string) => string;
  renameProject: (projectId: string, name: string) => void;
  duplicateProject: (projectId: string) => string;
  switchProject: (projectId: string) => void;
  archiveProject: (projectId: string) => void;
  restoreProject: (projectId: string) => void;
  setDocumentRetention: (enabled: boolean) => Promise<void>;
  resetWorkspace: () => void;
  exportWorkspace: () => string;
  importWorkspace: (raw: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function now(): string {
  return new Date().toISOString();
}

function newProject(workspace: Workspace, name: string): ResearchProject {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 300) throw new Error("Project name is missing or too long.");
  const timestamp = now();
  return { id: crypto.randomUUID(), name: cleanName, archived: false, created_at: timestamp, updated_at: timestamp, workspace };
}

function validateWorkspace(workspace: Workspace): void {
  validateAssumptions(workspace);
  if (workspace.historicalReferences !== undefined) {
    const refs=workspace.historicalReferences;
    if (!record(refs) || ![2,3,5].includes(refs.window) || typeof refs.input_hash!=="string" || typeof refs.currency!=="string" || typeof refs.created_at!=="string" || !Array.isArray(refs.averages) || !Array.isArray(refs.latest) || !Array.isArray(refs.periods) || !Array.isArray(refs.available_years) || !Array.isArray(refs.issues) || [...refs.periods,...refs.available_years,...refs.issues].some(v=>typeof v!=="string")) throw new Error("Malformed historical references.");
    if(refs.averages.some(a=>!record(a) || typeof a.metric!=="string" || !finiteOrNull(a.value) || !Number.isInteger(a.count) || a.count<0 || !Array.isArray(a.observations) || !Array.isArray(a.periods) || typeof a.unavailable!=="string")) throw new Error("Malformed historical averages.");
    validateAssumptions({...workspace,assumptionAdoptions:[],assumptions:[...refs.latest,...refs.averages.flatMap(a=>[a.source,...a.observations])]});
  }
  if (workspace.valuationWorkbench !== undefined) {
    const template = settingsFor({ ...workspace, valuationWorkbench: undefined });
    const validateSettings = (value: unknown, expected: unknown, path: string): void => {
      if (expected === null) {
        if (!finiteOrNull(value)) throw new Error(`Invalid valuation input: ${path}`);
      } else if (Array.isArray(expected)) {
        if (!Array.isArray(value) || value.length > 500 || value.some(row => !record(row))) throw new Error(`Invalid valuation rows: ${path}`);
      } else if (record(expected)) {
        if (!record(value)) throw new Error(`Missing valuation settings: ${path}`);
        for (const [key, item] of Object.entries(expected)) validateSettings(value[key], item, `${path}.${key}`);
      } else if (typeof expected === "number" ? !finiteOrNull(value) : typeof value !== typeof expected) {
        throw new Error(`Invalid valuation setting: ${path}`);
      }
    };
    validateSettings(workspace.valuationWorkbench, template, "valuationWorkbench");
  }
  if (typeof workspace.company.name !== "string" || !workspace.company.name.trim() || workspace.company.name.length > 300) throw new Error("Company name is missing or too long.");
  if (typeof workspace.company.currency !== "string" || !/^[A-Z]{3}$/.test(workspace.company.currency)) throw new Error("Company currency must be a three-letter code.");
  if (workspace.figures.length > 10_000 || workspace.documents.length > 100 || workspace.chats.length > 2_000 || workspace.experiments.length > 1_000 || workspace.claimAssessments.length > 2_000 || Object.keys(workspace.agentRuns).length > 100) throw new Error("Workspace exceeds supported record limits.");
  for (const figure of workspace.figures) {
    if (figure.company_id !== workspace.company.id || !figure.metric || !figure.period || !finiteOrNull(figure.value) || !Number.isFinite(figure.unit_scale) || figure.unit_scale <= 0) throw new Error("A financial figure is malformed or belongs to another company.");
  }
  for (const document of workspace.documents) {
    if (typeof document.identifier !== "string" || typeof document.name !== "string" || !document.identifier || !document.name || !Array.isArray(document.chunks) || !Array.isArray(document.suggestions)) throw new Error("A source document record is malformed.");
  }
  for (const row of workspace.comparables) {
    if (typeof row.company !== "string" || Object.entries(row).some(([key, value]) => key !== "company" && !finiteOrNull(value))) throw new Error("A comparable-company row is malformed.");
  }
  for (const chat of workspace.chats) {
    if (typeof chat.id !== "string" || !["user", "assistant"].includes(chat.role) || typeof chat.content !== "string" || !Array.isArray(chat.citations) || chat.citations.some((item) => typeof item !== "string")) throw new Error("A research-chat record is malformed.");
  }
  for (const claim of workspace.claimAssessments) {
    if (typeof claim.claim_id !== "string" || typeof claim.claim !== "string" || !["verified", "partially_supported", "unsupported", "contradicted"].includes(claim.status) || !Array.isArray(claim.citations) || claim.citations.some((citation) => !record(citation) || typeof citation.source_id !== "string" || typeof citation.document_name !== "string" || typeof citation.excerpt !== "string") || !Array.isArray(claim.checks) || claim.checks.some((check) => typeof check !== "string")) throw new Error("A claim assessment is malformed.");
  }
  if (workspace.dcfResult !== null && (!record(workspace.dcfResult) || !Array.isArray(workspace.dcfResult.forecast) || !record(workspace.dcfResult.scenarios) || !record(workspace.dcfResult.sensitivity) || !finiteOrNull(workspace.dcfResult.implied_share_value) || !finiteOrNull(workspace.dcfResult.equity_value))) throw new Error("The saved DCF result is malformed.");
  if (workspace.financialAnalysis !== null && (!Array.isArray(workspace.financialAnalysis.analysis) || workspace.financialAnalysis.analysis.some((row) => !record(row) || Object.values(row).some((item) => item !== null && typeof item !== "string" && !(typeof item === "number" && Number.isFinite(item)))) || !Array.isArray(workspace.financialAnalysis.quality_issues) || workspace.financialAnalysis.quality_issues.some((item) => typeof item !== "string") || !record(workspace.financialAnalysis.formulas) || Object.values(workspace.financialAnalysis.formulas).some((item) => typeof item !== "string") || typeof workspace.financialAnalysis.input_hash !== "string" || typeof workspace.financialAnalysis.created_at !== "string")) throw new Error("The saved financial analysis is malformed.");
  if (workspace.thesis !== null && (!record(workspace.thesis.sections) || Object.values(workspace.thesis.sections).some((items) => !Array.isArray(items) || items.some((item) => !record(item) || typeof item.classification !== "string" || typeof item.text !== "string")) || typeof workspace.thesis.input_hash !== "string" || typeof workspace.thesis.created_at !== "string")) throw new Error("The saved thesis is malformed.");
  if (workspace.reportSnapshot !== null && (typeof workspace.reportSnapshot.input_hash !== "string" || !["docx", "pdf", "xlsx"].includes(workspace.reportSnapshot.format) || typeof workspace.reportSnapshot.filename !== "string" || typeof workspace.reportSnapshot.created_at !== "string")) throw new Error("The saved report manifest is malformed.");
  if (typeof workspace.workflow.active !== "boolean" || !Number.isInteger(workspace.workflow.current_step) || workspace.workflow.current_step < 1 || workspace.workflow.current_step > 10) throw new Error("Workflow state is malformed.");
  if (!["Manual AI Mode", "Configured External Inference", "Financial Analytics Only"].includes(workspace.settings.mode) || typeof workspace.settings.persistDocumentText !== "boolean") throw new Error("Workspace settings are malformed.");
  const arrays = [workspace.dcfInputs.revenue_growth, workspace.dcfInputs.ebit_margin, workspace.dcfInputs.tax_rate, workspace.dcfInputs.depreciation_pct_revenue, workspace.dcfInputs.capex_pct_revenue, workspace.dcfInputs.nwc_pct_revenue];
  if (arrays.some((values) => !Array.isArray(values) || values.length === 0 || values.length > 20 || values.some((value) => !finiteOrNull(value)))) throw new Error("DCF forecast assumptions are malformed.");
  const scalars = [workspace.dcfInputs.base_revenue, workspace.dcfInputs.wacc, workspace.dcfInputs.terminal_growth, workspace.dcfInputs.cash, workspace.dcfInputs.debt, workspace.dcfInputs.minority_interest, workspace.dcfInputs.non_operating_assets];
  if (scalars.some((value) => !finiteOrNull(value)) || !finiteOrNull(workspace.dcfInputs.diluted_shares) || !finiteOrNull(workspace.dcfInputs.reference_price)) throw new Error("DCF scalar assumptions are malformed.");
}

function migrateAgentRun(name: string, value: unknown): AgentRun {
  if (!record(value)) throw new Error(`Agent run ${name} is malformed.`);
  return {
    id: typeof value.id === "string" ? value.id : crypto.randomUUID(), agent_name: typeof value.agent_name === "string" ? value.agent_name : name,
    prompt: typeof value.prompt === "string" ? value.prompt : "", raw_output: typeof value.raw_output === "string" ? value.raw_output : "",
    parsed_output: record(value.parsed_output) ? value.parsed_output : null, valid: value.valid === true, schema_valid: value.schema_valid === true || value.valid === true,
    errors: Array.isArray(value.errors) ? value.errors.filter((item): item is string => typeof item === "string") : [], provenance: typeof value.provenance === "string" ? value.provenance : "Legacy workspace import",
    model_id: typeof value.model_id === "string" ? value.model_id : "Unknown legacy model", prompt_version: typeof value.prompt_version === "string" ? value.prompt_version : "legacy-v1",
    prompt_hash: typeof value.prompt_hash === "string" ? value.prompt_hash : "legacy", input_hash: typeof value.input_hash === "string" ? value.input_hash : "legacy",
    source_ids: Array.isArray(value.source_ids) ? value.source_ids.filter((item): item is string => typeof item === "string") : [], assumptions: record(value.assumptions) ? value.assumptions : {},
    created_at: typeof value.created_at === "string" ? value.created_at : new Date(0).toISOString()
  };
}

function migrateExperiment(value: unknown): Experiment {
  if (!record(value)) throw new Error("An experiment record is malformed.");
  const legacyMetrics = record(value.metrics) ? value.metrics : {};
  return {
    id: typeof value.id === "string" ? value.id : crypto.randomUUID(), strategy: typeof value.strategy === "string" ? value.strategy : "Unknown strategy",
    task: typeof value.task === "string" ? value.task : "Unknown task", prompt: typeof value.prompt === "string" ? value.prompt : "",
    prompt_version: typeof value.prompt_version === "string" ? value.prompt_version : "legacy-v1", benchmark_version: typeof value.benchmark_version === "string" ? value.benchmark_version : "legacy-v1",
    model_id: typeof value.model_id === "string" ? value.model_id : "Unknown legacy model", output: typeof value.output === "string" ? value.output : "",
    objective_metrics: record(value.objective_metrics) ? value.objective_metrics : legacyMetrics,
    human_judgments: record(value.human_judgments) ? { rating: finiteOrNull(value.human_judgments.rating) ? value.human_judgments.rating : null, notes: typeof value.human_judgments.notes === "string" ? value.human_judgments.notes : "" } : { rating: null, notes: "" },
    created_at: typeof value.created_at === "string" ? value.created_at : new Date(0).toISOString()
  };
}

export function parseWorkspace(value: unknown, allowSensitiveRetention = true): Workspace {
  if (!record(value) || ![1, 2].includes(Number(value.version)) || !record(value.company) || !Array.isArray(value.figures)) throw new Error("This file is not a supported EquityLens workspace export.");
  const defaults = createBlankWorkspace();
  if (!record(value.dcfInputs) || !Array.isArray(value.documents) || !Array.isArray(value.comparables) || !record(value.agentRuns) || !Array.isArray(value.chats) || !Array.isArray(value.experiments) || !record(value.settings)) throw new Error("The workspace is missing required sections.");
  const company = { ...defaults.company, ...value.company };
  const agentRuns = Object.fromEntries(Object.entries(value.agentRuns).map(([name, run]) => [name, migrateAgentRun(name, run)]));
  const documents = value.documents.map((documentValue) => {
    if (!record(documentValue) || !Array.isArray(documentValue.chunks) || !Array.isArray(documentValue.suggestions) || typeof documentValue.identifier !== "string") throw new Error("A source document record is malformed.");
    const suggestions = documentValue.suggestions.map((suggestion) => {
      if (!record(suggestion) || typeof suggestion.metric !== "string" || typeof suggestion.period !== "string" || !finiteOrNull(suggestion.value) || typeof suggestion.unit_scale !== "number" || !Number.isFinite(suggestion.unit_scale) || typeof suggestion.quote !== "string") throw new Error("A document suggestion is malformed.");
      return suggestion;
    });
    return { ...documentValue, suggestions, chunks: documentValue.chunks.map((chunkValue, index) => {
      if (!record(chunkValue) || typeof chunkValue.text !== "string" || typeof chunkValue.page !== "number") throw new Error("An evidence chunk is malformed.");
      return { ...chunkValue, chunk_id: typeof chunkValue.chunk_id === "string" ? chunkValue.chunk_id : `legacy-${documentValue.identifier}-${chunkValue.page}-${index}`, document_identifier: typeof chunkValue.document_identifier === "string" ? chunkValue.document_identifier : documentValue.identifier };
    }) };
  }) as unknown as Workspace["documents"];
  const figures = value.figures.map((figureValue) => {
    if (!record(figureValue)) throw new Error("A financial figure is malformed.");
    const source = record(figureValue.source) ? figureValue.source : null;
    const matchedDocument = source ? documents.find((document) => document.name === source.document_name) : null;
    return { ...figureValue, company_id: company.id, ...(source ? { source: { ...source, document_identifier: typeof source.document_identifier === "string" ? source.document_identifier : matchedDocument?.identifier ?? "" } } : {}) };
  }) as unknown as Workspace["figures"];
  const workspace = {
    ...defaults, ...value, version: 2, revision: typeof value.revision === "number" && Number.isInteger(value.revision) ? value.revision : 0,
    company, dcfInputs: { ...defaults.dcfInputs, ...value.dcfInputs }, dcfInputHash: typeof value.dcfInputHash === "string" ? value.dcfInputHash : null,
    dcfCalculationHash: typeof value.dcfCalculationHash === "string" ? value.dcfCalculationHash : null,
    figures, documents, agentRuns, claimAssessments: Array.isArray(value.claimAssessments) ? value.claimAssessments : [], experiments: value.experiments.map(migrateExperiment),
    financialAnalysis: record(value.financialAnalysis) ? value.financialAnalysis : null, thesis: record(value.thesis) ? value.thesis : null,
    reportSnapshot: record(value.reportSnapshot) ? value.reportSnapshot : null,
    workflow: record(value.workflow) ? { active: value.workflow.active === true, current_step: Number(value.workflow.current_step) } : defaults.workflow,
    settings: { ...defaults.settings, ...value.settings, persistDocumentText: allowSensitiveRetention && value.settings.persistDocumentText === true }
  } as Workspace;
  if (workspace.dcfResult && workspace.dcfInputHash === dcfFingerprint(workspace.dcfInputs)) {
    workspace.dcfCalculationHash = workspace.dcfInputHash;
    workspace.dcfInputHash = valuationFingerprint(workspace);
  } else if (workspace.dcfResult && !workspace.dcfCalculationHash) {
    workspace.dcfCalculationHash = dcfFingerprint(workspace.dcfInputs);
  }
  validateWorkspace(workspace);
  return workspace.settings.persistDocumentText ? workspace : persistenceCopy(workspace);
}

function parsePortfolio(value: unknown, allowSensitiveRetention: boolean): Portfolio {
  if (!record(value) || value.portfolio_version !== 1 || !Array.isArray(value.projects) || typeof value.active_project_id !== "string") {
    const workspace = parseWorkspace(value, allowSensitiveRetention);
    const project = newProject(workspace, workspace.company.name);
    return { portfolio_version: 1, active_project_id: project.id, projects: [project] };
  }
  if (value.projects.length > MAX_PROJECTS) throw new Error("Portfolio has an unsupported number of projects.");
  const projects = value.projects.map((item) => {
    if (!record(item) || typeof item.id !== "string" || typeof item.name !== "string" || !item.name.trim() || item.name.length > 300) throw new Error("A project record is malformed.");
    return { id: item.id, name: item.name, archived: item.archived === true, created_at: typeof item.created_at === "string" ? item.created_at : now(), updated_at: typeof item.updated_at === "string" ? item.updated_at : now(), workspace: parseWorkspace(item.workspace, allowSensitiveRetention) };
  });
  if (new Set(projects.map((project) => project.id)).size !== projects.length) throw new Error("Project IDs must be unique.");
  const available = projects.filter((project) => !project.archived);

  const active = available.some((project) => project.id === value.active_project_id) ? value.active_project_id : available[0]?.id ?? "";
  return { portfolio_version: 1, active_project_id: active, projects };
}

export function setRetentionPreference(enabled: boolean): void {
  if (enabled) window.localStorage.removeItem(RETENTION_OPT_OUT_KEY);
  else window.localStorage.setItem(RETENTION_OPT_OUT_KEY, "true");
}

export function persistenceCopy(workspace: Workspace): Workspace {
  if (workspace.settings.persistDocumentText) return workspace;
  return {
    ...workspace,
    historicalReferences: workspace.historicalReferences ? {...workspace.historicalReferences, latest: workspace.historicalReferences.latest.map(redactEvidence), averages: workspace.historicalReferences.averages.map(a=>({...a,source:redactEvidence(a.source),observations:a.observations.map(redactEvidence)}))} : undefined,
    assumptions: workspace.assumptions?.map(redactEvidence),
    assumptionAdoptions: workspace.assumptionAdoptions?.map(a => ({...a, source: redactEvidence(a.source)})),
    documents: workspace.documents.map((document) => ({ ...document, chunks: [], suggestions: document.suggestions.map((suggestion) => ({ ...suggestion, quote: "" })) })),
    figures: workspace.figures.map((figure) => ({ ...figure, source: figure.source ? { ...figure.source, quote: "" } : figure.source })),
    agentRuns: Object.fromEntries(Object.entries(workspace.agentRuns).map(([name, run]) => [name, run.source_ids.length || workspace.documents.length ? { ...run, prompt: "", raw_output: "", parsed_output: null, valid: false, errors: ["Source-derived text was not persisted by privacy policy."] } : run])),
    claimAssessments: [], chats: [], thesis: null
  };
}

function persistencePortfolioCopy(portfolio: Portfolio, allowSensitiveRetention = true): Portfolio {
  return { ...portfolio, projects: portfolio.projects.map((project) => ({ ...project, workspace: persistenceCopy(allowSensitiveRetention ? project.workspace : { ...project.workspace, settings: { ...project.workspace.settings, persistDocumentText: false } }) })) };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [portfolio, setPortfolio] = useState<Portfolio>({ portfolio_version: 1, active_project_id: "", projects: [] });
  const [hydrated, setHydrated] = useState(false);
  const [persistenceBlocked, setPersistenceBlocked] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("loading");
  const [persistenceMessage, setPersistenceMessage] = useState("Loading browser projects.");
  const latestPortfolioRef = useRef(portfolio);
  latestPortfolioRef.current = portfolio;
  const activeProject = portfolio.projects.find((project) => project.id === portfolio.active_project_id) ?? null;

  useEffect(() => {
    let active = true;
    async function hydrate() {
      let raw: unknown | null = null;
      try { raw = await loadIndexedWorkspace(); } catch { /* Fall back to the legacy store. */ }
      if (raw === null) {
        try { const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY); raw = legacy ? JSON.parse(legacy) : null; }
        catch (reason) { if (active) { setPersistenceBlocked(true); setPersistenceStatus("error"); setPersistenceMessage(reason instanceof Error ? reason.message : "Browser storage could not be read."); } }
      }
      if (raw !== null && active) {
        try {
          let allowSensitiveRetention = false;
          try { allowSensitiveRetention = window.localStorage.getItem(RETENTION_OPT_OUT_KEY) !== "true"; } catch { /* Default to redaction. */ }
          setPortfolio(parsePortfolio(raw, allowSensitiveRetention));
        } catch (reason) {
          setPersistenceBlocked(true); setPersistenceStatus("error"); setPersistenceMessage(reason instanceof Error ? `Saved projects were preserved but not loaded: ${reason.message}` : "Saved projects are invalid.");
        }
      }
      if (active) { setHydrated(true); setPersistenceStatus((current) => current === "error" ? current : "saved"); setPersistenceMessage((current) => current === "Loading browser projects." ? "Projects loaded. Changes are saved in this browser." : current); }
    }
    void hydrate();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || persistenceBlocked) return;
    setPersistenceStatus("saving"); setPersistenceMessage("Saving projects.");
    const savingPortfolio = portfolio;
    const timer = window.setTimeout(async () => {
      let allowSensitiveRetention = false;
      try { allowSensitiveRetention = window.localStorage.getItem(RETENTION_OPT_OUT_KEY) !== "true"; } catch { /* Default to redaction. */ }
      const copy = persistencePortfolioCopy(savingPortfolio, allowSensitiveRetention);
      try {
        await saveIndexedWorkspace(copy);
        try { window.localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* IndexedDB remains authoritative. */ }
        if (latestPortfolioRef.current === savingPortfolio) { setPersistenceStatus("saved"); setPersistenceMessage("Saved all projects to IndexedDB in this browser."); }
      } catch (indexedError) {
        let fallback = copy;
        try { if (window.localStorage.getItem(RETENTION_OPT_OUT_KEY) === "true") fallback = persistencePortfolioCopy(savingPortfolio, false); } catch { fallback = persistencePortfolioCopy(savingPortfolio, false); }
        try { window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(fallback)); setPersistenceStatus("local-only"); setPersistenceMessage("IndexedDB is unavailable. Saved with limited localStorage capacity."); }
        catch (localError) { const error = localError instanceof Error ? localError : indexedError; setPersistenceStatus("error"); setPersistenceMessage(error instanceof Error && error.name === "QuotaExceededError" ? "Browser storage quota was exceeded. Export now; recent changes are not saved." : "Browser persistence failed. Export now; recent changes are not saved."); }
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [portfolio, hydrated, persistenceBlocked]);

  const updateWorkspace = useCallback((updater: Workspace | ((current: Workspace) => Workspace)) => {
    const boundProjectId = activeProject?.id;
    setPortfolio((current) => ({ ...current, projects: current.projects.map((project) => {
      if (project.id !== boundProjectId) return project;
      const next = markHistoricalEdits(project.workspace, typeof updater === "function" ? updater(project.workspace) : updater);
      return next === project.workspace ? project : { ...project, updated_at: now(), workspace: { ...next, version: 2, revision: project.workspace.revision + 1 } };
    }) }));
  }, [activeProject?.id]);

  const createProject = useCallback((name = "Untitled company") => {
    if (latestPortfolioRef.current.projects.length >= MAX_PROJECTS) throw new Error(`Projects are limited to ${MAX_PROJECTS}.`);
    const cleanName = name.trim();
    const project = newProject(createBlankWorkspace(cleanName), cleanName);
    setPortfolio((current) => ({ ...current, active_project_id: project.id, projects: [...current.projects, project] }));
    return project.id;
  }, []);
  const renameProject = useCallback((projectId: string, name: string) => { const clean = name.trim(); if (!clean || clean.length > 300) throw new Error("Project name is missing or too long."); setPortfolio((current) => ({ ...current, projects: current.projects.map((project) => project.id === projectId ? { ...project, name: clean, updated_at: now() } : project) })); }, []);
  const duplicateProject = useCallback((projectId: string) => {
    const source = latestPortfolioRef.current.projects.find((project) => project.id === projectId);
    if (!source) throw new Error("Project not found.");
    if (latestPortfolioRef.current.projects.length >= MAX_PROJECTS) throw new Error(`Projects are limited to ${MAX_PROJECTS}.`);
    const companyId = Date.now();
    const workspace = structuredClone(source.workspace);
    workspace.company = { ...workspace.company, id: companyId };
    workspace.figures = workspace.figures.map((figure) => ({ ...figure, company_id: companyId }));
    workspace.workflow = { ...workspace.workflow, active: false };
    const copy = newProject(workspace, `${source.name.slice(0, 295)} copy`);
    setPortfolio((current) => ({ ...current, active_project_id: copy.id, projects: [...current.projects, copy] }));
    return copy.id;
  }, []);
  const switchProject = useCallback((projectId: string) => setPortfolio((current) => current.projects.some((project) => project.id === projectId && !project.archived) ? { ...current, active_project_id: projectId } : current), []);
  const archiveProject = useCallback((projectId: string) => setPortfolio((current) => {
    if (current.projects.filter((project) => !project.archived).length <= 1) return current;
    const projects = current.projects.map((project) => project.id === projectId ? { ...project, archived: true, updated_at: now() } : project);
    const available = projects.find((project) => !project.archived);
    return { ...current, projects, active_project_id: current.active_project_id === projectId && available ? available.id : current.active_project_id };
  }), []);
  const restoreProject = useCallback((projectId: string) => setPortfolio((current) => ({ ...current, projects: current.projects.map((project) => project.id === projectId ? { ...project, archived: false, updated_at: now() } : project) })), []);
  const setDocumentRetention = useCallback(async (enabled: boolean) => {
    const next = { ...latestPortfolioRef.current, projects: latestPortfolioRef.current.projects.map((project) => {
      const workspace = { ...project.workspace, settings: { ...project.workspace.settings, persistDocumentText: enabled } };
      return { ...project, updated_at: now(), workspace: enabled ? workspace : persistenceCopy(workspace) };
    }) };
    latestPortfolioRef.current = next;
    setPortfolio(next);
    if (enabled) return;
    try { window.localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* The opt-out marker still blocks sensitive hydration. */ }
    try {
      await saveIndexedWorkspace(persistencePortfolioCopy(next, false));
    } catch (reason) {
      try { await deleteIndexedWorkspace(); } catch { /* Preserve the original persistence failure. */ }
      throw reason;
    }
  }, []);
  const resetWorkspace = useCallback(() => { setPersistenceBlocked(false); updateWorkspace(createBlankWorkspace()); }, [updateWorkspace]);
  const exportWorkspace = useCallback(() => JSON.stringify({ equitylens_project_version: 1, project: { ...activeProject, workspace: persistenceCopy(requireActiveProject(activeProject).workspace) } }, null, 2), [activeProject]);
  const importWorkspace = useCallback((raw: string) => {
    if (latestPortfolioRef.current.projects.length >= MAX_PROJECTS) throw new Error(`Projects are limited to ${MAX_PROJECTS}.`);
    if (new Blob([raw]).size > MAX_IMPORT_BYTES) throw new Error("Project imports are limited to 10 MB.");
    const parsed: unknown = JSON.parse(raw);
    let workspaceValue: unknown = parsed;
    let projectName = "Imported project";
    if (record(parsed) && parsed.equitylens_project_version === 1 && record(parsed.project)) { workspaceValue = parsed.project.workspace; if (typeof parsed.project.name === "string") projectName = parsed.project.name; }
    const imported = parseWorkspace(workspaceValue, false);
    const project = newProject(imported, projectName === "Imported project" ? imported.company.name : projectName);
    setPersistenceBlocked(false);
    setPortfolio((current) => ({ ...current, active_project_id: project.id, projects: [...current.projects, project] }));
  }, []);

  return <WorkspaceContext.Provider value={{ workspace: activeProject?.workspace ?? null, project: activeProject, projects: portfolio.projects, activeProjectId: activeProject?.id ?? "", hydrated, persistenceStatus, persistenceMessage, updateWorkspace, createProject, renameProject, duplicateProject, switchProject, archiveProject, restoreProject, setDocumentRetention, resetWorkspace, exportWorkspace, importWorkspace }}>{hydrated ? children : <div className="flex min-h-[60vh] items-center justify-center text-sm text-mist">Loading browser projects...</div>}</WorkspaceContext.Provider>;
}

export function useProjectPortfolio(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

function requireActiveProject(project: ResearchProject | null): ResearchProject {
  if (!project) throw new Error("Select or create a project first.");
  return project;
}
export function useWorkspace(): WorkspaceContextValue & {workspace: Workspace; project: ResearchProject} {
  const value = useProjectPortfolio();
  const project = requireActiveProject(value.project);
  return { ...value, project, workspace: project.workspace };
}
