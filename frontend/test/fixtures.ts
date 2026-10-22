import { createBlankWorkspace } from "@/lib/defaults";

export function createTestWorkspace() {
  const workspace = createBlankWorkspace("Test Company");
  workspace.figures = [{
    company_id: workspace.company.id, metric: "revenue", period: "2025",
    value: 100, currency: "USD", unit_scale: 1, origin: "reported", notes: "",
    source: {document_name: "Test report", quote: "Revenue 100", reporting_period: "2025", currency: "USD", unit_scale: 1, confidence: 1}
  }];
  return workspace;
}
