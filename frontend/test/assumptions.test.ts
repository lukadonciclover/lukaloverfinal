import { createTestWorkspace } from "./fixtures";
import {
  applyProposals,
  assumptionExport,
  conflictsFor,
  currentValue,
  proposalError,
  targetsFor,
  type Assumption,
  type Proposal,
} from "@/lib/assumptions";
import { parseWorkspace, persistenceCopy } from "@/lib/workspace";
import { settingsFor, payloadFor } from "@/lib/workbench";

function evidence(overrides: Partial<Assumption> = {}): Assumption {
  return {
    id: "synthetic-guidance",
    metric: "revenue_growth",
    value: 0.06,
    minimum: null,
    maximum: null,
    unit: "percentage",
    currency: "USD",
    unit_scale: 1,
    period: "FY 2027",
    basis: "annual",
    scope: "consolidated",
    classification: "management guidance",
    explicit: true,
    document_id: "doc",
    document_name: "Synthetic test guidance",
    page: 2,
    excerpt: "Sensitive source text",
    confidence: 0.8,
    status: "pending",
    rationale: "",
    ...overrides,
  };
}
function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    source: evidence(),
    target: "forecast.growth",
    value: 0.06,
    period: "2027-2031",
    rationale: "Reviewed scope and explicitly selected the forecast horizon",
    reviewed: true,
    ...overrides,
  };
}

describe("reviewed assumption transactions", () => {
  it("changes only the selected field and retains manual inputs and disabled models", () => {
    const w = createTestWorkspace();
    w.valuationWorkbench = settingsFor(w);
    w.valuationWorkbench.forecast.capex_ratio = 0.04;
    const before = structuredClone(w);
    const next = applyProposals(w, [proposal()], w.revision);
    expect(next.valuationWorkbench!.forecast.growth).toBe(0.06);
    expect(next.valuationWorkbench!.forecast.capex_ratio).toBe(0.04);
    expect(next.valuationWorkbench!.enabled).toEqual(
      before.valuationWorkbench!.enabled,
    );
    expect(next.figures).toEqual(before.figures);
    expect(w).toEqual(before);
    expect(next.assumptionAdoptions![0].source.excerpt).toBe(
      "Sensitive source text",
    );
    expect(next.assumptions![0].status).toBe("accepted");
  });
  it("applies a batch atomically and only the selected DCF year", () => {
    const w = createTestWorkspace();
    const next = applyProposals(
      w,
      [
        proposal(),
        proposal({
          source: evidence({ id: "margin", metric: "ebit_margin", value: 0.2 }),
          target: "dcf.ebit_margin.2",
          value: 0.2,
        }),
      ],
      w.revision,
    );
    expect(next.dcfInputs.ebit_margin[2]).toBe(0.2);
    expect(next.dcfInputs.ebit_margin[0]).toBe(w.dcfInputs.ebit_margin[0]);
    expect(next.assumptionAdoptions).toHaveLength(2);
    expect(payloadFor(next).forecast).toBeNull();
  });
  it("rejects missing consent, invalid values and stale previews without mutation", () => {
    const w = createTestWorkspace();
    const before = structuredClone(w);
    expect(() =>
      applyProposals(w, [proposal({ reviewed: false })], w.revision),
    ).toThrow(/Confirm/);
    expect(() =>
      applyProposals(w, [proposal({ value: NaN })], w.revision),
    ).toThrow(/numeric/);
    expect(() => applyProposals(w, [proposal()], w.revision + 1)).toThrow(
      /changed/,
    );
    expect(w).toEqual(before);
  });
  it("requires explicit range selection and does not choose a midpoint", () => {
    const w = createTestWorkspace(),
      source = evidence({ value: null, minimum: 0.05, maximum: 0.07 });
    expect(proposalError(proposal({ source, value: NaN }), w)).toMatch(
      /numeric/,
    );
    expect(proposalError(proposal({ source, value: 0.08 }), w)).toMatch(
      /within/,
    );
    expect(proposalError(proposal({ source, value: 0.065 }), w)).toBeNull();
  });
  it("shows conflicting sources and rejects duplicate target adoption", () => {
    const a = evidence(),
      b = evidence({ id: "second", document_id: "another", value: 0.09 });
    expect(conflictsFor(a, [a, b])).toEqual([b]);
    const w = createTestWorkspace();
    expect(() =>
      applyProposals(
        w,
        [proposal(), proposal({ source: b, value: 0.09 })],
        w.revision,
      ),
    ).toThrow(/same input/);
    expect(
      applyProposals(w, [proposal({ source: b, value: 0.09 })], w.revision)
        .valuationWorkbench!.forecast.growth,
    ).toBe(0.09);
  });
  it.each(["quarter", "multi-year"])(
    "blocks direct annual application of %s guidance",
    (basis) => {
      expect(
        proposalError(
          proposal({ source: evidence({ basis }) }),
          createTestWorkspace(),
        ),
      ).toMatch(/annual/);
    },
  );
  it("blocks segment and currency mismatches", () => {
    const w = createTestWorkspace();
    expect(
      proposalError(
        proposal({ source: evidence({ scope: "segment / unspecified" }) }),
        w,
      ),
    ).toMatch(/Segment/);
    expect(
      proposalError(
        proposal({
          source: evidence({
            metric: "dividend",
            unit: "currency",
            currency: "EUR",
          }),
          target: "ddm.dividend",
          value: 2,
        }),
        w,
      ),
    ).toMatch(/currency/);
  });
  it("never maps revenue growth to terminal growth or dividend growth", () => {
    expect(
      targetsFor(evidence(), createTestWorkspace()).some(
        (t) => t.includes("terminal") || t.startsWith("ddm"),
      ),
    ).toBe(false);
    expect(
      targetsFor(evidence({ metric: "revenue" }), createTestWorkspace()),
    ).toEqual([]);
  });
  it("rejects stale historical evidence and controlled DCF inputs", () => {
    const w = createTestWorkspace();
    const p = proposal({
      source: evidence({
        inputs: [
          {
            metric: "revenue",
            period: "2025",
            value: 999,
            unit_scale: 1,
            currency: "USD",
            document_id: "doc",
          },
        ],
      }),
    });
    expect(proposalError(p, w)).toMatch(/Historical evidence changed/);
    w.valuationWorkbench = settingsFor(w);
    w.valuationWorkbench.enabled.forecast = true;
    expect(
      proposalError(proposal({ target: "dcf.revenue_growth.0" }), w),
    ).toMatch(/controlled/);
  });
  it("converts reviewed paired capital weights only with a verified total", () => {
    const w = createTestWorkspace();
    const equity = proposal({
      source: evidence({ metric: "equity_weight", value: 0.7 }),
      target: "wacc.market_equity",
      value: 0.7,
      capitalBase: 1000,
    });
    const debt = proposal({
      source: evidence({ id: "debt", metric: "debt_weight", value: 0.3 }),
      target: "wacc.market_debt",
      value: 0.3,
      capitalBase: 1000,
    });
    expect(() => applyProposals(w, [equity], w.revision)).toThrow(/together/);
    const next = applyProposals(w, [equity, debt], w.revision);
    expect(next.valuationWorkbench!.wacc.market_equity).toBe(700);
    expect(next.valuationWorkbench!.wacc.market_debt).toBe(300);
  });
  it("preserves traceability through JSON and redacts excerpts when retention is off", () => {
    const w = applyProposals(createTestWorkspace(), [proposal()], 0);
    w.settings.persistDocumentText = true;
    expect(
      parseWorkspace(JSON.parse(JSON.stringify(w))).assumptionAdoptions![0]
        .source.excerpt,
    ).toBe("Sensitive source text");
    const restored = parseWorkspace(JSON.parse(JSON.stringify(w)), false);
    expect(restored.assumptionAdoptions![0].source.excerpt).toBe("");
    expect(restored.assumptions![0].excerpt).toBe("");
    expect(restored.assumptionAdoptions![0].source.document_id).toBe("doc");
    expect(assumptionExport(restored)[0].source.excerpt).toBe("");
    expect(persistenceCopy(restored).assumptionAdoptions).toEqual(
      restored.assumptionAdoptions,
    );
  });
  it("keeps different project workspaces isolated and supports older projects", () => {
    const first = createTestWorkspace(),
      second = createTestWorkspace();
    const next = applyProposals(first, [proposal()], first.revision);
    expect(second.assumptionAdoptions).toBeUndefined();
    expect(parseWorkspace(second).assumptionAdoptions).toBeUndefined();
    expect(currentValue(next, "forecast.growth")).toBe(0.06);
  });
  it("rejects arbitrary imported mutation targets", () => {
    const w = applyProposals(createTestWorkspace(), [proposal()], 0);
    w.assumptionAdoptions![0].target = "__proto__.polluted";
    expect(() => parseWorkspace(w)).toThrow(/Malformed assumption adoption/);
  });
});
