import { historicalFixture } from "./historical-fixture";
import {
  fillHistorical,
  markHistoricalEdits,
  historicalLabel,
  referencesCurrent,
} from "@/lib/historical-references";
import { financialFingerprint } from "@/lib/fingerprint";
import { settingsFor, payloadFor } from "@/lib/workbench";
import { parseWorkspace, persistenceCopy } from "@/lib/workspace";

it("fills supported blank forecast fields in decimal units without activating models or adding opex overrides", () => {
  const w = historicalFixture(),
    { workspace: next, count } = fillHistorical(w, "forecast");
  expect(count).toBe(7);
  expect(next.valuationWorkbench!.forecast).toMatchObject({
    growth: 0.1,
    gross_margin: 0.4,
    ebitda_margin: 0.2,
    opex_ratio: null,
    depreciation_ratio: 0.05,
    tax_rate: 0.2,
    capex_ratio: 0.04,
    nwc_ratio: 0.1,
    interest_rate: null,
  });
  expect(next.valuationWorkbench!.enabled.forecast).toBe(false);
  expect(next.assumptionAdoptions!.every((a) => a.mode === "automatic")).toBe(
    true,
  );
  expect(historicalLabel(next, "forecast.growth")).toMatch(
    /10%.*Historical average.*2025/,
  );
  expect(w.valuationWorkbench).toBeUndefined();
});
it("preserves zero, manual values, management guidance and active opex drivers", () => {
  const w = historicalFixture();
  w.valuationWorkbench = settingsFor(w);
  Object.assign(w.valuationWorkbench.forecast, {
    growth: 0,
    capex_ratio: 0.09,
    opex_ratio: 0.1,
  });
  const next = fillHistorical(w, "forecast").workspace;
  expect(next.valuationWorkbench!.forecast.growth).toBe(0);
  expect(next.valuationWorkbench!.forecast.capex_ratio).toBe(0.09);
  expect(next.valuationWorkbench!.forecast.opex_ratio).toBe(0.1);
  expect(next.valuationWorkbench!.forecast.ebitda_margin).toBeNull();
});
it("prefills DCF years independently, latest balance amounts, and leaves unsupported discount inputs blank", () => {
  const w = historicalFixture();
  w.dcfInputs.revenue_growth[1] = 0.03;
  const next = fillHistorical(w, "valuation").workspace;
  expect(next.dcfInputs.revenue_growth).toEqual([0.1, 0.03, 0.1, 0.1, 0.1]);
  expect(next.dcfInputs.base_revenue).toBe(100);
  expect(next.valuationWorkbench).toMatchObject({
    cash: 12,
    debt: 10,
    opening_nwc: 10,
    assets: { book_assets: 200, book_liabilities: 80 },
    wacc: { risk_free: null, beta: null, cost_of_debt: null },
  });
  expect(next.dcfInputs.wacc).toBeNull();
  expect(next.dcfInputs.terminal_growth).toBeNull();
  expect(new Set(next.assumptions!.map((a) => a.id)).size).toBe(
    next.assumptions!.length,
  );
});
it("preserves forecast linkage and current bridge inputs", () => {
  const w = historicalFixture();
  w.valuationWorkbench = settingsFor(w);
  w.valuationWorkbench.enabled.forecast = true;
  w.valuationWorkbench.cash = 0;
  const next = fillHistorical(w, "valuation").workspace;
  expect(next.dcfInputs).toEqual(w.dcfInputs);
  expect(next.valuationWorkbench!.opening_nwc).toBeNull();
  expect(next.valuationWorkbench!.cash).toBe(0);
});
it("marks manual edits including cleared fields and preserves them through refresh, reload and backups", () => {
  const filled = fillHistorical(historicalFixture(), "forecast").workspace;
  const edited = markHistoricalEdits(filled, {
    ...filled,
    valuationWorkbench: {
      ...settingsFor(filled),
      forecast: {
        ...settingsFor(filled).forecast,
        growth: null,
        capex_ratio: 0.08,
      },
    },
  });
  expect(historicalLabel(edited, "forecast.growth")).toMatch(/User-modified/);
  const restored = parseWorkspace(
    JSON.parse(JSON.stringify(persistenceCopy(edited))),
  );
  const next = fillHistorical(restored, "forecast").workspace;
  expect(next.valuationWorkbench!.forecast.growth).toBeNull();
  expect(next.valuationWorkbench!.forecast.capex_ratio).toBe(0.08);
  const reset = fillHistorical(next, "forecast", "forecast.growth").workspace;
  expect(reset.valuationWorkbench!.forecast.growth).toBe(0.1);
  expect(reset.valuationWorkbench!.forecast.capex_ratio).toBe(0.08);
  expect(reset.assumptionAdoptions!.at(-1)!.mode).toBe("historical restore");
});
it("marks data changes stale and recalculation never replaces existing model inputs", () => {
  const w = fillHistorical(historicalFixture(), "forecast").workspace;
  w.figures[0] = { ...w.figures[0], value: 110 };
  expect(referencesCurrent(w)).toBe(false);
  expect(fillHistorical(w, "forecast").count).toBe(0);
  expect(historicalLabel(w, "forecast.growth")).toMatch(/stale/);
  w.historicalReferences = {
    ...w.historicalReferences!,
    input_hash: financialFingerprint(w.figures),
    created_at: new Date().toISOString(),
  };
  const before = payloadFor(w);
  expect(payloadFor(fillHistorical(w, "forecast").workspace)).toEqual(before);
});
it("financial fingerprints ignore record ordering and privacy-only changes but detect financial inputs", () => {
  const w = historicalFixture(),
    copy = persistenceCopy(w);
  expect(financialFingerprint(w.figures)).toBe(
    financialFingerprint(copy.figures.slice().reverse()),
  );
  copy.figures[0] = { ...copy.figures[0], unit_scale: 1000 };
  expect(financialFingerprint(w.figures)).not.toBe(
    financialFingerprint(copy.figures),
  );
});
it("rejects malformed saved averages instead of populating models", () => {
  const w = historicalFixture();
  w.historicalReferences!.averages[0].value = NaN;
  expect(() => parseWorkspace(w)).toThrow(/historical averages/);
});

it("sends the current equity bridge and preserves audit records after shrinking the DCF horizon",()=>{
  const w=fillHistorical(historicalFixture(),"valuation").workspace;
  w.valuationWorkbench!.enabled.dcf=true;
  expect(payloadFor(w).dcf).toMatchObject({cash:12,debt:10});
  for(const key of ["revenue_growth","ebit_margin","tax_rate","depreciation_pct_revenue","capex_pct_revenue","nwc_pct_revenue"] as const)w.dcfInputs[key]=w.dcfInputs[key].slice(0,3);
  expect(parseWorkspace(JSON.parse(JSON.stringify(w))).assumptionAdoptions?.length).toBe(w.assumptionAdoptions!.length);
});
