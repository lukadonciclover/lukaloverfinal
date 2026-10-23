"use client";
import { useEffect, useRef, useState } from "react";
import { apiPost } from "./api";
import {
  payloadFor,
  settingsFor,
  type WorkbenchResult,
  type WorkbenchSettings,
} from "./workbench";
import { useWorkspace } from "./workspace";
import { useCalculationCache, type CalculationMode } from "./calculation-cache";

export function useModel(mode: CalculationMode = "core") {
  const { workspace, project, updateWorkspace } = useWorkspace();
  const cache = useCalculationCache();
  const serialized = JSON.stringify(payloadFor(workspace));
  // Exact payload strings avoid cache hash collisions; revision and unrelated UI edits are excluded.
  const requestKey = `${project.id}:${mode}:${serialized}`;
  const latest = useRef(requestKey);
  latest.current = requestKey;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    value: WorkbenchResult;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const cached = cache.get(project.id);
  const reusable =
    cached?.input === serialized &&
    (cached.mode === "extended" || mode === "core")
      ? cached.result
      : null;
  useEffect(() => {
    if (reusable) {
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    setError("");
    setLoading(true);
    const timer = window.setTimeout(() => {
      apiPost<WorkbenchResult>(
        `/v1/workbench/calculate?mode=${mode}`,
        JSON.parse(serialized),
        { signal: controller.signal },
      )
        .then((value) => {
          if (controller.signal.aborted || latest.current !== requestKey)
            return;
          if (!value || !value.models || !value.errors)
            throw new Error(
              "Calculation response is incomplete. Retry the model calculation.",
            );
          cache.delete(project.id);
          cache.set(project.id, { input: serialized, mode, result: value });
          if (cache.size > 10) cache.delete(cache.keys().next().value!);
          setSnapshot({ key: requestKey, value });
        })
        .catch((reason) => {
          if (!controller.signal.aborted && latest.current === requestKey) {
            setError(
              reason instanceof Error ? reason.message : "Calculation failed.",
            );
            if (
              reason instanceof Error &&
              "status" in reason &&
              reason.status === 422
            )
              cache.set(project.id, {
                input: serialized,
                mode,
                result: {
                  currency: workspace.company.currency,
                  unit_scale: 1,
                  history: {},
                  forecast: [],
                  models: {},
                  errors: { validation: reason.message },
                  scenarios: {},
                  sensitivities: {},
                },
              });
          }
        })
        .finally(() => {
          if (!controller.signal.aborted && latest.current === requestKey)
            setLoading(false);
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [serialized, requestKey, mode, project.id, cache, reusable, attempt]);
  const update = (fn: (s: WorkbenchSettings) => WorkbenchSettings) =>
    updateWorkspace((w) => ({ ...w, valuationWorkbench: fn(settingsFor(w)) }));
  return {
    workspace,
    updateWorkspace,
    settings: settingsFor(workspace),
    update,
    result: reusable ?? (snapshot?.key === requestKey ? snapshot.value : null),
    error,
    loading,
    retry: () => {
      cache.delete(project.id);
      setSnapshot(null);
      setAttempt((v) => v + 1);
    },
  };
}
