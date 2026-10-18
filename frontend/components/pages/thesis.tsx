"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import { currentAgentOutputs, currentDcfResult, isAgentRunStale, thesisFingerprint } from "@/lib/research";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Notice, PageHeader } from "@/components/ui";

type Thesis = Record<string, Array<{ classification: string; text: string }>>;

export function ThesisPage() {
  const { workspace, hydrated, updateWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const agentOutputs = useMemo(() => currentAgentOutputs(workspace), [workspace]);
  const inputHash = thesisFingerprint(workspace);
  const currentHashRef = useRef(inputHash);
  currentHashRef.current = inputHash;
  const snapshotCurrent = workspace.thesis?.input_hash === inputHash;
  const thesis = snapshotCurrent ? workspace.thesis?.sections ?? {} : {};

  const generate = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestedHash = inputHash;
    setLoading(true); setError("");
    try {
      const response = await apiPost<{ sections: Thesis }>("/v1/thesis", { company: workspace.company, figures: workspace.figures, valuation: currentDcfResult(workspace) ?? {}, agent_outputs: agentOutputs }, { signal: controller.signal });
      if (requestedHash === currentHashRef.current) updateWorkspace((current) => thesisFingerprint(current) === requestedHash ? { ...current, thesis: { sections: response.sections, input_hash: requestedHash, created_at: new Date().toISOString() } } : current);
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Thesis generation failed."); }
    finally { if (controllerRef.current === controller) setLoading(false); }
  }, [agentOutputs, inputHash, updateWorkspace, workspace]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const critic = workspace.agentRuns["Investment Committee Critic"];
  return <>
    <PageHeader kicker="Investment thesis" title="Separate facts from conviction." description="Each statement is generated from one current company snapshot and labeled as metadata, ledger data, calculation, assumption, or agent interpretation." actions={<Button loading={loading} disabled={!hydrated} onClick={generate}>Refresh thesis</Button>}/>
    {(!critic?.valid || isAgentRunStale(critic, workspace)) && <Notice kind="warning">No current committee critique is available. The recommendation remains Insufficient Evidence.</Notice>}
    {!snapshotCurrent && workspace.thesis && <div className="mt-3"><Notice kind="warning">The saved thesis is stale and hidden while a current recommendation is generated.</Notice></div>}
    {error && <div className="mt-4"><Notice kind="error">{error} Stale thesis text is not displayed.</Notice></div>}
    {!snapshotCurrent && !loading && <div className="mt-5"><Notice kind="info">Select Refresh thesis to create the final recommendation from the current snapshot.</Notice></div>}
    {loading && Object.keys(thesis).length === 0 && <div className="mt-5"><Notice kind="info">Building deterministic thesis sections.</Notice></div>}
    <div className="mt-5 grid gap-4 lg:grid-cols-2">{Object.entries(thesis).map(([section, items], index) => <Card key={section} className={index === 0 || section === "Investment recommendation" ? "lg:col-span-2" : ""}><p className="text-[10px] font-bold tracking-[0.2em] text-gold">{String(index + 1).padStart(2, "0")}</p><h2 className="mt-2 text-lg font-semibold">{section}</h2><div className="mt-4 space-y-3">{items.length ? items.map((item, itemIndex) => <div key={itemIndex} className="border-l-2 border-line pl-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-teal">{item.classification}</p><p className="mt-1 text-sm leading-6 text-slate-300">{item.text}</p></div>) : <p className="text-sm text-mist">Insufficient verified information.</p>}</div></Card>)}</div>
  </>;
}
