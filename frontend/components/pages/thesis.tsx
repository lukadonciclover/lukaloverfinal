"use client";

import { useCallback, useEffect, useState } from "react";
import { apiPost } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Notice, PageHeader } from "@/components/ui";

type Thesis = Record<string, Array<{ classification: string; text: string }>>;

export function ThesisPage() {
  const { workspace, hydrated } = useWorkspace();
  const [thesis, setThesis] = useState<Thesis>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generate = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await apiPost<{ sections: Thesis }>("/v1/thesis", { company: workspace.company, figures: workspace.figures, valuation: workspace.dcfResult ?? {}, agent_outputs: Object.fromEntries(Object.entries(workspace.agentRuns).filter(([, run]) => run.valid).map(([name, run]) => [name, run.parsed_output])) });
      setThesis(response.sections);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Thesis generation failed."); }
    finally { setLoading(false); }
  }, [workspace]);
  useEffect(() => { if (hydrated) void generate(); }, [generate, hydrated]);
  return <><PageHeader kicker="Investment thesis" title="Separate facts from conviction." description="Each statement is labeled as sourced fact, deterministic calculation, analyst assumption, or reasoned interpretation." actions={<Button loading={loading} disabled={!hydrated} onClick={generate}>Refresh thesis</Button>}/>{!workspace.agentRuns["Investment Committee Critic"]?.valid && <Notice kind="warning">No validated committee critique is available. The recommendation remains Insufficient Evidence.</Notice>}{error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}<div className="mt-5 grid gap-4 lg:grid-cols-2">{Object.entries(thesis).map(([section, items], index) => <Card key={section} className={index === 0 || section === "Investment recommendation" ? "lg:col-span-2" : ""}><p className="text-[10px] font-bold tracking-[0.2em] text-gold">{String(index + 1).padStart(2, "0")}</p><h2 className="mt-2 text-lg font-semibold">{section}</h2><div className="mt-4 space-y-3">{items.length ? items.map((item, itemIndex) => <div key={itemIndex} className="border-l-2 border-line pl-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-teal">{item.classification}</p><p className="mt-1 text-sm leading-6 text-slate-300">{item.text}</p></div>) : <p className="text-sm text-mist">Insufficient verified information.</p>}</div></Card>)}</div></>;
}
