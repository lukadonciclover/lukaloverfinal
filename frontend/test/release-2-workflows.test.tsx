import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { historicalFixture } from "./historical-fixture";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { ModelsPage } from "@/components/pages/workbench";
import { loadIndexedWorkspace } from "@/lib/storage";
import { WorkspacePage } from "@/components/pages/workspace";
import { UnifiedAssumptionReview } from "@/components/unified-assumption-review";
import { useModel } from "@/lib/use-model";
import { apiPost } from "@/lib/api";
import { useState } from "react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/storage", () => ({
  loadIndexedWorkspace: vi
    .fn()
    .mockImplementation(async () => historicalFixture()),
  saveIndexedWorkspace: vi.fn().mockResolvedValue(undefined),
  deleteIndexedWorkspace: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  apiPost: vi.fn().mockResolvedValue([]),
  apiUpload: vi.fn(),
  apiDownload: vi.fn(),
  saveBlob: vi.fn(),
}));
function Probe() {
  const { workspace: w } = useWorkspace();
  return (
    <output data-testid="growth">
      {String(w.valuationWorkbench?.forecast.growth ?? "empty")}
    </output>
  );
}
it("navigates data tabs and retains company fields with rename forms", async () => {
  location.hash = "company";
  render(
    <WorkspaceProvider>
      <WorkspacePage />
    </WorkspaceProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Company name"), {
    target: { value: "Edited Company" },
  });
  fireEvent.click(screen.getByRole("link", { name: "Upload Documents" }));
  expect(screen.getByLabelText("Upload financial documents")).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "Company Information" }));
  expect(screen.getByLabelText("Company name")).toHaveValue("Edited Company");
  fireEvent.click(screen.getByText(/Project Actions/));
  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  expect(screen.getByRole("form", { name: "Rename project" })).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "Assumption Analysis" }));
  expect(
    screen.getByRole("heading", { name: "Unified Assumption Review" }),
  ).toBeVisible();
});
it("previews selected assumption replacement and applies it through the existing adoption engine", async () => {
  render(
    <WorkspaceProvider>
      <UnifiedAssumptionReview />
      <Probe />
    </WorkspaceProvider>,
  );
  fireEvent.click(await screen.findByLabelText("Select forecast.growth"));
  fireEvent.click(
    screen.getByRole("button", { name: "Apply Selected Historical Averages" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent("Current → proposed values");
  expect(screen.getByTestId("growth")).toHaveTextContent("empty");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm Assumptions" }),
  );
  expect(screen.getByTestId("growth")).toHaveTextContent("0.1");
});
function CalculationHarness() {
  const [mode, setMode] = useState<"core" | "extended">("core");
  const model = useModel(mode);
  const { updateWorkspace } = useWorkspace();
  return (
    <>
      <p>{model.loading ? "Loading" : "Idle"}</p>
      <button
        onClick={() =>
          updateWorkspace((w) => ({
            ...w,
            company: { ...w.company, analyst_notes: "UI notes" },
          }))
        }
      >
        Edit Notes
      </button>
      <button
        onClick={() => model.update((s) => ({ ...s, cash: (s.cash ?? 0) + 1 }))}
      >
        Edit Cash
      </button>
      <button onClick={() => setMode("extended")}>Extended</button>
      <button onClick={() => setMode("core")}>Core</button>
    </>
  );
}
it("debounces rapid financial edits, ignores unrelated notes, and reuses extended results for core pages", async () => {
  vi.useFakeTimers();
  vi.mocked(apiPost).mockReset().mockResolvedValue({
    currency: "USD",
    unit_scale: 1,
    history: {},
    forecast: [],
    models: {},
    errors: {},
    scenarios: {},
    sensitivities: {},
  });
  const view = render(
    <WorkspaceProvider>
      <CalculationHarness />
    </WorkspaceProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  for (let i = 0; i < 4; i++) {
    fireEvent.click(screen.getByText("Edit Cash"));
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
  }
  expect(apiPost).not.toHaveBeenCalled();
  await act(async () => {
    vi.advanceTimersByTime(350);
  });
  expect(apiPost).toHaveBeenCalledTimes(1);
  expect(vi.mocked(apiPost).mock.calls[0][0]).toContain("mode=core");
  fireEvent.click(screen.getByText("Edit Notes"));
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  expect(apiPost).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Extended"));
  await act(async () => {
    vi.advanceTimersByTime(350);
  });
  expect(apiPost).toHaveBeenCalledTimes(2);
  expect(vi.mocked(apiPost).mock.calls[1][0]).toContain("mode=extended");
  fireEvent.click(screen.getByText("Core"));
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  expect(apiPost).toHaveBeenCalledTimes(2);
  view.unmount();
  vi.useRealTimers();
});

it("opens model-specific readiness deep links", async () => {
  location.hash = "ddm";
  const view = render(
    <WorkspaceProvider>
      <ModelsPage />
    </WorkspaceProvider>,
  );
  await screen.findByRole("tab", { name: "Dividend discount" });
  await waitFor(() => expect(screen.getByRole("tab", { name: "Dividend discount" })).toHaveAttribute("aria-selected", "true"));
  expect(
    screen.getByRole("spinbutton", { name: "Dividend Per Share" }),
  ).toBeInTheDocument();
  view.unmount();
  location.hash = "";
});
it("keeps reviewed guidance ranges out of automatic point adoption", async () => {
  const w = historicalFixture();
  w.assumptions = [
    {
      ...w.historicalReferences!.averages[0].source,
      id: "range",
      classification: "management guidance",
      status: "accepted",
      value: null,
      minimum: 0.05,
      maximum: 0.07,
      document_name: "Reviewed guidance",
    },
  ];
  vi.mocked(loadIndexedWorkspace).mockResolvedValueOnce(w);
  render(
    <WorkspaceProvider>
      <UnifiedAssumptionReview />
      <Probe />
    </WorkspaceProvider>,
  );
  expect((await screen.findAllByText(/5% to 7%/)).length).toBeGreaterThan(0);
  for (const button of screen.getAllByRole("button", {
    name: "Use Reviewed Guidance",
  }))
    expect(button).toBeDisabled();
  expect(screen.getByTestId("growth")).toHaveTextContent("empty");
});
