"use client";
import Link from "next/link";
import { useWorkspace } from "@/lib/workspace";
import { useCalculationCache } from "@/lib/calculation-cache";
import { evaluateReadiness } from "@/lib/valuation-readiness";
import { settingsFor } from "@/lib/workbench";
import { formatFinancialLabel } from "@/lib/financial-formatting";
import { Card } from "./ui";
export function ValuationReadiness() {
  const { workspace: w, project, persistenceStatus } = useWorkspace();
  const cache = useCalculationCache();
  const stages = evaluateReadiness(w, cache.get(project.id));
  const next = stages.find(
    (s) => s.status !== "Complete" && s.status !== "Not Applicable",
  );
  const annual = w.figures
    .map((f) => f.period)
    .filter((p) => /^(19|20)\d{2}$/.test(p))
    .sort()
    .at(-1);
  return (
    <Card className="my-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Valuation Readiness</p>
          <h2>{w.company.name}</h2>
          <p className="mt-2 text-sm text-mist">
            {w.company.ticker || "No ticker"} · {w.company.currency} · Latest
            annual period: {annual ?? "Unavailable"}
          </p>
          <p className="mt-1 text-sm text-mist">
            Active methods:{" "}
            {Object.entries(settingsFor(w).enabled)
              .filter(([, v]) => v)
              .map(([k]) => formatFinancialLabel(k))
              .join(", ") || "None"}{" "}
            ·{" "}
            {persistenceStatus === "saved" || persistenceStatus === "local-only"
              ? "Saved Locally"
              : persistenceStatus === "error"
                ? "Save Failed"
                : "Saving"}
          </p>
        </div>
        {next && (
          <Link
            href={next.href}
            className="border border-teal px-4 py-2 text-sm text-teal"
          >
            Continue Working: {next.name}
          </Link>
        )}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {stages.map((s) => (
          <div key={s.name} className="border border-line p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h3>{s.name}</h3>
              <span
                className={
                  s.status === "Complete"
                    ? "text-sm text-teal"
                    : "text-sm text-gold"
                }
              >
                {s.status}
              </span>
            </div>
            <p className="my-3 text-sm text-mist">{s.explanation}</p>
            <Link href={s.href} className="text-sm text-teal underline">
              {s.action}
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}
