"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { createDemoWorkspace } from "@/lib/demo";
import type { Workspace } from "@/lib/types";

const STORAGE_KEY = "equitylens-workspace-v1";

interface WorkspaceContextValue {
  workspace: Workspace;
  hydrated: boolean;
  updateWorkspace: (updater: Workspace | ((current: Workspace) => Workspace)) => void;
  resetWorkspace: () => void;
  exportWorkspace: () => string;
  importWorkspace: (raw: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function persistenceCopy(workspace: Workspace): Workspace {
  if (workspace.settings.persistDocumentText) return workspace;
  return {
    ...workspace,
    documents: workspace.documents.map((document) => ({ ...document, chunks: [] }))
  };
}

function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Workspace>;
  return candidate.version === 1 && Boolean(candidate.company?.name) && Array.isArray(candidate.figures);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace>(createDemoWorkspace);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isWorkspace(parsed)) setWorkspace(parsed);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistenceCopy(workspace)));
  }, [workspace, hydrated]);

  const updateWorkspace = useCallback((updater: Workspace | ((current: Workspace) => Workspace)) => {
    setWorkspace((current) => typeof updater === "function" ? updater(current) : updater);
  }, []);

  const resetWorkspace = useCallback(() => setWorkspace(createDemoWorkspace()), []);
  const exportWorkspace = useCallback(() => JSON.stringify(persistenceCopy(workspace), null, 2), [workspace]);
  const importWorkspace = useCallback((raw: string) => {
    const parsed: unknown = JSON.parse(raw);
    if (!isWorkspace(parsed)) throw new Error("This file is not a valid EquityLens workspace export.");
    setWorkspace(parsed);
  }, []);

  return (
    <WorkspaceContext.Provider value={{ workspace, hydrated, updateWorkspace, resetWorkspace, exportWorkspace, importWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
