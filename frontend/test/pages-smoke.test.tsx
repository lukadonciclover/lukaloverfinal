import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ValuationDashboard, ForecastingPage, ModelsPage, ResultsPage } from "@/components/pages/workbench";
import { FinancialsPage } from "@/components/pages/financials";
import { WorkspacePage } from "@/components/pages/workspace";
import { WorkspaceProvider } from "@/lib/workspace";
vi.mock("@/lib/storage", () => ({ loadIndexedWorkspace: vi.fn().mockResolvedValue(null), saveIndexedWorkspace: vi.fn(), deleteIndexedWorkspace: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiPost: vi.fn().mockResolvedValue({models:{},history:{},forecast:[],errors:{},scenarios:{},sensitivities:{},analysis:[],quality_issues:[],formulas:{}}),apiUpload:vi.fn(),apiDownload:vi.fn(),saveBlob:vi.fn() }));
const pages = [
  [ValuationDashboard,"Financial valuation workbench"], [WorkspacePage,"Financial data & projects."],
  [FinancialsPage,"Audit the history before forecasting it."], [ForecastingPage,"Build the operating forecast"],
  [ModelsPage,"Choose a method. Define the assumptions."], [ResultsPage,"Review the valuation"]
] as const;
describe("valuation pages",()=>{it.each(pages)("renders page %#",async(Page,title)=>{
 render(<WorkspaceProvider><Page/></WorkspaceProvider>);
 expect(await screen.findByRole("heading",{level:1,name:title})).toBeInTheDocument();
});});
