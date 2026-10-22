import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { vi } from "vitest";
import {
  formatFinancialLabel,
  formatFinancialValue,
  formatCurrency,
  formatPercent,
  formatMultiple,
  formatFinancialMessage,
} from "@/lib/financial-formatting";
import {
  FinancialChartTooltip,
  FinancialChartLegend,
} from "@/components/financial-chart";
import { comparableEquity, ResultsPage } from "@/components/pages/workbench";
import { WorkspacePage } from "@/components/pages/workspace";
import { FinancialsPage } from "@/components/pages/financials";
import { CreateProjectForm } from "@/components/create-project-form";
import { WorkspaceProvider, useProjectPortfolio } from "@/lib/workspace";
import { createBlankWorkspace } from "@/lib/defaults";
import { financialFingerprint } from "@/lib/fingerprint";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  loadIndexedWorkspace: mocks.load,
  saveIndexedWorkspace: mocks.save,
  deleteIndexedWorkspace: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  apiPost: mocks.post,
  apiUpload: vi.fn(),
  apiDownload: vi.fn(),
  saveBlob: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
beforeEach(() => {
  localStorage.clear();
  mocks.load.mockResolvedValue(createBlankWorkspace("Existing"));
  mocks.save.mockResolvedValue(undefined);
  mocks.post
    .mockReset()
    .mockResolvedValue({
      models: {},
      history: {},
      forecast: [],
      errors: {},
      scenarios: {},
      sensitivities: {},
    });
});
it("uses explicit financial units and preserves missing, zero and negative values", () => {
  expect(formatFinancialLabel("operating_cash_flow")).toBe(
    "Operating Cash Flow",
  );
  expect(formatFinancialLabel("ebit")).toBe("EBIT");
  expect(formatFinancialLabel("unfamiliar_metric")).toBe("Unfamiliar Metric");
  expect(formatCurrency(1250000000, "USD", true)).toBe("$1.25B");
  expect(formatCurrency(1250.5, "EUR")).toBe("€1,250.50");
  expect(formatPercent(0.0567)).toBe("5.67%");
  expect(formatPercent(-0.042)).toBe("-4.2%");
  expect(formatMultiple(8.75)).toBe("8.75×");
  expect(formatFinancialValue("per_share", 55.9599)).toBe("$55.96/share");
  expect(formatFinancialValue("current_ratio", 2)).toBe("2×");
  expect(formatFinancialValue("working_capital", 12, { scale: 1000000 })).toBe(
    "$12,000,000.00",
  );
  expect(formatFinancialValue("gross_margin", 0.125, { scale: 1000000 })).toBe(
    "12.5%",
  );
  expect(formatFinancialValue("unknown_growth_amount", 0.5)).toBe("0.5");
  expect(formatFinancialValue("equity_value", null)).toBe("Unavailable");
  expect(formatFinancialValue("equity_value", NaN)).toBe("Unavailable");
  expect(formatFinancialValue("equity_value", 0)).toBe("$0.00");
  expect(formatFinancialValue("year", 2025)).toBe("2025");
  expect(formatFinancialMessage("Missing operating_cash_flow.")).toBe(
    "Missing Operating Cash Flow.",
  );
});
it("renders readable legends and correctly formatted tooltip values", () => {
  render(
    <>
      <FinancialChartLegend
        payload={[{ value: "Operating Cash Flow", color: "#45b6ad" }]}
      />
      <FinancialChartTooltip
        active
        currency="EUR"
        label="2025"
        payload={[
          { dataKey: "revenue", name: "Revenue", value: 1250.5 },
          { dataKey: "gross_margin", name: "Gross Margin", value: 0.1825 },
        ]}
      />
    </>,
  );
  expect(screen.getByText("Operating Cash Flow")).toBeInTheDocument();
  expect(screen.getByText("€1,250.50")).toBeInTheDocument();
  expect(screen.getByText("18.25%")).toBeInTheDocument();
});
it("never mixes DDM per-share amounts with total equity", () => {
  expect(comparableEquity("DDM", { per_share: 50 }, null)).toBeNull();
  expect(comparableEquity("DDM", { per_share: 50 }, 0)).toBeNull();
  expect(comparableEquity("DDM", { per_share: 50 }, 10)).toBe(500);
  expect(
    comparableEquity("DCF", { equity_value: 500, per_share: 50 }, 10),
  ).toBe(500);
  expect(comparableEquity("DCF", { enterprise_value: 900 }, 10)).toBeNull();
});
function ProjectProbe() {
  const p = useProjectPortfolio();
  return <p>{p.projects.map((project) => project.name).join(" | ")}</p>;
}
it("validates, cancels and creates trimmed names while preserving existing projects", async () => {
  render(
    <WorkspaceProvider>
      <CreateProjectForm />
      <ProjectProbe />
    </WorkspaceProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Create Project" }),
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a project name");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "  New Project  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
  expect(screen.getByText("Existing | New Project")).toBeInTheDocument();
  await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  expect(
    mocks.save.mock.lastCall?.[0].projects.at(-1).workspace.figures,
  ).toEqual([]);
});
it("keeps review and approval in Financial Data without requesting analysis", async () => {
  const w = createBlankWorkspace("Source Company");
  w.documents = [
    {
      identifier: "doc",
      name: "Statements.csv",
      document_type: "Financial dataset",
      reporting_period: "2025",
      pages: 1,
      warning: "",
      extraction_status: "complete",
      retained_by_server: false,
      chunks: [],
      suggestions: [
        {
          metric: "operating_cash_flow",
          period: "2025",
          value: 100,
          currency: "USD",
          unit_scale: 1000,
          page: 1,
          quote: "Cash flow 100",
          confidence: 0.9,
        },
      ],
    },
  ];
  mocks.load.mockResolvedValue(w);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <WorkspaceProvider>
      <WorkspacePage />
    </WorkspaceProvider>,
  );
  expect(
    await screen.findByRole("heading", {
      name: "Document extraction suggestions",
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Financial Analysis" }),
  ).not.toBeInTheDocument();
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Review Value suggestion 1" }),
    { target: { value: "125" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  expect(screen.getByRole("spinbutton", { name: "Value row 1" })).toHaveValue(
    125,
  );
  expect(screen.getByRole("combobox", { name: "Metric row 1" })).toHaveValue(
    "operating_cash_flow",
  );
  expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining("Operating Cash Flow"),
  );
  expect(mocks.post).not.toHaveBeenCalled();
});
it("normalizes analysis monetary presentation without scaling ratios", async () => {
  const w = createBlankWorkspace("Scale Test");
  w.figures = [
    {
      company_id: w.company.id,
      metric: "revenue",
      period: "2025",
      value: 100,
      currency: "USD",
      unit_scale: 1000000,
      origin: "user-supplied",
      notes: "",
    },
  ];
  w.financialAnalysis = {
    analysis: [{ period: "2025", working_capital: 12, gross_margin: 0.25 }],
    quality_issues: [],
    formulas: {},
    input_hash: financialFingerprint(w.figures),
    created_at: "2026-01-01",
  };
  mocks.load.mockResolvedValue(w);
  render(
    <WorkspaceProvider>
      <FinancialsPage />
    </WorkspaceProvider>,
  );
  await screen.findByRole("heading", { name: "Historical Performance" });
  expect(screen.getAllByText("$12,000,000.00").length).toBe(1);
  expect(screen.getAllByText("25%").length).toBe(2);
  expect(
    screen.queryByRole("button", { name: "Add row" }),
  ).not.toBeInTheDocument();
  expect(mocks.post).not.toHaveBeenCalled();
});
it("labels sensitivity columns as WACC and rows as exit multiples", async () => {
  mocks.post.mockResolvedValue({
    models: {},
    history: {},
    forecast: [],
    errors: {},
    scenarios: {},
    sensitivities: {
      exit_multiple: { columns: [0.1], rows: [8], values: [[1234]] },
    },
  });
  render(
    <WorkspaceProvider>
      <ResultsPage />
    </WorkspaceProvider>,
  );
  const header = await screen.findByRole("columnheader", {
    name: "Exit Multiple / WACC",
  });
  const table = header.closest("table")!;
  expect(within(table).getByText("10%")).toBeInTheDocument();
  expect(within(table).getByText("8×")).toBeInTheDocument();
  expect(within(table).getByText("$1,234.00")).toBeInTheDocument();
});
