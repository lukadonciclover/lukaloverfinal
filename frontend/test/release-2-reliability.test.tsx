import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { vi } from "vitest";
import { createTestWorkspace } from "./fixtures";
import { WorkspaceProvider } from "@/lib/workspace";
import { ProjectSaveStatus } from "@/components/project-save-status";
import { DocumentUpload } from "@/components/document-upload";
import { apiUpload, saveBlob } from "@/lib/api";
const storage = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  loadIndexedWorkspace: storage.load,
  saveIndexedWorkspace: storage.save,
  deleteIndexedWorkspace: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ apiUpload: vi.fn(), saveBlob: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  storage.load.mockResolvedValue(createTestWorkspace());
  storage.save.mockReset().mockResolvedValue(undefined);
  vi.mocked(apiUpload).mockReset();
});
it("does not report saved before persistence succeeds, and allows a backup after save failure", async () => {
  vi.useFakeTimers();
  let reject: (e: unknown) => void = () => undefined;
  storage.save.mockReturnValue(
    new Promise((_, r) => {
      reject = r;
    }),
  );
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Quota exceeded", "QuotaExceededError");
  });
  const view = render(
    <WorkspaceProvider>
      <ProjectSaveStatus />
    </WorkspaceProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByText(/Saving ·/)).toBeInTheDocument();
  await act(async () => {
    vi.advanceTimersByTime(350);
  });
  expect(screen.queryByText(/Saved Locally/)).not.toBeInTheDocument();
  await act(async () => reject(new Error("IndexedDB unavailable")));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "recent changes are not saved",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Export Project Backup" }),
  );
  expect(saveBlob).toHaveBeenCalled();
  view.unmount();
  vi.useRealTimers();
});
it("distinguishes transfer from indeterminate extraction, and cancellation rejects late success", async () => {
  let finish: (value: unknown) => void = () => undefined;
  let extracted: (() => void) | undefined;
  vi.mocked(apiUpload).mockImplementation((_path, _form, opts) => {
    extracted = opts?.onUploaded;
    return new Promise((r) => {
      finish = r;
    });
  });
  render(
    <WorkspaceProvider>
      <DocumentUpload />
    </WorkspaceProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Upload financial documents"), {
    target: { files: [new File(["metric,2025\nRevenue,100"], "report.csv")] },
  });
  await screen.findByText("Uploading", { exact: true });
  await act(async () => extracted?.());
  expect(
    screen.getByRole("progressbar", { name: "Processing report.csv" }),
  ).not.toHaveAttribute("value");
  fireEvent.click(screen.getByRole("button", { name: "Cancel Queue" }));
  await act(async () =>
    finish({
      document: { identifier: "late", name: "report.csv" },
      chunks: [],
      suggestions: [],
    }),
  );
  await screen.findByText("Cancelled", { exact: true });
  expect(screen.queryByText("Processed Successfully")).not.toBeInTheDocument();
});
it("rejects unsupported files and continues the queue", async () => {
  vi.mocked(apiUpload).mockResolvedValue({
    document: {
      identifier: "csv",
      name: "valid.csv",
      document_type: "financial",
      reporting_period: "2025",
      pages: 1,
      warning: "",
      extraction_status: "complete",
      retained_by_server: false,
    },
    chunks: [],
    suggestions: [],
  });
  render(
    <WorkspaceProvider>
      <DocumentUpload />
    </WorkspaceProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Upload financial documents"), {
    target: {
      files: [
        new File(["bad"], "bad.exe"),
        new File(["metric,2025\nRevenue,100"], "valid.csv"),
      ],
    },
  });
  expect(
    await screen.findByText(/Unsupported file format/),
  ).toBeInTheDocument();
  await screen.findByText("Processed Successfully");
  expect(apiUpload).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Queue completion: 2 / 2")).toBeInTheDocument();
});
