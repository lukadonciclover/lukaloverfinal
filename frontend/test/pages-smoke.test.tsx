import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { AgentsPage } from "@/components/pages/agents";
import { ChatPage } from "@/components/pages/chat";
import { DashboardPage } from "@/components/pages/dashboard";
import { FinancialsPage } from "@/components/pages/financials";
import { PromptLabPage } from "@/components/pages/prompt-lab";
import { ReportPage } from "@/components/pages/report";
import { SettingsPage } from "@/components/pages/settings";
import { ThesisPage } from "@/components/pages/thesis";
import { ValuationPage } from "@/components/pages/valuation";
import { WorkspacePage } from "@/components/pages/workspace";
import { WorkspaceProvider } from "@/lib/workspace";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiGet: vi.fn().mockResolvedValue({
      version: "test-v1",
      strategies: ["Zero-shot prompting"],
      tasks: { "Calculate revenue growth": { version: "test-v1", context: "Synthetic context", expected_values: [], required_terms: [], required_source_ids: [] } }
    }),
    apiPost: vi.fn(),
    apiUpload: vi.fn(),
    apiDownload: vi.fn()
  };
});

const pages = [
  [DashboardPage, "Decision-grade analysis, with receipts."],
  [WorkspacePage, "Define the research perimeter."],
  [FinancialsPage, "Audit the history before forecasting it."],
  [ValuationPage, "Make the assumptions visible."],
  [AgentsPage, "Five mandates. One evidence standard."],
  [ThesisPage, "Separate facts from conviction."],
  [ChatPage, "Ask the documents, not the void."],
  [ReportPage, "One model. Three accountable exports."],
  [PromptLabPage, "Compare methods, not anecdotes."],
  [SettingsPage, "Control data retention and execution."]
] as const;

describe("all research pages", () => {
  it.each(pages)("renders %s", async (Page, heading) => {
    render(<WorkspaceProvider><Page /></WorkspaceProvider>);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });
});
