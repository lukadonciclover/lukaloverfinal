import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { vi } from "vitest";
import { FinancialLedger } from "@/components/financial-ledger";
import { DocumentUpload } from "@/components/document-upload";
import { AssumptionShortcuts } from "@/components/assumption-shortcuts";
import { ModelsPage } from "@/components/pages/workbench";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { createBlankWorkspace } from "@/lib/defaults";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  upload: vi.fn(),
  post: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  loadIndexedWorkspace: mocks.load,
  saveIndexedWorkspace: mocks.save,
  deleteIndexedWorkspace: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  apiUpload: mocks.upload,
  apiPost: mocks.post,
  apiDownload: vi.fn(),
  saveBlob: vi.fn(),
}));
function fixture(count = 1, verified = true) {
  const w = createBlankWorkspace("Batch Test");
  w.documents = [
    {
      identifier: "doc",
      name: "Statement.csv",
      document_type: "Financial dataset",
      reporting_period: "",
      pages: 1,
      warning: "",
      extraction_status: "complete",
      retained_by_server: false,
      chunks: [],
      suggestions: Array.from({ length: count }, (_, i) => ({
        record_id: `r-${i}`,
        metric: "revenue",
        period: String(1900 + i),
        value: 100 + i,
        currency: "USD",
        unit_scale: 1,
        page: 1,
        quote: "Original source",
        confidence: 0.9,
        units_confirmed: verified,
        currency_confirmed: verified,
      })),
    },
  ];
  return w;
}
function Probe() {
  const { workspace, createProject } = useWorkspace();
  return (
    <>
      <p>Ledger count: {workspace.figures.length}</p>
      <p>First growth: {String(workspace.dcfInputs.revenue_growth[0])}</p>
      <p>Last growth: {String(workspace.dcfInputs.revenue_growth.at(-1))}</p>
      <button onClick={() => createProject("Other")}>
        Switch to new project
      </button>
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(fixture());
  mocks.save.mockResolvedValue(undefined);
  mocks.post.mockResolvedValue({
    models: {},
    history: {},
    forecast: [],
    errors: {},
    scenarios: {},
    sensitivities: {},
  });
});
it("selects across all pages, preserves filtering selections, cancels and approves over 100 records", async () => {
  mocks.load.mockResolvedValue(fixture(125));
  render(
    <WorkspaceProvider>
      <FinancialLedger />
      <Probe />
    </WorkspaceProvider>,
  );
  await screen.findByText(/125 pending records/);
  expect(
    screen.getAllByRole("checkbox", { name: /Select suggestion/ }),
  ).toHaveLength(25);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select suggestion r-0" }),
  );
  expect(
    screen.getByText(/125 pending records · 1 selected/),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select suggestion r-0" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Select All" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("checkbox", { name: "Select suggestion r-25" }),
  ).toBeChecked();
  fireEvent.change(screen.getByLabelText("Reporting year"), {
    target: { value: "1900" },
  });
  expect(
    screen.getAllByRole("checkbox", { name: /Select suggestion/ }),
  ).toHaveLength(1);
  expect(
    screen.getByText(/125 pending records · 125 selected/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Deselect All" }));
  expect(
    screen.getByText(/125 pending records · 0 selected/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Select All" }));
  fireEvent.click(screen.getByRole("button", { name: "Approve Selected" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Ledger count: 0")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Approve Selected" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Approve Eligible Records" }),
  );
  expect(screen.getByText("Ledger count: 125")).toBeInTheDocument();
  expect(screen.getByText(/0 pending records/)).toBeInTheDocument();
});
it("requires explicit shared-unit verification and never invents millions", async () => {
  mocks.load.mockResolvedValue(fixture(2, false));
  render(
    <WorkspaceProvider>
      <FinancialLedger />
      <Probe />
    </WorkspaceProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Approve All Eligible" }),
  );
  expect(
    screen.getByRole("button", { name: "Approve Eligible Records" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Select All" }));
  fireEvent.click(screen.getByRole("button", {name:"Confirm Units for Selected"}));
  fireEvent.click(screen.getByRole("button", {name:"Approve All Eligible"}));
  expect(screen.getByRole("button", {name:"Approve Eligible Records"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button", {name:"Cancel"}));
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Confirmed unit scale" }),
    { target: { value: "1000000" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm Units for Selected" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve All Eligible" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Approve Eligible Records" }),
  );
  expect(screen.getByText("Ledger count: 2")).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "Scale row 1" })).toHaveValue(
    1000000,
  );
});
it("clears selection on project switching", async () => {
  render(
    <WorkspaceProvider>
      <FinancialLedger />
      <Probe />
    </WorkspaceProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Select All" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Switch to new project" }),
  );
  expect(
    await screen.findByText(/0 pending records · 0 selected/),
  ).toBeInTheDocument();
});
it("previews paste and confirms bulk deletion; cancellation preserves ledger data", async () => {
  render(
    <WorkspaceProvider>
      <FinancialLedger />
      <Probe />
    </WorkspaceProvider>,
  );
  const paste = await screen.findByLabelText("Paste spreadsheet rows");
  fireEvent.change(paste, {
    target: { value: "revenue\t2025\t100\tUSD\t1\ncash\tbad\t\tUSD\t1" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save Valid Pasted Rows" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save Figures" }));
  expect(screen.getByText("Ledger count: 1")).toBeInTheDocument();
  expect(paste).toHaveValue("cash\tbad\t\tUSD\t1");
  fireEvent.click(
    screen.getByRole("button", { name: "Select All Ledger Rows" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete Selected" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Ledger count: 1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Delete Selected" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete Figures" }));
  expect(screen.getByText("Ledger count: 0")).toBeInTheDocument();
});
it("continues uploads after failure and retries failed files only", async () => {
  const doc = fixture().documents[0];
  mocks.upload
    .mockRejectedValueOnce(new Error("First file failed"))
    .mockResolvedValueOnce({
      document: { ...doc, identifier: "second" },
      chunks: [],
      suggestions: [],
    })
    .mockResolvedValueOnce({
      document: { ...doc, identifier: "first" },
      chunks: [],
      suggestions: [],
    });
  render(
    <WorkspaceProvider>
      <DocumentUpload />
    </WorkspaceProvider>,
  );
  const input = await screen.findByLabelText("Upload financial documents");
  fireEvent.change(input, {
    target: { files: [new File(["a"], "a.csv"), new File(["b"], "b.csv")] },
  });
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
  await screen.findByText("Processed");
  expect(screen.getByText("First file failed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry Failed Uploads" }));
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(screen.getAllByText("Processed")).toHaveLength(2));
});
it("applies annual assumptions, copies previous year and confirms resets", async () => {
  render(
    <WorkspaceProvider>
      <AssumptionShortcuts kind="dcf" />
      <Probe />
    </WorkspaceProvider>,
  );
  fireEvent.change(
    await screen.findByRole("spinbutton", { name: "Value across years" }),
    { target: { value: ".1" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Apply Value Across All Years" }),
  );
  expect(screen.getByText("Last growth: 0.1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Copy Previous Year" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Reset to Current Saved Assumptions" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("First growth: 0.1")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Reset to Current Saved Assumptions" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reset Assumptions" }));
  expect(screen.getByText("First growth: null")).toBeInTheDocument();
});
it("manages visible comparable selection independently of transactions", async () => {
  render(
    <WorkspaceProvider>
      <ModelsPage />
    </WorkspaceProvider>,
  );
  fireEvent.click(
    await screen.findByRole("tab", { name: "Trading comparables" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Add peer" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Company row 1" }), {
    target: { value: "Alpha" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add peer" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Company row 2" }), {
    target: { value: "Beta" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Deselect All" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Filter companies" }), {
    target: { value: "Alpha" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Select Visible" }));
  expect(screen.getByText("1 selected / 2 records")).toBeInTheDocument();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Bulk Remove Selected" }));
  expect(screen.getByText("0 selected / 1 records")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Precedent transactions" }));
  expect(screen.getByText("0 selected / 0 records")).toBeInTheDocument();
});
