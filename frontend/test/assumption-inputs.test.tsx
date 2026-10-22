import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { AssumptionNumber } from "@/components/assumption-number";
import { historicalFixture } from "./historical-fixture";
import { fillHistorical } from "@/lib/historical-references";
import { assumptionStatus, operatingSummary } from "@/lib/assumption-status";
import { payloadFor, profitabilityMethod, settingsFor } from "@/lib/workbench";
import { parseWorkspace } from "@/lib/workspace";
import { financialFingerprint } from "@/lib/fingerprint";

it("rounds percentages for display only, preserves precision on focus and converts edits exactly once", () => {
  function Form() {
    const [value, setValue] = useState<number | null>(0.0422375293017343);
    return (
      <>
        <AssumptionNumber
          metric="growth"
          label="Rate"
          value={value}
          onValue={setValue}
        />
        <output>{String(value)}</output>
      </>
    );
  }
  render(<Form />);
  const input = screen.getByRole("spinbutton");
  expect(input).toHaveValue(4.224);
  fireEvent.focus(input);
  fireEvent.blur(input);
  expect(screen.getByText("0.0422375293017343")).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "5.5" } });
  expect(screen.getByText("0.055")).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "-2.5" } });
  expect(screen.getByText("-0.025")).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "0" } });
  expect(screen.getByText("0")).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.getByText("null")).toBeInTheDocument();
});
it("does not scale monetary values or multiples and reflects external restoration", () => {
  const change = vi.fn();
  const view = render(
    <AssumptionNumber
      metric="exit_multiple"
      label="Multiple"
      value={8}
      onValue={change}
    />,
  );
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "9" } });
  expect(change).toHaveBeenCalledWith(9);
  view.rerender(
    <AssumptionNumber
      metric="exit_multiple"
      label="Multiple"
      value={7}
      onValue={change}
    />,
  );
  expect(screen.getByRole("spinbutton")).toHaveValue(7);
});
it("uses only the selected profitability driver while preserving inactive inputs and legacy selection", () => {
  const w = historicalFixture();
  const s = settingsFor(w);
  w.valuationWorkbench = s;
  s.forecast.opex_ratio = 0.15;
  s.forecast.ebitda_margin = 0.25;
  s.enabled.forecast = true;
  expect(profitabilityMethod(s)).toBe("opex");
  s.profitability_method = "ebitda";
  expect(payloadFor(w).forecast?.opex_ratio).toBeNull();
  expect(s.forecast.opex_ratio).toBe(0.15);
  expect(assumptionStatus(w, "forecast.opex_ratio")).toMatch(/Not Applicable/);
  s.profitability_method = "opex";
  expect(payloadFor(w).forecast?.opex_ratio).toBe(0.15);
  expect(payloadFor(w).forecast?.ebitda_margin).toBe(0);
  expect(
    parseWorkspace(JSON.parse(JSON.stringify(w))).valuationWorkbench
      ?.profitability_method,
  ).toBe("opex");
  s.forecast.opex_ratio = null;
  expect(payloadFor(w).forecast?.ebitda_margin).toBeNull();
});
it("labels policy zeros and unsupported values, excludes policies and inactive drivers from coverage", () => {
  const w = fillHistorical(historicalFixture(), "forecast").workspace;
  expect(assumptionStatus(w, "forecast.net_borrowing")).toMatch(
    /Model Default.*No additional borrowing/,
  );
  expect(assumptionStatus(w, "forecast.dividends")).toMatch(
    /No dividend payments/,
  );
  expect(assumptionStatus(w, "forecast.minimum_cash")).toMatch(
    /No minimum cash/,
  );
  expect(assumptionStatus(w, "dcf.wacc")).toMatch(/Missing Supporting Data/);
  expect(operatingSummary(w)).toMatchObject({
    total: 8,
    sourced: 7,
    missing: ["interest_rate"],
  });
  w.valuationWorkbench!.edited_inputs = ["forecast.net_borrowing"];
  expect(assumptionStatus(w, "forecast.net_borrowing")).toBe(
    "Analyst Assumption",
  );
  w.valuationWorkbench!.forecast.interest_rate = null;
  w.valuationWorkbench!.edited_inputs.push("forecast.interest_rate");
  expect(
    fillHistorical(w, "forecast").workspace.valuationWorkbench!.forecast
      .interest_rate,
  ).toBeNull();
});

it("preserves signed operating NWC and requires explicit adoption of policy balances", () => {
  const w = historicalFixture();
  const nwc = w.historicalReferences!.averages.find(a => a.metric === "nwc_ratio")!;
  nwc.value = -.1; nwc.source.value = -.1;
  expect(fillHistorical(w, "forecast").workspace.valuationWorkbench!.forecast.nwc_ratio).toBe(-.1);
  const input = {...w.figures[0], metric:"net_borrowing", value:12};
  w.figures.push(input);
  w.historicalReferences!.input_hash = financialFingerprint(w.figures);
  w.historicalReferences!.latest.push({...w.historicalReferences!.latest[0],id:"policy-borrowing",metric:"net_borrowing",value:12,inputs:[{metric:input.metric,period:input.period,value:12,currency:input.currency,unit_scale:input.unit_scale,document_id:""}]});
  expect(fillHistorical(w,"forecast").workspace.valuationWorkbench!.forecast.net_borrowing).toBe(0);
  expect(fillHistorical(w,"forecast","forecast.net_borrowing").workspace.valuationWorkbench!.forecast.net_borrowing).toBe(12);
});
