"use client";
import { createContext, useContext, useRef, type ReactNode } from "react";
import type { WorkbenchResult } from "./workbench";
export type CalculationMode = "core" | "extended";
export interface CalculationEntry {
  input: string;
  mode: CalculationMode;
  result: WorkbenchResult;
}
const Context = createContext<Map<string, CalculationEntry> | null>(null);
// Provider-owned memory only: never persisted or shared by SSR sessions.
export function CalculationCacheProvider({
  children,
}: {
  children: ReactNode;
}) {
  const cache = useRef(new Map<string, CalculationEntry>());
  return <Context.Provider value={cache.current}>{children}</Context.Provider>;
}
export function useCalculationCache() {
  const value = useContext(Context);
  if (!value) throw new Error("Calculation cache requires WorkspaceProvider.");
  return value;
}
