import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { WorkspaceProvider } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "EquityLens | Valuation Workbench",
  description: "Source-grounded financial analysis and reproducible valuation"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><WorkspaceProvider><AppShell>{children}</AppShell></WorkspaceProvider></body></html>;
}
