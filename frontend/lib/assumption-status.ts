import type { Workspace } from "./types";
import { currentValue } from "./assumptions";
import { historicalLabel } from "./historical-references";
import { profitabilityMethod, settingsFor } from "./workbench";

const aliases: Record<string, string> = {
  growth: "revenue_growth",
  depreciation_pct_revenue: "depreciation_ratio",
  capex_pct_revenue: "capex_ratio",
  nwc_pct_revenue: "nwc_ratio",
};
const policies: Record<string, string> = {
  net_borrowing: "No additional borrowing assumed",
  dividends: "No dividend payments assumed",
  minimum_cash: "No minimum cash requirement specified",
  asset_adjustment: "No fair-value asset adjustment assumed",
  liability_adjustment: "No fair-value liability adjustment assumed",
  minority: "No minority interest adjustment assumed",
  non_operating_assets: "No nonoperating asset adjustment assumed",
};
export function assumptionStatus(w: Workspace, target: string): string {
  const [group, key] = target.split("."),
    s = settingsFor(w),
    value = currentValue(w, target);
  if(group === "scenarios") return s.edited_inputs?.includes(target) ? "Analyst Assumption - editable scenario adjustment" : "Model Default - editable scenario adjustment";
  if (
    group === "forecast" &&
    ((key === "opex_ratio" && profitabilityMethod(s) === "ebitda") ||
      (key === "ebitda_margin" && profitabilityMethod(s) === "opex"))
  )
    return "Not Applicable - inactive profitability driver; saved value retained";
  const record = w.assumptionAdoptions
    ?.filter((a) => a.target === target)
    .at(-1);
  if (record && !record.user_modified_at && value === record.value) {
    if (record.source.classification === "management guidance")
      return `Management Guidance - ${record.source.period}`;
    const origin =
      historicalLabel(w, target) ??
      (record.source.classification === "historical derived"
        ? `${record.source.basis === "historical average" ? "Historical Average" : "Latest Reported Value"} - ${record.source.period}`
        : null);
    if (origin)
      return `${key === "tax_rate" ? "Historical Average Effective Tax Rate (not future cash tax). " : key === "interest_rate" ? "Implied historical borrowing-rate reference; not a future or contractual rate. " : ""}${origin}`;
  }
  if (value !== null) {
    if (
      value === 0 &&
      policies[key] &&
      !record &&
      !s.edited_inputs?.includes(target)
    )
      return `Model Default / editable policy - 0: ${policies[key]}`;
    return `Analyst Assumption${record?.user_modified_at ? " - User-modified" : ""}`;
  }
  const average = w.historicalReferences?.averages.find(
    (a) => a.metric === (aliases[key] ?? key),
  );
  let reason =
    average?.unavailable ||
    (average?.prefill_eligible === false
      ? "Confirm operating expenses exclude depreciation and amortization."
      : "");
  if (!reason)
    reason =
      key === "tax_rate"
        ? "Supply tax expense and compatible pretax income or a complete reconciliation."
        : key === "nwc_ratio" || key === "nwc_pct_revenue"
          ? "Supply complete operating working capital components."
          : key === "interest_rate"
            ? "Supply comparable beginning/end debt balances and confirm borrowing interest in Financial Data."
            : `Enter reviewed ${key.replaceAll("_", " ")} or adopt supporting evidence in Assumption Analysis.`;
  return `Missing Supporting Data - ${reason}`;
}
export function operatingSummary(w: Workspace) {
  const s = settingsFor(w),
    keys = [
      "growth",
      "gross_margin",
      profitabilityMethod(s) === "opex" ? "opex_ratio" : "ebitda_margin",
      "depreciation_ratio",
      "tax_rate",
      "capex_ratio",
      "nwc_ratio",
      "interest_rate",
    ];
  const missing = keys.filter((k) => currentValue(w, `forecast.${k}`) === null);
  const sourced = keys.filter((k) => {
    const a = w.assumptionAdoptions
      ?.filter((a) => a.target === `forecast.${k}`)
      .at(-1);
    return (
      a &&
      !a.user_modified_at &&
      currentValue(w, a.target) === a.value &&
      a.source.classification === "historical derived"
    );
  });
  return { total: keys.length, missing, sourced: sourced.length };
}
