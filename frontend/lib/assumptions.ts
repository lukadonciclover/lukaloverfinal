import type { Workspace } from "./types";
import { settingsFor } from "./workbench";

export interface Assumption {
  id: string;
  metric: string;
  value: number | null;
  minimum: number | null;
  maximum: number | null;
  unit: string;
  currency: string;
  unit_scale: number;
  period: string;
  basis: string;
  scope: string;
  classification: string;
  explicit: boolean;
  document_id: string;
  document_name: string;
  page: number | null;
  excerpt: string;
  confidence: number;
  status: "pending" | "accepted" | "rejected" | "requires review";
  rationale: string;
  original?: {
    metric: string;
    value: number | null;
    minimum: number | null;
    maximum: number | null;
    unit: string;
    unit_scale: number;
    currency: string;
  };
  inputs?: {
    metric: string;
    period: string;
    value: number;
    currency: string;
    unit_scale: number;
    document_id: string;
  }[];
}
export interface Adoption {
  mode?: "automatic" | "historical restore";
  input_hash?: string;
  window?: 2 | 3 | 5;
  user_modified_at?: string;
  id: string;
  source: Assumption;
  target: string;
  value: number;
  period: string;
  rationale: string;
  classification: string;
  accepted_at: string;
}
export interface Proposal {
  source: Assumption;
  target: string;
  value: number;
  period: string;
  rationale: string;
  reviewed: boolean;
  capitalBase?: number;
}
const mappings: Record<string, string[]> = {
  base_revenue: ["dcf.base_revenue"],
  opening_nwc: ["settings.opening_nwc"],
  cash: ["settings.cash"],
  debt: ["settings.debt"],
  book_assets: ["assets.book_assets"],
  book_liabilities: ["assets.book_liabilities"],
  revenue_growth: ["forecast.growth", "dcf.revenue_growth"],
  gross_margin: ["forecast.gross_margin"],
  ebitda_margin: ["forecast.ebitda_margin"],
  ebit_margin: ["dcf.ebit_margin"],
  opex_ratio: ["forecast.opex_ratio"],
  depreciation_ratio: [
    "forecast.depreciation_ratio",
    "dcf.depreciation_pct_revenue",
  ],
  capex_ratio: ["forecast.capex_ratio", "dcf.capex_pct_revenue"],
  nwc_ratio: ["forecast.nwc_ratio", "dcf.nwc_pct_revenue"],
  tax_rate: ["forecast.tax_rate", "dcf.tax_rate", "wacc.tax_rate"],
  interest_rate: ["forecast.interest_rate"],
  minimum_cash: ["forecast.minimum_cash"],
  net_borrowing: ["forecast.net_borrowing"],
  dividends: ["forecast.dividends"],
  dividend: ["ddm.dividend"],
  dividend_growth: ["ddm.growth"],
  dividend_terminal_growth: ["ddm.terminal_growth"],
  cost_of_equity: ["ddm.cost_of_equity"],
  wacc: ["dcf.wacc"],
  terminal_growth: ["dcf.terminal_growth"],
  exit_multiple: ["settings.exit_multiple"],
  risk_free: ["wacc.risk_free"],
  beta: ["wacc.beta"],
  equity_risk_premium: ["wacc.equity_risk_premium"],
  cost_of_debt: ["wacc.cost_of_debt"],
  market_equity: ["wacc.market_equity"],
  market_debt: ["wacc.market_debt"],
  equity_weight: ["wacc.market_equity"],
  debt_weight: ["wacc.market_debt"],
  asset_adjustment: ["assets.asset_adjustment"],
  liability_adjustment: ["assets.liability_adjustment"],
};
const arrays = new Set([
  "revenue_growth",
  "ebit_margin",
  "tax_rate",
  "depreciation_pct_revenue",
  "capex_pct_revenue",
  "nwc_pct_revenue",
]);
export function targetsFor(a: Assumption, w: Workspace): string[] {
  return (Object.hasOwn(mappings, a.metric) ? mappings[a.metric] : []).flatMap(
    (t) => {
      const [group, key] = t.split(".");
      return group === "dcf" && arrays.has(key)
        ? w.dcfInputs.revenue_growth.map((_, i) => `${t}.${i}`)
        : [t];
    },
  );
}
export function currentValue(w: Workspace, target: string): number | null {
  const [group, key, index] = target.split(".");
  const settings = settingsFor(w);
  const obj =
    group === "dcf"
      ? w.dcfInputs
      : group === "settings"
        ? settings
        : settings[group as "forecast"];
  const value = (obj as unknown as Record<string, unknown>)?.[key];
  return typeof value === "number"
    ? value
    : Array.isArray(value)
      ? (value[Number(index)] ?? null)
      : null;
}
export function targetLabel(target: string): string {
  const [group, key, year] = target.split(".");
  return `${group.toUpperCase()} / ${key.replaceAll("_", " ")}${year !== undefined ? ` / Year ${Number(year) + 1}` : ""}`;
}
export function displayAssumption(a: Assumption, value = a.value): string {
  const fmt = (v: number) =>
    a.unit === "percentage"
      ? `${(v * 100).toLocaleString(undefined, { maximumFractionDigits: 3 })}%`
      : `${v.toLocaleString()}${a.unit === "multiple" ? "x" : a.unit === "currency" ? ` ${a.currency || "currency unconfirmed"} (scale ${a.unit_scale})` : ""}`;
  return value !== null
    ? fmt(value)
    : a.minimum !== null && a.maximum !== null
      ? `${fmt(a.minimum)} to ${fmt(a.maximum)}`
      : "Manual review required";
}
export function conflictsFor(a: Assumption, rows: Assumption[]): Assumption[] {
  return rows.filter(
    (b) =>
      b.id !== a.id &&
      b.status !== "rejected" &&
      b.metric === a.metric &&
      b.period === a.period &&
      b.scope === a.scope &&
      b.classification === a.classification &&
      JSON.stringify([
        b.value,
        b.minimum,
        b.maximum,
        b.currency,
        b.unit_scale,
      ]) !==
        JSON.stringify([
          a.value,
          a.minimum,
          a.maximum,
          a.currency,
          a.unit_scale,
        ]),
  );
}
export function proposalError(p: Proposal, w: Workspace): string | null {
  if (!targetsFor(p.source, w).includes(p.target))
    return "Choose a supported target input.";
  if (!Number.isFinite(p.value))
    return "Enter a numeric proposal; ranges require an explicit point selection.";
  if (!p.reviewed || !p.period.trim() || !p.rationale.trim())
    return "Confirm scope, units and application period, and explain your selection.";
  if (
    p.source.inputs?.some((input) => {
      const matches = w.figures.filter(
        (f) =>
          f.metric === input.metric &&
          f.period === input.period &&
          f.currency === input.currency,
      );
      return (
        matches.length !== 1 ||
        matches[0].value !== input.value ||
        matches[0].unit_scale !== input.unit_scale
      );
    })
  )
    return "Historical evidence changed. Review the recalculated observation.";
  if (
    p.source.metric.endsWith("_weight") &&
    (!(p.capitalBase && Number.isFinite(p.capitalBase) && p.capitalBase > 0) ||
      p.value < 0 ||
      p.value > 1)
  )
    return "Supply a verified total market capital value and a weight between 0% and 100%.";
  if (p.source.unit === "currency" && p.source.currency !== w.company.currency)
    return "Source currency must match the project. Currency conversion requires separate evidence.";
  const s = settingsFor(w),
    [group, key] = p.target.split(".");
  if (p.target === "forecast.ebitda_margin" && s.forecast.opex_ratio !== null)
    return "The operating expense ratio currently controls EBITDA. Review that input in Forecasting before adopting an EBITDA margin.";
  if (
    (group === "dcf" && s.enabled.forecast && arrays.has(key)) ||
    (p.target === "dcf.wacc" && s.enabled.wacc)
  )
    return "This DCF input is controlled by the enabled forecast or WACC model. Use that model's input instead.";
  if (["quarter", "multi-year"].includes(p.source.basis))
    return "Quarterly and multi-year/CAGR guidance cannot be applied directly to annual inputs. Enter a separately justified analyst assumption in the model.";
  if (p.source.scope.includes("segment"))
    return "Confirm consolidated scope in source review before adoption. Segment guidance cannot be applied to the company model.";
  if (
    p.source.minimum !== null &&
    p.source.maximum !== null &&
    (p.value / (p.source.unit === "currency" ? p.source.unit_scale : 1) <
      p.source.minimum ||
      p.value / (p.source.unit === "currency" ? p.source.unit_scale : 1) >
        p.source.maximum)
  )
    return "Choose a point within the source range, or enter a separate analyst assumption in the model.";
  if (p.source.unit === "percentage") {
    const min = [
      "growth",
      "revenue_growth",
      "ebitda_margin",
      "ebit_margin",
      "terminal_growth",
    ].includes(key)
      ? -1
      : key === "nwc_pct_revenue"
        ? -10
        : 0;
    const max =
      key === "growth" && group === "forecast"
        ? 3
        : ["opex_ratio", "nwc_ratio", "nwc_pct_revenue"].includes(key)
          ? 2
          : 1;
    if (
      p.value < min ||
      p.value > max ||
      (["growth", "revenue_growth"].includes(key) && p.value <= -1)
    )
      return "Proposed rate is outside the model's supported bounds.";
    if (["wacc", "cost_of_equity"].includes(key) && p.value <= 0)
      return "Discount rates must be positive.";
  }
  if (
    [
      "exit_multiple",
      "market_equity",
      "market_debt",
      "dividend",
      "dividends",
    ].includes(key) &&
    p.value < 0
  )
    return "This model input cannot be negative.";
  if (key === "exit_multiple" && p.value === 0)
    return "Exit multiple must be positive.";
  return null;
}
export function appliedValue(p: Proposal): number {
  return p.source.metric.endsWith("_weight")
    ? p.value * (p.capitalBase ?? NaN)
    : p.value;
}
export function applyProposals(
  w: Workspace,
  proposals: Proposal[],
  revision: number,
): Workspace {
  if (w.revision !== revision)
    throw new Error("The project changed. Review a fresh preview.");
  const targets = new Set<string>();
  for (const p of proposals) {
    const error = proposalError(p, w);
    if (error) throw new Error(error);
    if (targets.has(p.target))
      throw new Error(
        "Conflicting proposals target the same input. Select one source explicitly.",
      );
    targets.add(p.target);
  }
  const weights = proposals.filter((p) => p.source.metric.endsWith("_weight"));
  if (
    weights.length &&
    (weights.length !== 2 ||
      !weights.some((p) => p.source.metric === "equity_weight") ||
      !weights.some((p) => p.source.metric === "debt_weight") ||
      weights[0].capitalBase !== weights[1].capitalBase ||
      weights[0].period !== weights[1].period ||
      Math.abs(weights[0].value + weights[1].value - 1) > 1e-8)
  )
    throw new Error(
      "Apply equity and debt weights together, totaling 100%, using the same verified total market capital value and application period.",
    );
  const next = {
    ...w,
    dcfInputs: structuredClone(w.dcfInputs),
    valuationWorkbench: structuredClone(settingsFor(w)),
  };
  const adopted: Adoption[] = [];
  for (const p of proposals) {
    const [group, key, index] = p.target.split(".");
    const obj = (group === "dcf"
      ? next.dcfInputs
      : group === "settings"
        ? next.valuationWorkbench
        : next.valuationWorkbench[group as "forecast"]) as unknown as Record<
      string,
      unknown
    >;
    const value = appliedValue(p);
    if (index !== undefined) (obj[key] as number[])[Number(index)] = value;
    else obj[key] = value;
    adopted.push({
      id: crypto.randomUUID(),
      source: structuredClone(p.source),
      target: p.target,
      value,
      period: p.period,
      rationale:
        p.rationale +
        (p.capitalBase
          ? ` Market weight ${p.value} × verified total market capital ${p.capitalBase}.`
          : ""),
      classification:
        p.source.classification === "management guidance" &&
        p.source.explicit &&
        p.source.value === p.value &&
        !p.capitalBase
          ? "management guidance"
          : "analyst assumption",
      accepted_at: new Date().toISOString(),
    });
  }
  next.assumptions = [
    ...(w.assumptions ?? []).filter(
      (a) => !proposals.some((p) => p.source.id === a.id),
    ),
    ...Array.from(
      new Map(
        proposals.map((p) => [
          p.source.id,
          { ...p.source, status: "accepted" as const },
        ]),
      ).values(),
    ),
  ];
  next.assumptionAdoptions = [...(w.assumptionAdoptions ?? []), ...adopted];
  return next;
}
export function assumptionExport(w: Workspace) {
  return (w.assumptionAdoptions ?? []).map((a) => ({
    ...a,
    source: w.settings.persistDocumentText
      ? a.source
      : redactEvidence(a.source),
  }));
}
export function redactEvidence(a: Assumption): Assumption {
  // Whitelist metadata so imported extension fields cannot retain hidden source text.
  const keys = [
    "id",
    "metric",
    "value",
    "minimum",
    "maximum",
    "unit",
    "currency",
    "unit_scale",
    "period",
    "basis",
    "scope",
    "classification",
    "explicit",
    "document_id",
    "document_name",
    "page",
    "confidence",
    "status",
    "rationale",
  ] as const;
  const copy = {
    ...Object.fromEntries(keys.map((key) => [key, a[key]])),
    excerpt: "",
  } as Assumption;
  if (a.original) {
    const { metric, value, minimum, maximum, unit, currency, unit_scale } =
      a.original;
    copy.original = {
      metric,
      value,
      minimum,
      maximum,
      unit,
      currency,
      unit_scale,
    };
  }
  if (a.inputs)
    copy.inputs = a.inputs.map(
      ({ metric, period, value, currency, unit_scale, document_id }) => ({
        metric,
        period,
        value,
        currency,
        unit_scale,
        document_id,
      }),
    );
  return copy;
}
export function validateAssumptions(w: Workspace): void {
  if (
    (w.assumptions !== undefined && !Array.isArray(w.assumptions)) ||
    (w.assumptionAdoptions !== undefined &&
      !Array.isArray(w.assumptionAdoptions))
  )
    throw new Error("Invalid assumption records.");
  const rows = [
    ...(w.assumptions ?? []),
    ...(w.assumptionAdoptions ?? []).map((a) => a.source),
  ];
  if (rows.length > 10000) throw new Error("Too many assumption records.");
  for (const a of rows) {
    if (
      !a ||
      [
        a.id,
        a.metric,
        a.period,
        a.basis,
        a.scope,
        a.unit,
        a.currency,
        a.classification,
        a.document_id,
        a.document_name,
        a.excerpt,
        a.rationale,
      ].some((v) => typeof v !== "string") ||
      [a.value, a.minimum, a.maximum].some(
        (v) => v !== null && (typeof v !== "number" || !Number.isFinite(v)),
      ) ||
      !Number.isFinite(a.unit_scale) ||
      a.unit_scale <= 0 ||
      typeof a.explicit !== "boolean" ||
      !Number.isFinite(a.confidence) ||
      a.confidence < 0 ||
      a.confidence > 1 ||
      (a.page !== null && (!Number.isInteger(a.page) || a.page < 1)) ||
      !["pending", "accepted", "rejected", "requires review"].includes(a.status)
    )
      throw new Error("Malformed assumption evidence.");
    if (
      a.inputs !== undefined &&
      (!Array.isArray(a.inputs) ||
        a.inputs.some(
          (input) =>
            !input ||
            [
              input.metric,
              input.period,
              input.currency,
              input.document_id,
            ].some((value) => typeof value !== "string") ||
            !Number.isFinite(input.value) ||
            !Number.isFinite(input.unit_scale) ||
            input.unit_scale <= 0,
        ))
    )
      throw new Error("Malformed historical evidence inputs.");
    if (
      a.original &&
      ([a.original.metric, a.original.unit, a.original.currency].some(
        (value) => typeof value !== "string",
      ) ||
        [a.original.value, a.original.minimum, a.original.maximum].some(
          (value) =>
            value !== null &&
            (typeof value !== "number" || !Number.isFinite(value)),
        ) ||
        !Number.isFinite(a.original.unit_scale) ||
        a.original.unit_scale <= 0)
    )
      throw new Error("Malformed original assumption values.");
  }
  for (const a of w.assumptionAdoptions ?? [])
    if (
      !Number.isFinite(a.value) ||
      !(
        targetsFor(a.source, w).includes(a.target) ||
        (/^dcf\.[a-z_]+\.(?:[0-9]|1[0-9])$/.test(a.target) &&
          Object.hasOwn(mappings, a.source.metric) &&
          mappings[a.source.metric].includes(
            a.target.split(".").slice(0, 2).join("."),
          ))
      ) ||
      typeof a.period !== "string" ||
      typeof a.rationale !== "string" ||
      typeof a.accepted_at !== "string" ||
      (a.mode !== undefined &&
        !["automatic", "historical restore"].includes(a.mode)) ||
      (a.user_modified_at !== undefined &&
        typeof a.user_modified_at !== "string")
    )
      throw new Error("Malformed assumption adoption.");
}
