import { render, screen } from "@testing-library/react";
import { AgentsPage } from "@/components/pages/agents";
import { WorkspaceProvider } from "@/lib/workspace";

describe("manual AI workflow", () => {
  it("does not represent a manual prompt as an automatic model call", async () => {
    render(<WorkspaceProvider><AgentsPage /></WorkspaceProvider>);
    expect(await screen.findByText(/has not contacted ChatGPT/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Prepare grounded prompt/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Validate and save/i })).toBeDisabled();
  });
});
