"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  Bot, Building2, Calculator, ChartNoAxesCombined, ChevronLeft, ChevronRight, FileOutput,
  Gauge, Menu, MessageSquareText, Search, Settings, ShieldCheck, Sparkles, X
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";

export const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/workspace", label: "Company Workspace", icon: Building2 },
  { href: "/financials", label: "Financial Analysis", icon: ChartNoAxesCombined },
  { href: "/valuation", label: "Valuation Lab", icon: Calculator },
  { href: "/research", label: "AI Research Agents", icon: Bot },
  { href: "/thesis", label: "Investment Thesis", icon: ShieldCheck },
  { href: "/chat", label: "Research Chat", icon: MessageSquareText },
  { href: "/report", label: "Investment Report", icon: FileOutput },
  { href: "/prompts", label: "Prompt Engineering Lab", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings }
] as const;

export type Section = "dashboard" | "workspace" | "financials" | "valuation" | "agents" | "thesis" | "chat" | "report" | "prompt-lab" | "settings";

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { workspace } = useWorkspace();
  const filtered = navigation.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));

  const sidebar = (
    <>
      <div className="flex h-20 items-center justify-between border-b border-line px-4">
        {!collapsed && <div><p className="text-lg font-black tracking-[0.16em] text-white">EQUITYLENS</p><p className="text-[10px] uppercase tracking-[0.18em] text-gold">Research terminal</p></div>}
        <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="text-mist lg:hidden"><X /></button>
      </div>
      {!collapsed && <div className="p-3"><label className="flex items-center gap-2 border border-line bg-ink px-3 py-2"><Search size={14} className="text-mist" /><input aria-label="Search navigation" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search modules" className="w-full bg-transparent text-xs outline-none placeholder:text-mist" /></label></div>}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Primary navigation">
        {filtered.map((item) => {
          const active = path === item.href || (path === "/" && item.href === "/dashboard");
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} title={collapsed ? item.label : undefined} className={clsx("flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition", active ? "border-gold bg-gold/10 text-white" : "border-transparent text-mist hover:bg-white/[0.03] hover:text-white")}><Icon size={17} />{!collapsed && <span>{item.label}</span>}</Link>;
        })}
      </nav>
      <div className="border-t border-line p-3">
        {!collapsed && <><p className="truncate text-xs font-semibold text-white">{workspace.company.name}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-teal">{workspace.settings.mode}</p>{workspace.company.is_synthetic && <p className="mt-2 inline-block border border-gold/50 px-2 py-1 text-[9px] font-bold tracking-widest text-gold">SYNTHETIC DATA</p>}</>}
        <button aria-label="Collapse sidebar" onClick={() => setCollapsed(!collapsed)} className="mt-3 hidden w-full items-center justify-center border border-line py-1.5 text-mist hover:text-white lg:flex">{collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen">
      <aside className={clsx("fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-panel transition-all lg:flex", collapsed ? "w-16" : "w-64")}>{sidebar}</aside>
      {mobileOpen && <div className="fixed inset-0 z-50 bg-black/70 lg:hidden" onClick={() => setMobileOpen(false)}><aside className="flex h-full w-72 flex-col border-r border-line bg-panel" onClick={(event) => event.stopPropagation()}>{sidebar}</aside></div>}
      <div className={clsx("transition-all", collapsed ? "lg:pl-16" : "lg:pl-64")}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-ink/90 px-4 backdrop-blur sm:px-6">
          <button aria-label="Open navigation" onClick={() => setMobileOpen(true)} className="text-mist lg:hidden"><Menu /></button>
          <div className="hidden items-center gap-2 text-xs text-mist sm:flex"><span className="h-2 w-2 rounded-full bg-teal" /> Stateless research workspace</div>
          <div className="flex items-center gap-3"><span className="hidden text-xs text-mist sm:inline">{workspace.company.currency} · {workspace.company.latest_financial_year}</span><span className="border border-line px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gold">{workspace.settings.mode}</span></div>
        </header>
        <main className="mx-auto max-w-[1560px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
