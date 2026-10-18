import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { AppShell, navigation } from "@/components/app-shell";
import { WorkspaceProvider } from "@/lib/workspace";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/lib/storage", () => ({ loadIndexedWorkspace: vi.fn().mockResolvedValue(null), saveIndexedWorkspace: vi.fn(), deleteIndexedWorkspace: vi.fn() }));

describe("application navigation", () => {
  it("exposes all ten research modules", async () => {
    render(<WorkspaceProvider><AppShell><div>Content</div></AppShell></WorkspaceProvider>);
    await screen.findByText("Content");
    for (const item of navigation) expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
  });

  it("shows full navigation labels on mobile even after desktop collapse", async () => {
    render(<WorkspaceProvider><AppShell><div>Content</div></AppShell></WorkspaceProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Collapse sidebar" }));
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("textbox", { name: "Search navigation" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
  });
});
