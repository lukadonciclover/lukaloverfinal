import { samePeer } from "./peer-import";
import type { Workspace } from "./types";
import { workbookFingerprint } from "./export-fingerprint";
import { financialFingerprint } from "./fingerprint";
import {
  settingsFor,
  payloadFor,
  profitabilityMethod,
  type WorkbenchResult,
} from "./workbench";
import { operatingSummary, assumptionStatus } from "./assumption-status";
import { activeSourceBlocks } from "./source-dependencies";
import {
  formatFinancialLabel,
  formatFinancialMessage,
} from "./financial-formatting";
export type ReadinessStatus =
  | "Complete"
  | "Ready for Review"
  | "Missing Information"
  | "Needs Recalculation"
  | "Blocked by Validation"
  | "Not Applicable";
export interface ReadinessStage {
  name: string;
  status: ReadinessStatus;
  explanation: string;
  action: string;
  href: string;
}
export interface ReadinessSnapshot {
  input: string;
  result: WorkbenchResult;
}
export function evaluateReadiness(
  w: Workspace,
  snapshot?: ReadinessSnapshot,
): ReadinessStage[] {
  const settings = settingsFor(w),
    summary = operatingSummary(w),
    blocked = activeSourceBlocks(w);
  const result =
    snapshot?.input === JSON.stringify(payloadFor(w)) ? snapshot.result : null;
  const pending = w.documents.reduce(
    (n, d) => n + d.suggestions.filter((s) => !s.accepted).length,
    0,
  );
  const approved = w.figures.filter((f) => f.value !== null).length;
  const analysisCurrent =
    w.financialAnalysis?.input_hash === financialFingerprint(w.figures) &&
    (!w.financialAnalysis.currency ||
      w.financialAnalysis.currency === w.company.currency);
  const analysisIssues = analysisCurrent
    ? (w.financialAnalysis?.quality_issues ?? [])
    : [];
  const currencyMismatch = w.figures.some(
    (f) => f.currency !== w.company.currency,
  );
  const duplicates = w.figures.filter((f, i) =>
    w.figures
      .slice(0, i)
      .some((prior) => prior.metric === f.metric && prior.period === f.period),
  );
  const invalidPeriods = w.figures.filter(
    (f) => !/^(19|20)\d{2}(?:-Q[1-4])?$/.test(f.period),
  );
  const financialErrors = [
    ...duplicates.map(
      (f) =>
        `Duplicate figure for ${formatFinancialLabel(f.metric)} in ${f.period}.`,
    ),
    ...invalidPeriods.map((f) => `Unrecognized financial period: ${f.period}.`),
    ...analysisIssues.filter((i) =>
      /^(Currency mismatch|Duplicate figure|Unrecognized financial|Invalid|Overlapping)/.test(
        i,
      ),
    ),
    ...(currencyMismatch
      ? ["Financial currency must match project currency."]
      : []),
  ];
  const enabled = Object.entries(settings.enabled)
    .filter(([key, v]) => v && key !== "forecast")
    .map(([key]) => formatFinancialLabel(key));
  const modelErrors = Object.entries(result?.errors ?? {}).filter(
    ([key]) => key !== "forecast",
  );
  for (const [kind, rows] of [
    ["peers", settings.peers],
    ["transactions", settings.transactions],
  ] as const) {
    if (!settings.enabled[kind]) continue;
    const selected = rows.filter((p) => p.selected);
    const issues = selected.flatMap((p, index) => {
      if (
        selected
          .slice(0, index)
          .some((other) => samePeer(p, other, kind === "transactions"))
      )
        return [`Potential duplicate observation: ${p.company}.`];
      if (
        !p.basis_reviewed ||
        !p.reporting_basis ||
        p.reporting_basis === "unverified"
      )
        return [`${p.company}: review reporting basis and dates.`];
      if (p.reporting_basis !== (settings.relative_basis ?? "annual"))
        return [
          `${p.company}: incompatible ${p.reporting_basis} and ${settings.relative_basis ?? "annual"} reporting bases.`,
        ];
      return [];
    });
    if (issues.length) modelErrors.push([kind, issues.join(" ")]);
  }
  const forecastError =
    result?.errors.forecast ??
    (settings.enabled.forecast ? result?.errors.validation : undefined);
  const stage = (
    name: string,
    status: ReadinessStatus,
    explanation: string,
    action: string,
    href: string,
  ): ReadinessStage => ({ name, status, explanation, action, href });
  const assumptionMissing = summary.missing.map(
    (key) =>
      `${formatFinancialLabel(key)}: ${assumptionStatus(w, `forecast.${key}`)}`,
  );
  const dcfMissing = settings.enabled.dcf
    ? [
        !settings.enabled.wacc && w.dcfInputs.wacc === null ? "WACC" : "",
        settings.terminal_method === "growth" &&
        w.dcfInputs.terminal_growth === null
          ? "Terminal Growth"
          : "",
        settings.cash === null ? "Cash" : "",
        settings.debt === null ? "Debt" : "",
        !settings.enabled.forecast && w.dcfInputs.base_revenue === null
          ? "Base Revenue"
          : "",
        ...(!settings.enabled.forecast
          ? [
              "revenue_growth",
              "ebit_margin",
              "tax_rate",
              "depreciation_pct_revenue",
              "capex_pct_revenue",
              "nwc_pct_revenue",
            ]
              .filter((key) =>
                (w.dcfInputs[key as "revenue_growth"] ?? []).some(
                  (v) => v === null,
                ),
              )
              .map(formatFinancialLabel)
          : []),
        settings.terminal_method === "exit_multiple" &&
        settings.exit_multiple === null
          ? "Exit Multiple"
          : "",
      ].filter(Boolean)
    : [];
  const firstModelError = modelErrors[0]?.[0]?.toLowerCase() ?? "";
  const modelHref = /peer|comparable/.test(firstModelError)
    ? "/valuation#peers"
    : /transaction/.test(firstModelError)
      ? "/valuation#transactions"
      : /ddm/.test(firstModelError)
        ? "/valuation#ddm"
        : /asset/.test(firstModelError)
          ? "/valuation#assets"
          : "/valuation#dcf";
  return [
    stage(
      "Company Information",
      w.company.name.trim() &&
        w.company.name !== "Untitled company" &&
        /^[A-Z]{3}$/.test(w.company.currency)
        ? "Complete"
        : "Missing Information",
      `${w.company.name} · ${w.company.ticker || "No ticker"} · ${w.company.currency}`,
      "Review Company Information",
      "/workspace#company",
    ),
    stage(
      "Financial Data",
      financialErrors.length
        ? "Blocked by Validation"
        : pending
          ? "Ready for Review"
          : approved
            ? "Complete"
            : "Missing Information",
      `${approved} approved financial observations. ${pending} extraction suggestions require review. ${financialErrors.map(formatFinancialMessage).join(" ")}`,
      pending ? "Review Pending Figures" : "Review Financial Figures",
      pending ? "/workspace#pending" : "/workspace#figures",
    ),
    stage(
      "Financial Analysis",
      financialErrors.length
        ? "Blocked by Validation"
        : !approved
          ? "Missing Information"
          : analysisCurrent
            ? "Complete"
            : "Needs Recalculation",
      financialErrors.length
        ? financialErrors.map(formatFinancialMessage).join(" ")
        : analysisCurrent
          ? `Financial analysis is current through ${w.financialAnalysis?.analysis.at(-1)?.period ?? "approved periods"}. ${analysisIssues.length} validation notices available for review.`
          : "Calculate analysis from the current approved ledger.",
      "View Financial Analysis",
      "/financials",
    ),
    stage(
      "Forecasting Assumptions",
      blocked.length || forecastError
        ? "Blocked by Validation"
        : !settings.enabled.forecast
          ? !settings.enabled.dcf
            ? "Not Applicable"
            : dcfMissing.length
              ? "Missing Information"
              : result?.models.DCF
                ? "Complete"
                : "Ready for Review"
          : summary.missing.length
            ? "Missing Information"
            : result?.forecast.length
              ? "Complete"
              : "Ready for Review",
      blocked.length
        ? `Removed-source assumptions require review: ${blocked.map(formatFinancialLabel).join(", ")}.`
        : forecastError
          ? formatFinancialMessage(forecastError)
          : !settings.enabled.forecast
            ? settings.enabled.dcf
              ? "Review the standalone DCF assumptions in Valuation Models."
              : "Operating forecast assumptions are not required by the active standalone valuation methods."
            : `${summary.total - summary.missing.length} of ${summary.total} applicable operating assumptions available. ${assumptionMissing.join(" ") || `Review ${profitabilityMethod(settings) === "ebitda" ? "EBITDA margin" : "operating expense ratio"}, the active profitability driver.`}`,
      "Review Missing Assumptions",
      settings.enabled.forecast
        ? "/workspace#assumption-analysis"
        : "/valuation",
    ),
    stage(
      "Financial Forecast",
      blocked.length || forecastError
        ? "Blocked by Validation"
        : !settings.enabled.forecast
          ? "Not Applicable"
          : result?.forecast.length
            ? "Complete"
            : summary.missing.length || !approved
              ? "Missing Information"
              : "Needs Recalculation",
      blocked.length
        ? "Resolve removed-source dependencies before forecasting."
        : forecastError
          ? formatFinancialMessage(forecastError!)
          : !settings.enabled.forecast
            ? "Integrated forecasting is disabled. Standalone valuation inputs remain available."
            : result?.forecast.length
              ? `${result.forecast.length} projected financial years calculated from current inputs.`
              : "Enable and calculate the forecast after reviewing operating assumptions and annual opening balances.",
      "Review Forecast",
      "/forecasting",
    ),
    stage(
      "Valuation Models",
      blocked.length || modelErrors.length
        ? "Blocked by Validation"
        : !enabled.length || dcfMissing.length
          ? "Missing Information"
          : result && Object.keys(result.models).length
            ? "Complete"
            : "Needs Recalculation",
      blocked.length
        ? "Resolve removed-source assumptions before valuation."
        : modelErrors.length
          ? modelErrors
              .map(
                ([k, v]) =>
                  `${formatFinancialLabel(k)}: ${formatFinancialMessage(v)}`,
              )
              .join(" ")
          : dcfMissing.length
            ? `DCF cannot calculate. ${dcfMissing.join(", ")} missing.`
            : `Active methods: ${enabled.join(", ") || "None selected"}. ${settings.peers.filter((p) => p.selected && !p.basis_reviewed).length} selected peers need reporting-basis review. ${result ? "Review current model validation." : "Calculate models to validate reporting compatibility and assumptions."}`,
      "Review Valuation Models",
      modelHref,
    ),
    stage(
      "Results & Export",
      blocked.length || financialErrors.length || modelErrors.length
        ? "Blocked by Validation"
        : result && Object.keys(result.models).length
          ? w.modelExport?.input_hash === workbookFingerprint(w)
            ? "Complete"
            : "Ready for Review"
          : "Missing Information",
      result && Object.keys(result.models).length
        ? "Current primary valuations available. Complete Excel export calculates all scenarios and sensitivity schedules."
        : "Calculate valid valuation models before reviewing and exporting results.",
      "View Valuation Results",
      "/report",
    ),
  ];
}
