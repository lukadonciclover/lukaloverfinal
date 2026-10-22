import type { FinancialFigure, FigureSuggestion, Workspace } from "./types";
import { financialMetrics, formatFinancialLabel } from "./financial-formatting";

export const ledgerMetrics = Object.keys(financialMetrics).filter(
  (key) =>
    financialMetrics[key].unit === "currency" &&
    !["low", "high", "range"].includes(key),
);
export type PendingRecord = FigureSuggestion & {
  record_id: string;
  documentId: string;
  documentName: string;
};
export type ReviewStatus =
  "eligible" | "invalid" | "unverified" | "duplicate" | "conflict";
export type ReviewedRecord = {
  record: PendingRecord;
  status: ReviewStatus;
  issues: string[];
};
export function ensureRecordIds(workspace: Workspace): Workspace {
  let changed = false;
  const seen = new Set<string>();
  const identify = <T extends { record_id?: string }>(row: T): T => {
    if (row.record_id && !seen.has(row.record_id)) {
      seen.add(row.record_id);
      return row;
    }
    changed = true;
    const record_id = crypto.randomUUID();
    seen.add(record_id);
    return { ...row, record_id };
  };
  const figures = workspace.figures.map(identify);
  const documents = workspace.documents.map((document) => ({
    ...document,
    suggestions: document.suggestions.map(identify),
  }));
  return changed ? { ...workspace, figures, documents } : workspace;
}
export function pendingRecords(workspace: Workspace): PendingRecord[] {
  return workspace.documents.flatMap((document) =>
    document.suggestions
      .filter((row) => !row.accepted && row.record_id)
      .map((row) => ({
        ...row,
        record_id: row.record_id!,
        documentId: document.identifier,
        documentName: document.name,
      })),
  );
}
export function validCurrency(currency: string) {
  return (
    /^[A-Z]{3}$/.test(currency) &&
    Intl.supportedValuesOf("currency").includes(currency)
  );
}
export function validateFinancialRecord(
  row: Pick<
    FinancialFigure,
    "metric" | "period" | "value" | "currency" | "unit_scale"
  >,
  currency: string,
): string[] {
  const issues: string[] = [];
  if (!ledgerMetrics.includes(row.metric))
    issues.push("Choose a supported financial metric.");
  if (!/^(19|20)\d{2}(?:-Q[1-4])?$/.test(row.period))
    issues.push("Use YYYY or YYYY-Q1 to YYYY-Q4.");
  if (typeof row.value !== "number" || !Number.isFinite(row.value))
    issues.push("Enter a finite numeric value.");
  if (!validCurrency(row.currency)) issues.push("Enter a valid currency code.");
  else if (row.currency !== currency)
    issues.push("Currency differs from the project.");
  if (!Number.isFinite(row.unit_scale) || row.unit_scale <= 0)
    issues.push("Enter a positive unit scale.");
  return issues;
}
const keyFor = (row: { metric: string; period: string }) =>
  JSON.stringify([row.metric, row.period]);
const identical = (a: FigureSuggestion, b: FigureSuggestion) =>
  a.value === b.value &&
  a.currency === b.currency &&
  a.unit_scale === b.unit_scale;
export function reviewSuggestions(workspace: Workspace): ReviewedRecord[] {
  const records = pendingRecords(workspace);
  const groups = new Map<string, PendingRecord[]>();
  records.forEach((row) =>
    groups.set(keyFor(row), [...(groups.get(keyFor(row)) ?? []), row]),
  );
  const ledger = new Set(workspace.figures.map(keyFor));
  return records.map((record) => {
    const issues = validateFinancialRecord(record, workspace.company.currency);
    if (issues.length) return { record, status: "invalid", issues };
    if (ledger.has(keyFor(record)))
      return {
        record,
        status: "conflict",
        issues: [
          "Existing ledger entry: resolve manually; approval will not replace it.",
        ],
      };
    const group = groups.get(keyFor(record))!;
    if (group.some((other) => !identical(record, other)))
      return {
        record,
        status: "conflict",
        issues: [
          "Pending records disagree for this metric and period. Correct or remove the conflicting suggestion.",
        ],
      };
    if (record.units_confirmed !== true || record.currency_confirmed !== true)
      return {
        record,
        status: "unverified",
        issues: ["Confirm currency and unit scale against the source."],
      };
    const firstVerified = group.find(
      (other) =>
        other.units_confirmed === true && other.currency_confirmed === true,
    );
    if (firstVerified?.record_id !== record.record_id)
      return {
        record,
        status: "duplicate",
        issues: ["Identical pending observation; only one copy is eligible."],
      };
    return { record, status: "eligible", issues: [] };
  });
}
export function approvalPreview(workspace: Workspace, ids: readonly string[]) {
  const selected = new Set(ids);
  const records = reviewSuggestions(workspace).filter((row) =>
    selected.has(row.record.record_id),
  );
  return {
    revision: workspace.revision,
    records,
    eligible: records.filter((row) => row.status === "eligible"),
    total: records.length,
  };
}
export function applyApproval(
  workspace: Workspace,
  preview: ReturnType<typeof approvalPreview>,
): Workspace {
  if (workspace.revision !== preview.revision) return workspace;
  const eligible = approvalPreview(
    workspace,
    preview.eligible.map((row) => row.record.record_id),
  ).eligible;
  if (!eligible.length) return workspace;
  const ids = new Set(eligible.map((row) => row.record.record_id));
  const figures: FinancialFigure[] = eligible.map(({ record: r }) => ({
    record_id: crypto.randomUUID(),
    company_id: workspace.company.id,
    metric: r.metric,
    period: r.period,
    value: r.value,
    currency: r.currency,
    unit_scale: r.unit_scale,
    origin: "reported",
    source: {
      document_identifier: r.documentId,
      document_name: r.documentName,
      page: r.page,
      quote: r.quote,
      reporting_period: r.period,
      currency: r.currency,
      unit_scale: r.unit_scale,
      confidence: r.confidence,
    },
    notes:
      "Accepted extraction; currency and scale confirmed by user. Acceptance is not independent verification.",
  }));
  return {
    ...workspace,
    figures: [...workspace.figures, ...figures],
    documents: workspace.documents.map((document) => ({
      ...document,
      suggestions: document.suggestions.filter(
        (row) => !ids.has(row.record_id ?? ""),
      ),
    })),
  };
}
export function modifyFigure(
  row: FinancialFigure,
  patch: Partial<FinancialFigure>,
): FinancialFigure {
  return {
    ...row,
    ...patch,
    source: row.source,
    origin: "user-supplied",
    notes: [
      row.notes,
      "User-modified; original source reference retained and may differ from current values.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
export function parseSpreadsheet(text: string, currency: string) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines[0]?.split("\t")[0].trim().toLowerCase() === "metric") lines.shift();
  return lines.map((line, index) => {
    const cells = line.split("\t").map((cell) => cell.trim());
    const raw = cells[0] ?? "";
    const metric =
      ledgerMetrics.find(
        (key) =>
          key === raw.toLowerCase() ||
          formatFinancialLabel(key).toLowerCase() === raw.toLowerCase(),
      ) ?? raw;
    const numeric = (value: string | undefined) =>
      value?.trim() &&
      /^[+-]?(?:\d+(?:,\d{3})*(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)
        ? Number(value.replaceAll(",", ""))
        : null;
    const row = {
      metric,
      period: cells[1] ?? "",
      value: numeric(cells[2]),
      currency: (cells[3] ?? "").toUpperCase(),
      unit_scale: numeric(cells[4]) ?? 0,
    };
    return {
      line: index + 1,
      row,
      issues: [
        ...(cells.length !== 5
          ? ["Paste exactly five tab-separated columns."]
          : []),
        ...validateFinancialRecord(row, currency),
      ],
    };
  });
}
