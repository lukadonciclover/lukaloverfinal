import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";
import { createTestWorkspace } from "./fixtures";

const storage = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/storage", () => ({ loadIndexedWorkspace: storage.load, saveIndexedWorkspace: storage.save, deleteIndexedWorkspace: storage.remove }));

import { useProjectPortfolio, WorkspaceProvider } from "@/lib/workspace";

let capturedUpdate: ReturnType<typeof useProjectPortfolio>["updateWorkspace"] | null = null;

function ProjectHarness() {
  const context = useProjectPortfolio();
  const [message, setMessage] = useState("");
  return <div>
    <p>Active: {context.project?.name ?? "none"}</p>
    <p>Notes: {context.workspace?.company.analyst_notes || "none"}</p>
    <p>Projects: {context.projects.length}</p>
    <p>Archived: {context.projects.filter((project) => project.archived).length}</p>
    <button onClick={() => context.createProject("Alpha")}>Create Alpha</button>
    <button onClick={() => context.createProject("Beta")}>Create Beta</button>
    <button onClick={() => context.updateWorkspace((workspace) => ({ ...workspace, company: { ...workspace.company, analyst_notes: "alpha-only" } }))}>Set notes</button>
    <button onClick={() => { capturedUpdate = context.updateWorkspace; }}>Capture updater</button>
    <button onClick={() => capturedUpdate?.((workspace) => ({ ...workspace, company: { ...workspace.company, analyst_notes: "late-alpha" } }))}>Run captured updater</button>
    <button onClick={() => context.duplicateProject(context.activeProjectId)}>Duplicate</button>
    <button onClick={() => context.archiveProject(context.activeProjectId)}>Archive</button>
    <button onClick={() => context.importWorkspace(context.exportWorkspace())}>Round-trip import</button>
    {context.projects.filter((project) => !project.archived).map((project) => <button key={project.id} onClick={() => context.switchProject(project.id)}>Switch {project.name}</button>)}
    <button onClick={() => setMessage(context.exportWorkspace())}>Inspect export</button>
    <p>{message.includes("equitylens_project_version") ? "Project export" : ""}</p>
  </div>;
}

describe("multi-project portfolio", () => {
  beforeEach(() => {
    storage.load.mockResolvedValue(null);
    storage.save.mockResolvedValue(undefined);
    storage.remove.mockResolvedValue(undefined);
  });

  it("does not expose project mutations before saved projects hydrate", async () => {
    let resolveLoad: (value: unknown) => void = () => undefined;
    storage.load.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve; }));
    render(<WorkspaceProvider><ProjectHarness /></WorkspaceProvider>);
    expect(screen.getByText("Loading browser projects...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Alpha" })).not.toBeInTheDocument();
    await act(async () => resolveLoad(createTestWorkspace()));
    expect(await screen.findByRole("button", { name: "Create Alpha" })).toBeInTheDocument();
  });

  it("isolates projects and binds late updates to their originating project", async () => {
    render(<WorkspaceProvider><ProjectHarness /></WorkspaceProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Create Alpha" }));
    expect(screen.getByText("Active: Alpha")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Capture updater" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Beta" }));
    fireEvent.click(screen.getByRole("button", { name: "Run captured updater" }));
    expect(screen.getByText("Active: Beta")).toBeInTheDocument();
    expect(screen.getByText("Notes: none")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch Alpha" }));
    expect(screen.getByText("Notes: late-alpha")).toBeInTheDocument();
  });

  it("duplicates, archives, exports, and imports independent projects", async () => {
    render(<WorkspaceProvider><ProjectHarness /></WorkspaceProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Create Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByText("Projects: 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByText("Archived: 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspect export" }));
    expect(screen.getByText("Project export")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Round-trip import" }));
    expect(screen.getByText("Projects: 3")).toBeInTheDocument();
  });
});
