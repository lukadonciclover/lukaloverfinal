"use client";
import { useProjectPortfolio } from "@/lib/workspace";
import { EmptyWorkspace } from "@/components/empty-workspace";
import type { Section } from "@/components/app-shell";
import { WorkspacePage } from "@/components/pages/workspace";
import { FinancialsPage } from "@/components/pages/financials";
import {
  ForecastingPage,
  ModelsPage,
  ResultsPage,
  ValuationDashboard,
} from "@/components/pages/workbench";
const pages: Record<Section, React.ComponentType> = {
  dashboard: ValuationDashboard,
  workspace: WorkspacePage,
  financials: FinancialsPage,
  forecasting: ForecastingPage,
  valuation: ModelsPage,
  report: ResultsPage,
};
export function PageRouter({ section }: { section: Section }) {
  const { project } = useProjectPortfolio();
  if (!project) return <EmptyWorkspace />;
  const Page = pages[section];
  return <Page />;
}
