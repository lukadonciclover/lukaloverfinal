import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { AssumptionShortcuts } from "@/components/assumption-shortcuts";
import { ModelsPage } from "@/components/pages/workbench";
import { AppShell } from "@/components/app-shell";
import { createTestWorkspace } from "./fixtures";
import { sourcedWorkspace } from "./release-fixture";
import { WorkspacePage } from "@/components/pages/workspace";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  post: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/valuation", useRouter: () => ({push:vi.fn()}) }));
vi.mock("@/lib/storage", () => ({
  loadIndexedWorkspace: mocks.load,
  saveIndexedWorkspace: mocks.save,
  deleteIndexedWorkspace: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  apiPost: mocks.post,
  apiUpload: mocks.upload,
  apiDownload: vi.fn(),
  saveBlob: vi.fn(),
}));
function Probe() {
  const {
    workspace: w,
    project,
    projects,
    createProject,
    switchProject,
    updateWorkspace,
  } = useWorkspace();
  return (
    <>
      <output data-testid="state">
        {JSON.stringify({
          id: project.id,
          ledger: w.figures,
          dcf: w.dcfInputs,
          peers: w.valuationWorkbench?.peers,
        })}
      </output>
      <button onClick={() => createProject("Beta")}>Create Beta</button>
      <button onClick={() => switchProject(projects[0].id)}>
        Switch Alpha
      </button>
      <button
        onClick={() =>
          updateWorkspace((v) => ({
            ...v,
            dcfInputs: { ...v.dcfInputs, revenue_growth: [0.27, 0.27, 0.27] },
          }))
        }
      >
        Concurrent edit
      </button>
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  mocks.load.mockResolvedValue(createTestWorkspace());
  mocks.save.mockResolvedValue(undefined);
  mocks.post.mockResolvedValue({
    models: {},
    history: {},
    forecast: [],
    errors: {},
    scenarios: {},
    sensitivities: {},
  });
  mocks.upload.mockReset();
});
it("invalidates reset confirmations on revisions and remounts page-opening snapshots on project switches", async () => {
  render(
    <WorkspaceProvider>
      <Probe />
      <AppShell>
        <AssumptionShortcuts kind="dcf" />
      </AppShell>
    </WorkspaceProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Reset to Page-Opening Snapshot",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Concurrent edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset Assumptions" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/project changed/);
  expect(
    JSON.parse(screen.getByTestId("state").textContent!).dcf.revenue_growth[0],
  ).toBe(0.27);
  fireEvent.click(
    screen.getByRole("button", { name: "Reset to Page-Opening Snapshot" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Create Beta" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(JSON.parse(screen.getByTestId("state").textContent!).ledger).toEqual(
    [],
  );
  fireEvent.click(screen.getByRole("button", { name: "Concurrent edit" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Reset to Page-Opening Snapshot" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reset Assumptions" }));
  expect(
    JSON.parse(screen.getByTestId("state").textContent!).dcf.revenue_growth[0],
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Switch Alpha" }));
  expect(
    JSON.parse(screen.getByTestId("state").textContent!).dcf.revenue_growth[0],
  ).toBe(0.27);
});
it("cancels late peer imports across project switches and never applies their preview to the new project", async () => {
  let resolve!: (value: unknown) => void;
  mocks.upload.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(
    <WorkspaceProvider>
      <Probe />
      <AppShell>
        <ModelsPage />
      </AppShell>
    </WorkspaceProvider>,
  );
  fireEvent.click(
    await screen.findByRole("tab", { name: "Trading comparables" }),
  );
  fireEvent.change(screen.getByLabelText("Import CSV / XLSX"), {
    target: {
      files: [
        new File(["company,currency,unit_scale\nAcme,USD,1"], "peers.csv"),
      ],
    },
  });
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Create Beta" }));
  expect(mocks.upload.mock.calls[0][2].signal.aborted).toBe(true);
  await act(async () => resolve({ rows: [{ company: "Late Alpha Peer" }] }));
  expect(screen.queryByText("Import preview")).not.toBeInTheDocument();
  expect(screen.getByTestId("state")).not.toHaveTextContent("Late Alpha Peer");
});
it("cancelling a peer import preview leaves the dataset unchanged", async () => {
  mocks.upload.mockResolvedValue({
    rows: [
      {
        company: "New peer",
        selected: false,
        currency: "USD",
        unit_scale: 1,
        acquisition_date: "",
        market_cap: null,
        enterprise_value: null,
        cash: null,
        debt: null,
        revenue: null,
        ebitda: null,
        ebit: null,
        net_income: null,
        book_equity: null,
      },
    ],
  });
  render(
    <WorkspaceProvider>
      <Probe />
      <AppShell>
        <ModelsPage />
      </AppShell>
    </WorkspaceProvider>,
  );
  fireEvent.click(
    await screen.findByRole("tab", { name: "Trading comparables" }),
  );
  fireEvent.change(screen.getByLabelText("Import CSV / XLSX"), {
    target: { files: [new File(["data"], "peers.csv")] },
  });
  await screen.findByText("Import preview");
  fireEvent.click(screen.getByRole("tab", { name: "Precedent transactions" }));
  expect(screen.queryByText("Import preview")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Trading comparables" }));
  fireEvent.change(screen.getByLabelText("Import CSV / XLSX"), {
    target: { files: [new File(["data"], "peers.csv")] },
  });
  await screen.findByText("Import preview");
  fireEvent.click(screen.getByRole("button", { name: "Cancel Import" }));
  expect(
    JSON.parse(screen.getByTestId("state").textContent!).peers ?? [],
  ).toEqual([]);
});
it("previews source dependencies, cancellation preserves data, and removal flags retained inputs", async () => {
  mocks.load.mockResolvedValue(sourcedWorkspace());
  mocks.post.mockImplementation(async (path: string) =>
    path.includes("/assumptions/derive")
      ? []
      : {
          models: {},
          history: {},
          forecast: [],
          errors: {},
          scenarios: {},
          sensitivities: {},
        },
  );
  render(
    <WorkspaceProvider>
      <Probe />
      <AppShell>
        <WorkspacePage />
      </AppShell>
    </WorkspaceProvider>,
  );
  fireEvent.click(await screen.findByRole("link", { name: "Upload Documents" }));
  const remove = await screen.findByRole("button", {
    name: "Remove Synthetic report and derived data",
  });
  fireEvent.click(remove);
  expect(screen.getByRole("dialog")).toHaveTextContent(
    /15 historical references/,
  );
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
  );
  expect(
    screen.getByRole("button", {
      name: "Remove Synthetic report and derived data",
    }),
  ).toBeInTheDocument();
  fireEvent.click(remove);
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Source and Flag Dependencies" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", {
        name: "Remove Synthetic report and derived data",
      }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", {
      name: "Remove Unrelated report and derived data",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getAllByText(/Source document removed - assumption requires review/)
      .length,
  ).toBeGreaterThan(0);
  expect(
    JSON.parse(screen.getByTestId("state").textContent!).dcf.base_revenue,
  ).toBe(100);
  fireEvent.click(
    screen.getAllByRole("button", {
      name: "Keep as Reviewed Analyst Assumption",
    })[0],
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm Resolution" }));
});
