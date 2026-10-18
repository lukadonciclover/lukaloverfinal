import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { AppShell, navigation } from "@/components/app-shell";
import { WorkspaceProvider } from "@/lib/workspace";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/lib/storage", () => ({ loadIndexedWorkspace: () => new Promise(() => undefined), saveIndexedWorkspace: vi.fn() }));

describe("application navigation", () => {
  it("exposes all ten research modules", () => {
    render(<WorkspaceProvider><AppShell><div>Content</div></AppShell></WorkspaceProvider>);
    for (const item of navigation) expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
  });

  it("shows full navigation labels on mobile even after desktop collapse", () => {
    render(<WorkspaceProvider><AppShell><div>Content</div></AppShell></WorkspaceProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("textbox", { name: "Search navigation" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
  });
});
