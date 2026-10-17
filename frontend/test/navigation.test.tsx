import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { AppShell, navigation } from "@/components/app-shell";
import { WorkspaceProvider } from "@/lib/workspace";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("application navigation", () => {
  it("exposes all ten research modules", () => {
    render(<WorkspaceProvider><AppShell><div>Content</div></AppShell></WorkspaceProvider>);
    for (const item of navigation) expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
  });
});
