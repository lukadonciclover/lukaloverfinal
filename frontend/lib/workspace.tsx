"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createDemoWorkspace } from "@/lib/demo";
import { loadIndexedWorkspace, saveIndexedWorkspace } from "@/lib/storage";
import type { AgentRun, Experiment, Workspace } from "@/lib/types";

const LEGACY_STORAGE_KEY = "equitylens-workspace-v1";
const RETENTION_OPT_OUT_KEY = "equitylens-document-retention-disabled";
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export type PersistenceStatus = "loading" | "saving" | "saved" | "local-only" | "error";

interface WorkspaceContextValue {
  workspace: Workspace;
  hydrated: boolean;
  persistenceStatus: PersistenceStatus;
  persistenceMessage: string;
  updateWorkspace: (updater: Workspace | ((current: Workspace) => Workspace)) => void;
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

function validateWorkspace(workspace: Workspace): void {
  if (typeof workspace.company.name !== "string" || !workspace.company.name.trim() || workspace.company.name.length > 300) throw new Error("Company name is missing or too long.");
  if (typeof workspace.company.currency !== "string" || !/^[A-Z]{3}$/.test(workspace.company.currency)) throw new Error("Company currency must be a three-letter code.");
  if (workspace.figures.length > 10_000 || workspace.documents.length > 100 || workspace.chats.length > 2_000 || workspace.experiments.length > 1_000 || workspace.claimAssessments.length > 2_000 || Object.keys(workspace.agentRuns).length > 100) throw new Error("Workspace exceeds supported record limits.");
  for (const figure of workspace.figures) {
    if (!figure.metric || !figure.period || !finiteOrNull(figure.value) || !Number.isFinite(figure.unit_scale) || figure.unit_scale <= 0) throw new Error("A financial figure is malformed.");
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
  if (!["Manual AI Mode", "Configured External Inference", "Financial Analytics Only"].includes(workspace.settings.mode) || typeof workspace.settings.persistDocumentText !== "boolean") throw new Error("Workspace settings are malformed.");
  const arrays = [workspace.dcfInputs.revenue_growth, workspace.dcfInputs.ebit_margin, workspace.dcfInputs.tax_rate, workspace.dcfInputs.depreciation_pct_revenue, workspace.dcfInputs.capex_pct_revenue, workspace.dcfInputs.nwc_pct_revenue];
  if (arrays.some((values) => !Array.isArray(values) || values.length === 0 || values.length > 20 || values.some((value) => !Number.isFinite(value)))) throw new Error("DCF forecast assumptions are malformed.");
  const scalars = [workspace.dcfInputs.base_revenue, workspace.dcfInputs.wacc, workspace.dcfInputs.terminal_growth, workspace.dcfInputs.cash, workspace.dcfInputs.debt, workspace.dcfInputs.minority_interest, workspace.dcfInputs.non_operating_assets];
  if (scalars.some((value) => !Number.isFinite(value)) || !finiteOrNull(workspace.dcfInputs.diluted_shares) || !finiteOrNull(workspace.dcfInputs.reference_price)) throw new Error("DCF scalar assumptions are malformed.");
}

function migrateAgentRun(name: string, value: unknown): AgentRun {
  if (!record(value)) throw new Error(`Agent run ${name} is malformed.`);
  return {
    id: typeof value.id === "string" ? value.id : crypto.randomUUID(),
    agent_name: typeof value.agent_name === "string" ? value.agent_name : name,
    prompt: typeof value.prompt === "string" ? value.prompt : "",
    raw_output: typeof value.raw_output === "string" ? value.raw_output : "",
    parsed_output: record(value.parsed_output) ? value.parsed_output : null,
    valid: value.valid === true,
    schema_valid: value.schema_valid === true || value.valid === true,
    errors: Array.isArray(value.errors) ? value.errors.filter((item): item is string => typeof item === "string") : [],
    provenance: typeof value.provenance === "string" ? value.provenance : "Legacy workspace import",
    model_id: typeof value.model_id === "string" ? value.model_id : "Unknown legacy model",
    prompt_version: typeof value.prompt_version === "string" ? value.prompt_version : "legacy-v1",
    prompt_hash: typeof value.prompt_hash === "string" ? value.prompt_hash : "legacy",
    input_hash: typeof value.input_hash === "string" ? value.input_hash : "legacy",
    source_ids: Array.isArray(value.source_ids) ? value.source_ids.filter((item): item is string => typeof item === "string") : [],
    assumptions: record(value.assumptions) ? value.assumptions : {},
    created_at: typeof value.created_at === "string" ? value.created_at : new Date(0).toISOString()
  };
}

function migrateExperiment(value: unknown): Experiment {
  if (!record(value)) throw new Error("An experiment record is malformed.");
  const legacyMetrics = record(value.metrics) ? value.metrics : {};
  return {
    id: typeof value.id === "string" ? value.id : crypto.randomUUID(),
    strategy: typeof value.strategy === "string" ? value.strategy : "Unknown strategy",
    task: typeof value.task === "string" ? value.task : "Unknown task",
    prompt: typeof value.prompt === "string" ? value.prompt : "",
    prompt_version: typeof value.prompt_version === "string" ? value.prompt_version : "legacy-v1",
    benchmark_version: typeof value.benchmark_version === "string" ? value.benchmark_version : "legacy-v1",
    model_id: typeof value.model_id === "string" ? value.model_id : "Unknown legacy model",
    output: typeof value.output === "string" ? value.output : "",
    objective_metrics: record(value.objective_metrics) ? value.objective_metrics : legacyMetrics,
    human_judgments: record(value.human_judgments) ? {
      rating: finiteOrNull(value.human_judgments.rating) ? value.human_judgments.rating : null,
      notes: typeof value.human_judgments.notes === "string" ? value.human_judgments.notes : ""
    } : { rating: null, notes: "" },
    created_at: typeof value.created_at === "string" ? value.created_at : new Date(0).toISOString()
  };
}

export function parseWorkspace(value: unknown, allowSensitiveRetention = true): Workspace {
  if (!record(value) || ![1, 2].includes(Number(value.version)) || !record(value.company) || !Array.isArray(value.figures)) throw new Error("This file is not a supported EquityLens workspace export.");
  const defaults = createDemoWorkspace();
  if (!record(value.dcfInputs) || !Array.isArray(value.documents) || !Array.isArray(value.comparables) || !record(value.agentRuns) || !Array.isArray(value.chats) || !Array.isArray(value.experiments) || !record(value.settings)) throw new Error("The workspace is missing required sections.");
  const agentRuns = Object.fromEntries(Object.entries(value.agentRuns).map(([name, run]) => [name, migrateAgentRun(name, run)]));
  const documents = value.documents.map((documentValue) => {
    if (!record(documentValue) || !Array.isArray(documentValue.chunks) || !Array.isArray(documentValue.suggestions) || typeof documentValue.identifier !== "string") throw new Error("A source document record is malformed.");
    return {
      ...documentValue,
      chunks: documentValue.chunks.map((chunkValue, index) => {
        if (!record(chunkValue) || typeof chunkValue.text !== "string" || typeof chunkValue.page !== "number") throw new Error("An evidence chunk is malformed.");
        return { ...chunkValue, chunk_id: typeof chunkValue.chunk_id === "string" ? chunkValue.chunk_id : `legacy-${documentValue.identifier}-${chunkValue.page}-${index}`, document_identifier: typeof chunkValue.document_identifier === "string" ? chunkValue.document_identifier : documentValue.identifier };
      })
    };
  }) as Workspace["documents"];
  const figures = value.figures.map((figureValue) => {
    if (!record(figureValue)) throw new Error("A financial figure is malformed.");
    if (!record(figureValue.source)) return figureValue;
    const source = figureValue.source;
    const matchedDocument = documents.find((document) => document.name === source.document_name);
    return { ...figureValue, source: { ...source, document_identifier: typeof source.document_identifier === "string" ? source.document_identifier : matchedDocument?.identifier ?? "" } };
  }) as unknown as Workspace["figures"];
  const workspace = {
    ...defaults,
    ...value,
    version: 2,
    revision: typeof value.revision === "number" && Number.isInteger(value.revision) ? value.revision : 0,
    company: { ...defaults.company, ...value.company },
    dcfInputs: { ...defaults.dcfInputs, ...value.dcfInputs },
    dcfInputHash: typeof value.dcfInputHash === "string" ? value.dcfInputHash : null,
    figures,
    documents,
    agentRuns,
    claimAssessments: Array.isArray(value.claimAssessments) ? value.claimAssessments : [],
    experiments: value.experiments.map(migrateExperiment),
    settings: {
      ...defaults.settings,
      ...value.settings,
      persistDocumentText: allowSensitiveRetention && value.settings.persistDocumentText === true
    }
  } as Workspace;
  validateWorkspace(workspace);
  return workspace.settings.persistDocumentText ? workspace : persistenceCopy(workspace);
}

export function setRetentionPreference(enabled: boolean): void {
  if (enabled) window.localStorage.removeItem(RETENTION_OPT_OUT_KEY);
  else window.localStorage.setItem(RETENTION_OPT_OUT_KEY, "true");
}

export function persistenceCopy(workspace: Workspace): Workspace {
  if (workspace.settings.persistDocumentText) return workspace;
  return {
    ...workspace,
    documents: workspace.documents.map((document) => ({
      ...document,
      chunks: [],
      suggestions: document.suggestions.map((suggestion) => ({ ...suggestion, quote: "" }))
    })),
    figures: workspace.figures.map((figure) => ({ ...figure, source: figure.source ? { ...figure.source, quote: "" } : figure.source })),
    agentRuns: Object.fromEntries(Object.entries(workspace.agentRuns).map(([name, run]) => [name, run.source_ids.length || workspace.documents.length ? { ...run, prompt: "", raw_output: "", parsed_output: null, valid: false, errors: ["Source-derived text was not persisted by privacy policy."] } : run])),
    claimAssessments: [],
    chats: []
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace>(createDemoWorkspace);
  const [hydrated, setHydrated] = useState(false);
  const [persistenceBlocked, setPersistenceBlocked] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("loading");
  const [persistenceMessage, setPersistenceMessage] = useState("Loading browser workspace.");
  const editedBeforeHydrationRef = useRef(false);
  const latestRevisionRef = useRef(workspace.revision);
  latestRevisionRef.current = workspace.revision;

  useEffect(() => {
    let active = true;
    async function hydrate() {
      let raw: unknown | null = null;
      try { raw = await loadIndexedWorkspace(); } catch { /* Fall back to the legacy store. */ }
      if (raw === null) {
        try {
          const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
          raw = legacy ? JSON.parse(legacy) : null;
        } catch (reason) {
          if (active) { setPersistenceBlocked(true); setPersistenceStatus("error"); setPersistenceMessage(reason instanceof Error ? reason.message : "Browser storage could not be read."); }
        }
      }
      if (raw !== null && active) {
        try {
          let allowSensitiveRetention = false;
          try { allowSensitiveRetention = window.localStorage.getItem(RETENTION_OPT_OUT_KEY) !== "true"; } catch { /* Default to redaction. */ }
          if (!editedBeforeHydrationRef.current) setWorkspace(parseWorkspace(raw, allowSensitiveRetention));
        }
        catch (reason) { setPersistenceBlocked(true); setPersistenceStatus("error"); setPersistenceMessage(reason instanceof Error ? `Saved workspace was preserved but not loaded: ${reason.message}` : "Saved workspace is invalid."); }
      }
      if (active) {
        setHydrated(true);
        setPersistenceStatus((current) => current === "error" ? current : "saved");
        setPersistenceMessage((current) => current === "Loading browser workspace." ? "Workspace loaded. Changes are saved in this browser." : current);
      }
    }
    void hydrate();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || persistenceBlocked) return;
    setPersistenceStatus("saving");
    setPersistenceMessage("Saving workspace.");
    const timer = window.setTimeout(async () => {
      const savingRevision = workspace.revision;
      const copy = persistenceCopy(workspace);
      try {
        await saveIndexedWorkspace(copy);
        try { window.localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* IndexedDB remains authoritative. */ }
        if (latestRevisionRef.current === savingRevision) {
          setPersistenceStatus("saved");
          setPersistenceMessage("Saved to IndexedDB in this browser.");
        }
      } catch (indexedError) {
        try {
          window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(copy));
          setPersistenceStatus("local-only");
          setPersistenceMessage("IndexedDB is unavailable. Saved with limited localStorage capacity.");
        } catch (localError) {
          const error = localError instanceof Error ? localError : indexedError;
          setPersistenceStatus("error");
          setPersistenceMessage(error instanceof Error && error.name === "QuotaExceededError" ? "Browser storage quota was exceeded. Export now; recent changes are not saved." : "Browser persistence failed. Export now; recent changes are not saved.");
        }
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [workspace, hydrated, persistenceBlocked]);

  const updateWorkspace = useCallback((updater: Workspace | ((current: Workspace) => Workspace)) => {
    if (!hydrated) editedBeforeHydrationRef.current = true;
    setWorkspace((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      return next === current ? current : { ...next, version: 2, revision: current.revision + 1 };
    });
  }, [hydrated]);

  const resetWorkspace = useCallback(() => { editedBeforeHydrationRef.current = true; setPersistenceBlocked(false); setWorkspace(createDemoWorkspace()); }, []);
  const exportWorkspace = useCallback(() => JSON.stringify(persistenceCopy(workspace), null, 2), [workspace]);
  const importWorkspace = useCallback((raw: string) => {
    if (new Blob([raw]).size > MAX_IMPORT_BYTES) throw new Error("Workspace imports are limited to 10 MB.");
    const parsed: unknown = JSON.parse(raw);
    const imported = parseWorkspace(parsed, false);
    editedBeforeHydrationRef.current = true;
    setPersistenceBlocked(false);
    setWorkspace(imported);
  }, []);

  return (
    <WorkspaceContext.Provider value={{ workspace, hydrated, persistenceStatus, persistenceMessage, updateWorkspace, resetWorkspace, exportWorkspace, importWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
