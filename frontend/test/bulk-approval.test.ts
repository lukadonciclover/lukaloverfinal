import {
  applyApproval,
  approvalPreview,
  ensureRecordIds,
  modifyFigure,
  parseSpreadsheet,
  reviewSuggestions,
} from "@/lib/bulk-approval";
import { createBlankWorkspace } from "@/lib/defaults";
import { financialFingerprint } from "@/lib/fingerprint";
import { parseWorkspace } from "@/lib/workspace";
import { payloadFor } from "@/lib/workbench";
import type { FigureSuggestion } from "@/lib/types";
export function pendingWorkspace(count = 1) {
  const workspace = createBlankWorkspace("Approval Test");
  const suggestions: FigureSuggestion[] = Array.from(
    { length: count },
    (_, i) => ({
      record_id: `s-${i}`,
      metric: "revenue",
      period: String(1900 + i),
      value: i + 100,
      currency: "USD",
      unit_scale: 1000000,
      units_confirmed: true,
      currency_confirmed: true,
      page: i + 1,
      quote: `Revenue ${i + 100}`,
      confidence: 0.9,
    }),
  );
  workspace.documents = [
    {
      identifier: "doc-1",
      name: "Statements.csv",
      document_type: "Financial dataset",
      reporting_period: "",
      pages: 1,
      warning: "",
      extraction_status: "complete",
      retained_by_server: false,
      chunks: [],
      suggestions,
    },
  ];
  return workspace;
}
it.each([1, 84, 150])(
  "approves %i observations atomically and retains source references",
  (count) => {
    const w = pendingWorkspace(count);
    const before = structuredClone(w);
    const preview = approvalPreview(
      w,
      w.documents[0].suggestions.map((r) => r.record_id!),
    );
    const next = applyApproval(w, preview);
    expect(next.figures).toHaveLength(count);
    expect(next.documents[0].suggestions).toHaveLength(0);
    expect(w).toEqual(before);
    expect(next.figures[0].source).toMatchObject({
      document_name: "Statements.csv",
      document_identifier: "doc-1",
      page: 1,
      quote: "Revenue 100",
      reporting_period: "1900",
      currency: "USD",
      unit_scale: 1000000,
      confidence: 0.9,
    });
  },
);
it.each([
  { currency: "ZZZ" },
  { currency: "EUR" },
  { units_confirmed: undefined },
  { currency_confirmed: undefined },
  { period: "2025-Q9" },
  { period: "" },
  { metric: "unknown" },
  { value: null },
  { unit_scale: 0 },
])("excludes invalid or unverified records: %j", (patch) => {
  const w = pendingWorkspace();
  Object.assign(w.documents[0].suggestions[0], patch);
  expect(approvalPreview(w, ["s-0"]).eligible).toHaveLength(0);
  expect(
    applyApproval(w, approvalPreview(w, ["s-0"])).documents[0].suggestions,
  ).toHaveLength(1);
});
it("keeps one identical duplicate and excludes all disagreeing duplicates even if only one is selected", () => {
  const w = pendingWorkspace();
  w.documents[0].suggestions.push({
    ...w.documents[0].suggestions[0],
    record_id: "duplicate",
  });
  expect(reviewSuggestions(w).map((r) => r.status)).toEqual([
    "eligible",
    "duplicate",
  ]);
  w.documents[0].suggestions[1].value = 900;
  expect(approvalPreview(w, ["s-0"]).eligible).toHaveLength(0);
  expect(reviewSuggestions(w).every((r) => r.status === "conflict")).toBe(true);
});
it("preserves existing ledger entries and other project data", () => {
  const w = pendingWorkspace();
  w.company.analyst_notes = "Keep";
  w.figures = [
    {
      record_id: "old",
      company_id: w.company.id,
      metric: "revenue",
      period: "1900",
      value: 999,
      currency: "USD",
      unit_scale: 1,
      origin: "user-supplied",
      notes: "Original",
    },
  ];
  const next = applyApproval(w, approvalPreview(w, ["s-0"]));
  expect(next).toEqual(w);
  expect(reviewSuggestions(w)[0].status).toBe("conflict");
});
it("rejects stale approval snapshots", () => {
  const w = pendingWorkspace();
  const preview = approvalPreview(w, ["s-0"]);
  const changed = { ...w, revision: 1 };
  expect(applyApproval(changed, preview)).toBe(changed);
});
it("generates stable identifiers without invalidating unchanged analysis", () => {
  const w = pendingWorkspace();
  delete w.documents[0].suggestions[0].record_id;
  w.figures = [
    {
      company_id: w.company.id,
      metric: "revenue",
      period: "2025",
      value: 100,
      currency: "USD",
      unit_scale: 1,
      origin: "user-supplied",
      notes: "",
    },
  ];
  const hash = financialFingerprint(w.figures);
  const next = ensureRecordIds(w);
  expect(ensureRecordIds(next)).toBe(next);
  expect(financialFingerprint(next.figures)).toBe(hash);
  expect(
    financialFingerprint([modifyFigure(next.figures[0], { value: 101 })]),
  ).not.toBe(hash);
});
it("retains original provenance on user modifications", () => {
  const w = pendingWorkspace();
  const row = applyApproval(w, approvalPreview(w, ["s-0"])).figures[0];
  const edited = modifyFigure(row, { unit_scale: 1000, currency: "EUR" });
  expect(edited.source).toEqual(row.source);
  expect(edited.origin).toBe("user-supplied");
  expect(edited.source?.unit_scale).toBe(1000000);
  expect(edited.unit_scale).toBe(1000);
});
it("previews spreadsheet records without assuming missing values or units", () => {
  const rows = parseSpreadsheet(
    "Metric\tPeriod\tValue\tCurrency\tUnit scale\nOperating Cash Flow\t2025\t1,250.5\tUSD\t1000\nrevenue\tbad\t\tZZZ\t",
    "USD",
  );
  expect(rows[0].issues).toEqual([]);
  expect(rows[0].row.value).toBe(1250.5);
  expect(rows[0].row.metric).toBe("operating_cash_flow");
  expect(rows[1].row.value).toBeNull();
  expect(rows[1].issues.length).toBeGreaterThan(2);
});
it("round-trips verification indicators, stable IDs, and incomplete pending corrections", () => {
  const w = pendingWorkspace();
  w.documents[0].suggestions[0].value = null;
  w.documents[0].suggestions[0].unit_scale = 0;
  expect(parseWorkspace(w).documents[0].suggestions[0]).toMatchObject({
    record_id: "s-0",
    value: null,
    unit_scale: 0,
    units_confirmed: true,
  });
});
it("keeps UI record identifiers out of valuation and export API payloads", () => {
  const w = pendingWorkspace();
  const next = applyApproval(w, approvalPreview(w, ["s-0"]));
  expect(next.figures[0].record_id).toBeTruthy();
  expect(payloadFor(next).figures[0]).not.toHaveProperty("record_id");
  expect(payloadFor(next).figures[0].source).toEqual(next.figures[0].source);
});
