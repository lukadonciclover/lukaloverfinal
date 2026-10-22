"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={clsx("panel p-4 sm:p-5", className)}>{children}</section>;
}

export function PageHeader({ title, description, actions }: { kicker?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-col justify-between gap-4 border-b border-line pb-4 lg:flex-row lg:items-end">
      <div>

        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-mist">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, detail, tone = "default" }: { label: string; value: ReactNode; detail?: string; tone?: "default" | "positive" | "warning" }) {
  return (
    <div className="panel min-h-28 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-mist">{label}</p>
      <p className={clsx("mt-3 text-2xl font-semibold tabular-nums", tone === "positive" && "text-teal", tone === "warning" && "text-gold")}>{value}</p>
      {detail && <p className="mt-1 text-xs text-mist">{detail}</p>}
    </div>
  );
}

export function Button({ children, className, variant = "primary", loading, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-sm border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "border-gold bg-gold text-[#111820] hover:bg-[#e1b65d]",
        variant === "secondary" && "border-line bg-[#11212c] text-slate-100 hover:border-teal",
        variant === "danger" && "border-red-900 bg-red-950/50 text-red-300 hover:bg-red-950",
        className
      )}
    >
      {loading && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block text-sm text-slate-200">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mist">{label}</span>
      <input {...props} className={clsx("field", props.className)} />
      {hint && <span className="mt-1 block text-xs text-mist">{hint}</span>}
    </label>
  );
}

export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-slate-200">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mist">{label}</span>
      <select {...props} className={clsx("field", props.className)}>{children}</select>
    </label>
  );
}

export function TextArea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block text-sm text-slate-200">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mist">{label}</span>
      <textarea {...props} className={clsx("field min-h-28 resize-y", props.className)} />
    </label>
  );
}

export function Notice({ children, kind = "info" }: { children: ReactNode; kind?: "info" | "warning" | "error" | "success" }) {
  return (
    <div role={kind === "error" ? "alert" : "status"} className={clsx(
      "border-l-2 px-4 py-3 text-sm",
      kind === "info" && "border-teal bg-teal/5 text-slate-300",
      kind === "warning" && "border-gold bg-gold/5 text-amber-100",
      kind === "error" && "border-red-500 bg-red-950/30 text-red-200",
      kind === "success" && "border-emerald-400 bg-emerald-950/20 text-emerald-200"
    )}>{children}</div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="border border-dashed border-line px-5 py-10 text-center"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-mist">{detail}</p></div>;
}

export function formatMoney(value: number | null | undefined, currency = "USD") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

export function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
}
