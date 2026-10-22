import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { vi } from "vitest";
import { ModelsPage } from "@/components/pages/workbench";
import { WorkspaceProvider, parseWorkspace } from "@/lib/workspace";
import { createBlankWorkspace } from "@/lib/demo";
import { payloadFor, settingsFor } from "@/lib/workbench";
import { apiPost } from "@/lib/api";

vi.mock("@/lib/storage", () => ({
  loadIndexedWorkspace: vi.fn().mockResolvedValue(null),
  saveIndexedWorkspace: vi.fn(),
  deleteIndexedWorkspace: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  apiPost: vi.fn(),
  apiUpload: vi.fn(),
  apiDownload: vi.fn(),
  saveBlob: vi.fn(),
}));

it("keeps models optional and preserves valuation settings in project imports", () => {
  const w = createBlankWorkspace("Test");
  expect(payloadFor(w).dcf).toBeNull();
  w.valuationWorkbench = settingsFor(w);
  w.valuationWorkbench.enabled.ddm = true;
  w.valuationWorkbench.ddm.dividend = 3;
  const imported = parseWorkspace(w, true);
  expect(payloadFor(imported).ddm?.dividend).toBe(3);
  expect(payloadFor(imported).dcf).toBeNull();
});

it("hides stale results immediately when assumptions change", async () => {
  const result = {
    currency: "USD",
    unit_scale: 1,
    history: {},
    forecast: [],
    models: { DDM: { per_share: 123.45 } },
    errors: {},
    scenarios: {},
    sensitivities: {},
  };
  vi.mocked(apiPost).mockResolvedValue(result);
  render(
    <WorkspaceProvider>
      <ModelsPage />
    </WorkspaceProvider>,
  );
  expect(await screen.findByText("123.45")).toBeInTheDocument();
  let resolve: (value: unknown) => void = () => undefined;
  vi.mocked(apiPost).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  fireEvent.change(screen.getByRole("spinbutton", { name: "cash" }), {
    target: { value: "25" },
  });
  expect(screen.queryByText("123.45")).not.toBeInTheDocument();
  await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2));
  await act(async () =>
    resolve({ ...result, models: { DDM: { per_share: 234.56 } } }),
  );
  expect(await screen.findByText("234.56")).toBeInTheDocument();
});
