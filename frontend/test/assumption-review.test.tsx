import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { vi } from "vitest";
import { AssumptionAnalysis } from "@/components/assumption-analysis";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { createBlankWorkspace } from "@/lib/defaults";
import { settingsFor } from "@/lib/workbench";
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
function Scope() {
  const { workspace, project, createProject } = useWorkspace();
  return (
    <>
      <output data-testid="growth">
        {settingsFor(workspace).forecast.growth ?? "unset"}
      </output>
      <button onClick={() => createProject("Another project")}>
        Switch to new project
      </button>
      <AssumptionAnalysis key={project.id} />
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  mocks.post.mockResolvedValue([]);
  mocks.save.mockResolvedValue(undefined);
  const w = createBlankWorkspace("Synthetic review");
  w.assumptions = [
    {
      id: "test-guidance",
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
      document_name: "Synthetic guidance.pdf",
      page: 1,
      excerpt: "Sensitive guidance text",
      confidence: 0.8,
      status: "pending",
      rationale: "",
    },
  ];
  mocks.load.mockResolvedValue(w);
});
it("requires a preview confirmation, persists adoption privately, and isolates the next project", async () => {
  render(
    <WorkspaceProvider>
      <Scope />
    </WorkspaceProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(screen.getByTestId("growth")).toHaveTextContent("unset");
  fireEvent.change(screen.getByLabelText("Application period / years"), {
    target: { value: "FY 2027 through FY 2031" },
  });
  fireEvent.change(screen.getByLabelText("Selection rationale / corrections"), {
    target: {
      value: "Reviewed annual guidance and selected all forecast years",
    },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(
    screen.getByRole("button", { name: "Preview this assumption" }),
  );
  expect(screen.getByTestId("growth")).toHaveTextContent("unset");
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
  );
  expect(screen.getByTestId("growth")).toHaveTextContent("unset");
  fireEvent.click(
    screen.getByRole("button", { name: "Preview selected assumptions" }),
  );
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Apply selected inputs",
    }),
  );
  expect(screen.getByTestId("growth")).toHaveTextContent("0.06");
  await waitFor(() =>
    expect(
      mocks.save.mock.lastCall?.[0].projects[0].workspace.assumptionAdoptions,
    ).toHaveLength(1),
  );
  const saved = mocks.save.mock.lastCall![0].projects[0].workspace;
  expect(saved.assumptionAdoptions[0].source.excerpt).toBe("");
  expect(saved.valuationWorkbench.enabled.forecast).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Switch to new project" }),
  );
  expect(screen.getByTestId("growth")).toHaveTextContent("unset");
  expect(screen.queryByText("Synthetic guidance.pdf")).not.toBeInTheDocument();
});
