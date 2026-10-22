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
  const Page = pages[section];
  return <Page />;
}
