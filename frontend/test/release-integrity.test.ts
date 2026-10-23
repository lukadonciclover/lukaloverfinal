import { historicalFixture } from "./historical-fixture";
import { createTestWorkspace } from "./fixtures";
import { fillHistorical, referencesCurrent } from "@/lib/historical-references";
import {
  documentDependencies,
  removeSource,
  unresolvedSources,
  resolveRemovedSource,
} from "@/lib/source-dependencies";
import { payloadFor, type PeerInput } from "@/lib/workbench";
import { parseWorkspace, persistenceCopy } from "@/lib/workspace";
import { proposalError } from "@/lib/assumptions";
import { previewPeers, importNewPeers, samePeer } from "@/lib/peer-import";

import { sourcedWorkspace } from "./release-fixture";

it("counts direct and derived dependencies, preserves unrelated data and invalidates without replacing values", () => {
  const w = sourcedWorkspace(),
    before = structuredClone(w),
    dep = documentDependencies(w, "source");
  expect(dep.figures.length).toBe(w.figures.length);
  expect(dep.references.length).toBe(15);
  expect(dep.active.length).toBe(w.assumptionAdoptions!.length);
  const removed = removeSource(w, "source", w.revision);
  expect(w).toEqual(before);
  expect(removed.documents.map((d) => d.identifier)).toEqual(["other"]);
  expect(removed.figures).toEqual([]);
  expect(removed.financialAnalysis).toBeNull();
  expect(referencesCurrent(removed)).toBe(false);
  expect(removed.valuationWorkbench!.forecast.growth).toBe(0.1);
  expect(unresolvedSources(removed)).toHaveLength(dep.active.length);
  removed.valuationWorkbench!.enabled.dcf = true;
  expect(payloadFor(removed).blocked_assumptions).toContain("dcf.base_revenue");
  expect(fillHistorical(removed, "forecast").count).toBe(0);
  expect(() => removeSource(w, "source", w.revision + 1)).toThrow(/changed/);
});
it("supports explicit analyst review, clearing and privacy-safe project round trips", () => {
  let w = removeSource(sourcedWorkspace(), "source", 0);
  const a = unresolvedSources(w).find((a) => a.target === "forecast.growth")!;
  expect(
    proposalError(
      {
        source: a.source,
        target: a.target,
        value: a.value,
        period: "2026",
        rationale: "Reviewed",
        reviewed: true,
      },
      w,
    ),
  ).toMatch(/removed/);
  const originalTimestamp = a.accepted_at;
  w = resolveRemovedSource(w, a.id, "keep", w.revision);
  expect(
    w.assumptionAdoptions!.find((row) => row.id === a.id)!.accepted_at,
  ).toBe(originalTimestamp);
  expect(w.assumptionAdoptions!.at(-1)!.source_status).toBe("analyst_reviewed");
  expect(unresolvedSources(w).some((a) => a.target === "forecast.growth")).toBe(
    false,
  );
  const d = unresolvedSources(w).find((a) => a.target === "dcf.base_revenue")!;
  w = resolveRemovedSource(w, d.id, "clear", w.revision);
  expect(w.dcfInputs.base_revenue).toBeNull();
  const text = JSON.stringify(persistenceCopy(w));
  expect(text).not.toContain("private excerpt");
  const parsed = parseWorkspace(JSON.parse(text));
  expect(parsed.assumptionAdoptions!.at(-1)!.source_status).toBe("cleared");
  expect(
    parsed.assumptionAdoptions!.find((a) => a.id === d.id)!.removed_documents,
  ).toEqual(["source"]);
});
it("removes an unused document without clearing unrelated ledger or assumptions", () => {
  const w = sourcedWorkspace();
  const removed = removeSource(w, "other", w.revision);
  expect(removed.figures).toEqual(w.figures);
  expect(removed.assumptionAdoptions).toEqual(w.assumptionAdoptions);
  expect(unresolvedSources(removed)).toHaveLength(0);
});
const peer: PeerInput = {
  company: "Acme Inc",
  selected: true,
  currency: "USD",
  unit_scale: 1,
  acquisition_date: "",
  market_cap: 100,
  debt: 10,
  cash: 5,
  enterprise_value: null,
  revenue: 20,
  ebitda: 5,
  ebit: 4,
  net_income: 3,
  book_equity: 10,
  reporting_basis: "annual",
  financial_period: "2025",
  measurement_date: "2026-01-01",
};
it("previews repeat files and conflicts without mutating existing records; imports only new unselected observations", () => {
  const rows = [peer],
    snapshot = structuredClone(rows);
  expect(
    previewPeers(rows, [{ ...peer, company: " ACME, Inc. " }])[0].status,
  ).toBe("duplicate");
  expect(previewPeers(rows, [{ ...peer, revenue: 21 }])[0].status).toBe(
    "conflict",
  );
  expect(rows).toEqual(snapshot);
  expect(previewPeers(rows, [{ ...peer, period_end: "2025-12-31" }])[0].status).toBe("conflict");
  const next = importNewPeers(rows, [
    peer,
    { ...peer, financial_period: "2024" },
  ]);
  expect(next).toHaveLength(2);
  expect(next[1].selected).toBe(false);
  expect(next[0].selected).toBe(true);
  expect(
    importNewPeers(next, [peer, { ...peer, financial_period: "2024" }]),
  ).toHaveLength(2);
  expect(previewPeers([], [peer, peer]).map((r) => r.status)).toEqual([
    "new",
    "duplicate",
  ]);
  expect(previewPeers([], [peer, { ...peer, revenue: 21 }]).map(r => r.status)).toEqual(["conflict", "conflict"]);
  expect(importNewPeers([], [peer, { ...peer, revenue: 21 }])).toEqual([]);
});
it("separates transaction identities and legitimate repeated acquisitions", () => {
  const a = { ...peer, acquisition_date: "2025-01-01", acquirer: "Buyer" };
  expect(samePeer(a, { ...a, acquisition_date: "2026-01-01" }, true)).toBe(
    false,
  );
  expect(
    samePeer(
      { ...a, transaction_id: "deal-1" },
      { ...a, transaction_id: "deal-2" },
      true,
    ),
  ).toBe(false);
  expect(samePeer(a, a, true)).toBe(true);
});
