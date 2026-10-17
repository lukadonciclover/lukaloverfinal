import type { Section } from "@/components/app-shell";
import { DashboardPage } from "@/components/pages/dashboard";
import { WorkspacePage } from "@/components/pages/workspace";
import { FinancialsPage } from "@/components/pages/financials";
import { ValuationPage } from "@/components/pages/valuation";
import { AgentsPage } from "@/components/pages/agents";
import { ThesisPage } from "@/components/pages/thesis";
import { ChatPage } from "@/components/pages/chat";
import { ReportPage } from "@/components/pages/report";
import { PromptLabPage } from "@/components/pages/prompt-lab";
import { SettingsPage } from "@/components/pages/settings";

const pages: Record<Section, React.ComponentType> = {
  dashboard: DashboardPage,
  workspace: WorkspacePage,
  financials: FinancialsPage,
  valuation: ValuationPage,
  agents: AgentsPage,
  thesis: ThesisPage,
  chat: ChatPage,
  report: ReportPage,
  "prompt-lab": PromptLabPage,
  settings: SettingsPage
};

export function PageRouter({ section }: { section: Section }) {
  const Page = pages[section];
  return <Page />;
}
