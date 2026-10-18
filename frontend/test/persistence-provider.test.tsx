import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { createDemoWorkspace } from "@/lib/demo";

const storage = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));

vi.mock("@/lib/storage", () => ({
  loadIndexedWorkspace: storage.load,
  saveIndexedWorkspace: storage.save,
  deleteIndexedWorkspace: vi.fn()
}));

import { useWorkspace, WorkspaceProvider } from "@/lib/workspace";

function PersistenceProbe() {
  const { persistenceMessage } = useWorkspace();
  return <p>{persistenceMessage}</p>;
}

describe("workspace hydration failure", () => {
  it("preserves malformed saved data instead of overwriting it with demo state", async () => {
    const malformed = createDemoWorkspace();
    malformed.figures[0].unit_scale = 0;
    storage.load.mockResolvedValue(malformed);
    storage.save.mockResolvedValue(undefined);

    render(<WorkspaceProvider><PersistenceProbe /></WorkspaceProvider>);

    expect(await screen.findByText(/saved projects were preserved but not loaded/i)).toBeInTheDocument();
    await waitFor(() => expect(storage.save).not.toHaveBeenCalled());
  });
});
