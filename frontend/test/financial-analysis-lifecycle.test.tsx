import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { vi } from "vitest";
import { FinancialsPage } from "@/components/pages/financials";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { createTestWorkspace } from "./fixtures";
import { financialFingerprint } from "@/lib/fingerprint";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  post: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  loadIndexedWorkspace: mocks.load,
  saveIndexedWorkspace: mocks.save,
  deleteIndexedWorkspace: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ apiPost: mocks.post }));
vi.mock("@/components/financial-chart", () => ({
  FinancialLineChart: () => null,
}));
function result(value = 0.1) {
  return {
    analysis: [
      {
        period: "2025",
        revenue_growth: value,
        return_on_invested_capital: null,
      },
    ],
    quality_issues: [],
    formulas: {},
    unavailable_reasons: {
      "2025": {
        return_on_invested_capital:
          "Missing approved tax expense and invested-capital inputs.",
      },
    },
  };
}
function Probe() {
  const { workspace, updateWorkspace, createProject } = useWorkspace();
  return (
    <>
      <button
        onClick={() =>
          updateWorkspace((w) => ({
            ...w,
            figures: w.figures.map((f) => ({ ...f, value: 110 })),
          }))
        }
      >
        Change approved data
      </button>
      <button onClick={() => createProject("Second project")}>
        Switch project
      </button>
      <output data-testid="snapshot">
        {workspace.financialAnalysis
          ? JSON.stringify(workspace.financialAnalysis)
          : "none"}
      </output>
    </>
  );
}
function mount() {
  return render(
    <WorkspaceProvider>
      <Probe />
      <FinancialsPage />
    </WorkspaceProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  mocks.load.mockResolvedValue(createTestWorkspace());
  mocks.save.mockResolvedValue(undefined);
  mocks.post.mockReset();
});
it("sends manual requests, shows loading and completion, and confirms unchanged recalculation", async () => {
  let resolve!: (value: unknown) => void;
  mocks.post.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Calculate Performance" }),
  );
  expect(screen.getByRole("button", { name: "Calculating..." })).toBeDisabled();
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(mocks.post.mock.calls[0][0]).toBe("/v1/financials/analyze");
  expect(mocks.post.mock.calls[0][1].figures[0].record_id).toBeUndefined();
  await act(async () => resolve(result()));
  expect(
    screen.getByText("Financial analysis updated successfully."),
  ).toBeInTheDocument();
  expect(screen.getByText(/Latest successful calculation/)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Review Forecast Assumptions" }),
  ).toHaveAttribute("href", "/forecasting");
  fireEvent.click(
    screen.getByRole("button", { name: "Recalculate Performance" }),
  );
  await act(async () => resolve(result()));
  expect(
    screen.getByText("Financial analysis updated successfully."),
  ).toBeInTheDocument();
  expect(screen.getByText("Analysis is up to date")).toBeInTheDocument();
  expect(mocks.post).toHaveBeenCalledTimes(2);
});
it("manual calculation takes priority over the scheduled automatic request and does not loop", async () => {
  let resolve!: (value: unknown) => void;
  mocks.post.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Calculate Performance" }),
  );
  const signal = mocks.post.mock.calls[0][2].signal;
  await act(async () => {
    await new Promise((done) => setTimeout(done, 450));
  });
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(signal.aborted).toBe(false);
  await act(async () => resolve(result()));
  await act(async () => {
    await new Promise((done) => setTimeout(done, 450));
  });
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(signal.aborted).toBe(false);
});
it("calculates automatically once when valid data is not current", async () => {
  mocks.post.mockResolvedValue(result());
  mount();
  await screen.findByText("Financial analysis updated successfully.");
  expect(mocks.post).toHaveBeenCalledTimes(1);
});
it("preserves prior results and provides an actionable retry after failure", async () => {
  const w = createTestWorkspace();
  w.financialAnalysis = {
    ...result(),
    input_hash: financialFingerprint(w.figures),
    created_at: "2026-01-01T00:00:00Z",
    unit_scale: 1,
    currency: "USD",
  };
  mocks.load.mockResolvedValue(w);
  mocks.post.mockRejectedValue(new Error("The Python backend is unavailable."));
  mount();
  expect(await screen.findByText("Analysis is up to date")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Recalculate Performance" }),
  );
  await screen.findByText(/The Python backend is unavailable.*retry/);
  expect(screen.getByTestId("snapshot")).toHaveTextContent(
    '"revenue_growth":0.1',
  );
  expect(
    screen.getByRole("button", { name: "Recalculate Performance" }),
  ).toBeEnabled();
  expect(
    screen.getByText(
      "Missing approved tax expense and invested-capital inputs.",
    ),
  ).toBeInTheDocument();
});
it("rejects late old-data responses even if transport ignores cancellation", async () => {
  const resolves: Array<(v: unknown) => void> = [];
  mocks.post.mockImplementation(
    () => new Promise((resolve) => resolves.push(resolve)),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Calculate Performance" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Change approved data" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Calculate Performance" }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Calculate Performance" }),
  );
  await act(async () => resolves[1](result(0.2)));
  await act(async () => resolves[0](result(0.8)));
  expect(screen.getByTestId("snapshot")).toHaveTextContent(
    '"revenue_growth":0.2',
  );
  expect(screen.getByTestId("snapshot")).not.toHaveTextContent(
    '"revenue_growth":0.8',
  );
});
it("aborts on project switch and never saves the previous company's response", async () => {
  let resolve!: (v: unknown) => void;
  mocks.post.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Calculate Performance" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
  await act(async () => resolve(result(0.9)));
  expect(screen.getByTestId("snapshot")).toHaveTextContent("none");
  expect(
    screen.queryByRole("button", { name: "Calculating..." }),
  ).not.toBeInTheDocument();
  expect(mocks.post.mock.calls[0][2].signal.aborted).toBe(true);
});
it("labels old results stale after approved data changes", async () => {
  const w = createTestWorkspace();
  w.financialAnalysis = {
    ...result(),
    input_hash: financialFingerprint(w.figures),
    created_at: "2026-01-01T00:00:00Z",
    unit_scale: 1,
    currency: "USD",
  };
  mocks.load.mockResolvedValue(w);
  mocks.post.mockImplementation(() => new Promise(() => {}));
  mount();
  await screen.findByText("Analysis is up to date");
  fireEvent.click(screen.getByRole("button", { name: "Change approved data" }));
  expect(
    screen.getByText(/Previously calculated results are stale/),
  ).toBeInTheDocument();
  expect(screen.getByTestId("snapshot")).toHaveTextContent(
    '"revenue_growth":0.1',
  );
});
