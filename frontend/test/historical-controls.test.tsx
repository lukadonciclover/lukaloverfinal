import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { vi } from "vitest";
import { ForecastingPage } from "@/components/pages/workbench";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { historicalFixture } from "./historical-fixture";
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
vi.mock("@/lib/api", () => ({
  apiPost: mocks.post,
  apiUpload: vi.fn(),
  apiDownload: vi.fn(),
  saveBlob: vi.fn(),
}));
function Probe() {
  const { workspace, createProject, updateWorkspace } = useWorkspace();
  return (
    <>
      <output data-testid="workspace">
        {JSON.stringify(workspace.valuationWorkbench?.forecast)}
      </output>
      <button onClick={() => createProject("New company")}>New project</button>
      <button
        onClick={() =>
          updateWorkspace((w) => ({
            ...w,
            figures: w.figures.map((f, i) =>
              i === 0 ? { ...f, value: 200 } : f,
            ),
          }))
        }
      >
        Update historical data
      </button>
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  mocks.load.mockResolvedValue(historicalFixture());
  mocks.save.mockResolvedValue(undefined);
  mocks.post.mockImplementation(async (path: string) =>
    path.includes("historical-averages")
      ? historicalFixture().historicalReferences
      : {
          models: {},
          history: {},
          forecast: [],
          errors: {},
          scenarios: {},
          sensitivities: {},
        },
  );
});
it("automatically fills editable fields, marks manual edits and preserves them across a project reload", async () => {
  const view = render(
    <WorkspaceProvider>
      <Probe />
      <ForecastingPage />
    </WorkspaceProvider>,
  );
  const growth = await screen.findByRole("spinbutton", { name: "Growth Rate" });
  await waitFor(() => expect(growth).toHaveValue(10));
  expect(growth).toHaveAccessibleDescription(/10%.*Historical average/);
  fireEvent.change(growth, { target: { value: "12.3" } });
  expect(
    screen.getByRole("spinbutton", { name: "Growth Rate" }),
  ).toHaveAccessibleDescription(/Analyst Assumption.*User-modified/);
  fireEvent.click(screen.getByRole("button", { name: "Fill Empty Fields" }));
  expect(growth).toHaveValue(12.3);
  await waitFor(() =>
    expect(
      mocks.save.mock.lastCall?.[0].projects[0].workspace.valuationWorkbench
        .forecast.growth,
    ).toBeCloseTo(0.123),
  );
  const saved = mocks.save.mock.lastCall![0];
  view.unmount();
  mocks.load.mockResolvedValue(saved);
  render(
    <WorkspaceProvider>
      <Probe />
      <ForecastingPage />
    </WorkspaceProvider>,
  );
  expect(
    await screen.findByRole("spinbutton", { name: "Growth Rate" }),
  ).toHaveValue(12.3);
  expect(
    screen.getByRole("spinbutton", { name: "Growth Rate" }),
  ).toHaveAccessibleDescription(/Analyst Assumption.*User-modified/);
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  await waitFor(() =>
    expect(screen.getByRole("spinbutton", { name: "Growth Rate" })).toHaveValue(
      null,
    ),
  );
});
it("restores only one reviewed field after confirmation, and marks changed history stale", async () => {
  render(
    <WorkspaceProvider>
      <Probe />
      <ForecastingPage />
    </WorkspaceProvider>,
  );
  const growth = await screen.findByRole("spinbutton", { name: "Growth Rate" });
  await waitFor(() => expect(growth).toHaveValue(10));
  fireEvent.change(growth, { target: { value: "20" } });
  const capex = screen.getByRole("spinbutton", {
    name: "Capital Expenditure / Revenue",
  });
  fireEvent.change(capex, { target: { value: "9" } });
  fireEvent.click(screen.getByText("Review Historical Averages"));
  const row = screen
    .getByText("FORECAST / growth: 0.2")
    .closest("div")!.parentElement!;
  fireEvent.click(
    within(row).getByRole("button", { name: "Restore Historical Average" }),
  );
  expect(growth).toHaveValue(20);
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Restore this input",
    }),
  );
  expect(growth).toHaveValue(10);
  expect(capex).toHaveValue(9);
  fireEvent.click(
    screen.getByRole("button", { name: "Update historical data" }),
  );
  expect(
    screen.getByText(/Historical references are stale/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Fill Empty Fields" }),
  ).toBeDisabled();
  expect(growth).toHaveValue(10);
  expect(capex).toHaveValue(9);
});
