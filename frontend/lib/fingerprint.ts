import type { DCFInputs, DCFResult, FinancialFigure, Workspace } from "@/lib/types";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function fingerprint(value: unknown): string {
  const text = JSON.stringify(canonical(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function dcfFingerprint(inputs: DCFInputs): string {
  return fingerprint(inputs);
}

export function valuationFingerprint(workspace: Workspace): string {
  return fingerprint({ inputs: workspace.dcfInputs, figures: financialFingerprint(workspace.figures), company: { id: workspace.company.id, currency: workspace.company.currency } });
}

export function financialFingerprint(figures: FinancialFigure[]): string {
  return fingerprint(figures.map(({company_id,metric,period,value,currency,unit_scale,notes}) => ({company_id,metric,period,value,currency,unit_scale,definition: ["operating_expenses", "interest_expense"].includes(metric) ? notes : ""})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

// Compatibility check for stored pre-workbench DCF snapshots.
export function currentDcfResult(workspace: Workspace): DCFResult | null {
 return workspace.dcfResult && workspace.dcfInputHash === valuationFingerprint(workspace) ? workspace.dcfResult : null;
}
