import type { Workspace } from "./types";
import type { Assumption, Adoption } from "./assumptions";
import { currentValue } from "./assumptions";
import { settingsFor } from "./workbench";

export function sourceDepends(a: Assumption, id: string) {
  return a.document_id === id || !!a.inputs?.some((i) => i.document_id === id);
}
export function documentDependencies(w: Workspace, id: string) {
  const doc = w.documents.find((d) => d.identifier === id);
  const uniqueName =
    doc && w.documents.filter((d) => d.name === doc.name).length === 1;
  const figures = w.figures.filter(
    (f) =>
      f.source?.document_identifier === id ||
      (uniqueName &&
        !f.source?.document_identifier &&
        f.source?.document_name === doc?.name),
  );
  const depends = (a: Assumption) =>
    sourceDepends(a, id) ||
    !!a.inputs?.some((i) =>
      figures.some((f) => f.metric === i.metric && f.period === i.period),
    );
  const assumptions = (w.assumptions ?? []).filter(depends);
  const references = [
    ...(w.historicalReferences?.averages.map((a) => a.source) ?? []),
    ...(w.historicalReferences?.latest ?? []),
  ].filter(depends);
  const adoptions = (w.assumptionAdoptions ?? []).filter((a) =>
    depends(a.source),
  );
  const latest = new Map(
    (w.assumptionAdoptions ?? []).map((a) => [a.target, a.id]),
  );
  return {
    figures,
    assumptions,
    references,
    adoptions,
    active: adoptions.filter((a) => latest.get(a.target) === a.id),
    suggestions: doc?.suggestions.length ?? 0,
    ambiguous:
      !!doc &&
      !uniqueName &&
      w.figures.some(
        (f) =>
          !f.source?.document_identifier &&
          f.source?.document_name === doc.name,
      ),
  };
}
export function removeSource(
  w: Workspace,
  id: string,
  revision: number,
): Workspace {
  if (w.revision !== revision)
    throw new Error("Project changed; review source dependencies again.");
  const dep = documentDependencies(w, id);
  if (dep.ambiguous)
    throw new Error(
      "Legacy source names are ambiguous. Assign document identifiers before deletion.",
    );
  const affected = new Set(dep.adoptions.map((a) => a.id));
  const unavailable = (a: Assumption): Assumption => ({
    ...a,
    source_availability: "removed",
    status: "requires review",
    excerpt: "",
    original: a.original ? { ...a.original } : undefined,
  });
  return {
    ...w,
    documents: w.documents.filter((d) => d.identifier !== id),
    figures: w.figures.filter((f) => !dep.figures.includes(f)),
    financialAnalysis: null,
    dcfResult: null,
    dcfInputHash: null,
    dcfCalculationHash: null,
    reportSnapshot: null,
    assumptions: (w.assumptions ?? []).filter(
      (a) => !dep.assumptions.includes(a),
    ),
    historicalReferences: w.historicalReferences
      ? {
          ...w.historicalReferences,
          input_hash: "source-removed",
          averages: w.historicalReferences.averages.map((a) =>
            dep.references.includes(a.source)
              ? {
                  ...a,
                  source: unavailable(a.source),
                  observations: a.observations.map(unavailable),
                }
              : a,
          ),
          latest: w.historicalReferences.latest.map((a) =>
            dep.references.includes(a) ? unavailable(a) : a,
          ),
        }
      : undefined,
    assumptionAdoptions: (w.assumptionAdoptions ?? []).map((a) =>
      affected.has(a.id)
        ? {
            ...a,
            source: unavailable(a.source),
            source_status:
              a.source_status === "analyst_reviewed" ||
              a.source_status === "cleared"
                ? a.source_status
                : "removed",
            removed_at: new Date().toISOString(),
            removed_documents: [
              ...new Set([...(a.removed_documents ?? []), id]),
            ],
          }
        : a,
    ),
  };
}
export function unresolvedSources(w: Workspace) {
  return [
    ...new Map(
      (w.assumptionAdoptions ?? []).map((a) => [a.target, a]),
    ).values(),
  ].filter((a) => a.source_status === "removed");
}
export function activeSourceBlocks(w: Workspace) {
  const s = settingsFor(w);
  return unresolvedSources(w)
    .filter((a) => {
      const g = a.target.split(".")[0];
      return g === "settings"
        ? Object.values(s.enabled).some(Boolean)
        : g === "forecast"
          ? s.enabled.forecast
          : g === "dcf"
            ? s.enabled.dcf
            : g === "wacc"
              ? s.enabled.wacc
              : g === "ddm"
                ? s.enabled.ddm
                : g === "assets"
                  ? s.enabled.assets
                  : false;
    })
    .map((a) => a.target);
}
export function resolveRemovedSource(
  w: Workspace,
  id: string,
  action: "keep" | "clear",
  revision: number,
): Workspace {
  if (w.revision !== revision)
    throw new Error("Project changed; review this assumption again.");
  const a = unresolvedSources(w).find((a) => a.id === id);
  if (!a) throw new Error("This assumption is no longer pending review.");
  const value = currentValue(w, a.target);
  if (action === "keep" && value === null)
    throw new Error("Enter a value or clear the input.");
  const next = {
    ...w,
    dcfInputs: structuredClone(w.dcfInputs),
    valuationWorkbench: structuredClone(settingsFor(w)),
  };
  if (action === "clear") {
    const [group, key, index] = a.target.split(".");
    const obj = (group === "dcf"
      ? next.dcfInputs
      : group === "settings"
        ? next.valuationWorkbench
        : next.valuationWorkbench[group as "forecast"]) as unknown as Record<
      string,
      unknown
    >;
    if (index !== undefined)
      (obj[key] as (number | null)[])[Number(index)] = null;
    else obj[key] = null;
    next.valuationWorkbench.edited_inputs = [
      ...new Set([...(next.valuationWorkbench.edited_inputs ?? []), a.target]),
    ];
  }
  const record: Adoption = {
    ...a,
    id: crypto.randomUUID(),
    value: value ?? a.value,
    source_status: action === "keep" ? "analyst_reviewed" : "cleared",
    reviewed_at: new Date().toISOString(),
    accepted_at: new Date().toISOString(),
    classification: "analyst assumption",
    rationale:
      action === "keep"
        ? "Explicitly reviewed analyst assumption after source removal."
        : "Input explicitly cleared after source removal.",
  };
  return {
    ...next,
    assumptionAdoptions: [...(w.assumptionAdoptions ?? []), record],
  };
}
