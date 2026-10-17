"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clipboard, Play, ShieldAlert } from "lucide-react";
import { apiPost } from "@/lib/api";
import type { AgentRun, EvidenceChunk } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Notice, PageHeader, Select, TextArea } from "@/components/ui";

const agents = ["Financial Analyst", "Valuation Analyst", "Risk Analyst", "Investment Committee Critic"] as const;
type AgentName = typeof agents[number];
type PromptResponse = { prompt: string; schema: Record<string, unknown> };
type ValidationResponse = { valid: boolean; parsed_output: Record<string, unknown> | null; errors: string[]; provenance: string };

function financialsByPeriod(figures: ReturnType<typeof useWorkspace>["workspace"]["figures"]) {
  const result: Record<string, Record<string, number | null>> = {};
  for (const figure of figures) result[figure.period] = { ...result[figure.period], [figure.metric]: figure.value };
  return result;
}

export function AgentsPage() {
  const { workspace, updateWorkspace } = useWorkspace();
  const [selected, setSelected] = useState<AgentName>("Financial Analyst");
  const [prompt, setPrompt] = useState("");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [generatedProvenance, setGeneratedProvenance] = useState<string | null>(null);
  const chunks = useMemo(() => workspace.documents.flatMap((document) => document.chunks), [workspace.documents]);

  async function preparePrompt() {
    setLoading(true); setError(""); setMessage("");
    try {
      let evidence: EvidenceChunk[] = [];
      if (chunks.length) {
        const retrieval = await apiPost<{ results: EvidenceChunk[] }>("/v1/retrieval/search", { query: `${selected} revenue margins cash flow valuation risks`, chunks, limit: 8 });
        evidence = retrieval.results;
      }
      const prior = Object.fromEntries(Object.entries(workspace.agentRuns).filter(([, run]) => run.valid && run.parsed_output).map(([name, run]) => [name, run.parsed_output]));
      const response = await apiPost<PromptResponse>("/v1/prompts/agent", { agent_name: selected, evidence, verified_financials: financialsByPeriod(workspace.figures), valuation_results: workspace.dcfResult ?? {}, prior_outputs: prior });
      setPrompt(response.prompt);
      setMessage(chunks.length ? `${evidence.length} source passages retrieved.` : "Prompt prepared without document evidence; it explicitly marks this limitation.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Prompt preparation failed."); }
    finally { setLoading(false); }
  }

  async function validate() {
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await apiPost<ValidationResponse>("/v1/ai/validate", { agent_name: selected, raw_output: raw });
      if (!response.valid) { setError(response.errors.join(" ")); return; }
      const provenance = generatedProvenance ?? response.provenance;
      const run: AgentRun = { agent_name: selected, prompt, raw_output: raw, parsed_output: response.parsed_output, valid: true, errors: [], provenance };
      updateWorkspace((current) => ({ ...current, agentRuns: { ...current.agentRuns, [selected]: run } }));
      setMessage(`${selected} response validated and saved with provenance: ${provenance}.`); setRaw(""); setGeneratedProvenance(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Validation failed."); }
    finally { setLoading(false); }
  }

  async function runConfiguredInference() {
    if (!prompt) return;
    setLoading(true); setError("");
    try {
      const generated = await apiPost<{ output: string; model: string; provenance: string }>("/v1/inference/generate", { prompt, json_mode: true });
      setRaw(generated.output); setGeneratedProvenance(`${generated.provenance}: ${generated.model}`); setMessage(`Response received from configured model ${generated.model}. Validate it before saving.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Configured inference failed."); }
    finally { setLoading(false); }
  }

  return (
    <>
      <PageHeader kicker="AI research agents" title="Four mandates. One evidence standard." description="Manual AI Mode is the default. EquityLens prepares the grounded prompt, then validates the JSON you explicitly import from an external model." />
      <Notice kind="info">EquityLens has not contacted ChatGPT or another model unless you select Configured External Inference in Settings and the server operator has configured it.</Notice>
      <div className="mt-5 grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
        <Card>
          <Select label="Research agent" value={selected} onChange={(event) => { setSelected(event.target.value as AgentName); setPrompt(""); setRaw(""); setGeneratedProvenance(null); }}>{agents.map((agent) => <option key={agent}>{agent}</option>)}</Select>
          <div className="mt-5 space-y-3">
            {agents.map((agent, index) => { const run = workspace.agentRuns[agent]; return <button key={agent} onClick={() => setSelected(agent)} className={`flex w-full items-center gap-3 border p-3 text-left ${selected === agent ? "border-gold bg-gold/5" : "border-line"}`}><span className="flex h-7 w-7 items-center justify-center border border-line text-xs text-gold">0{index + 1}</span><span className="flex-1 text-sm font-semibold">{agent}</span>{run?.valid ? <CheckCircle2 size={16} className="text-teal"/> : <span className="text-[10px] uppercase text-mist">Pending</span>}</button>; })}
          </div>
          <Button loading={loading} className="mt-5 w-full" onClick={preparePrompt}><Play size={15}/> Prepare grounded prompt</Button>
          <p className="mt-3 text-xs leading-5 text-mist">Run agents in order to include validated prior outputs in the next prompt. The committee critic receives all validated predecessors.</p>
        </Card>
        <div className="space-y-5">
          <Card><div className="flex items-center justify-between"><div><p className="eyebrow">Step 1</p><h2 className="mt-1 text-xl font-semibold">Copy specialized prompt</h2></div><Button variant="secondary" disabled={!prompt} onClick={() => navigator.clipboard.writeText(prompt)}><Clipboard size={15}/> Copy</Button></div><TextArea label="Prompt" value={prompt} readOnly className="mt-4 min-h-80 font-mono text-xs" />{workspace.settings.mode === "Configured External Inference" && <Button loading={loading} disabled={!prompt} className="mt-3" onClick={runConfiguredInference}>Run configured inference</Button>}</Card>
          <Card><p className="eyebrow">Step 2</p><h2 className="mt-1 text-xl font-semibold">Import and validate JSON</h2><div className="mt-4"><TextArea label="External model response" value={raw} onChange={(event) => { setRaw(event.target.value); setGeneratedProvenance(null); }} placeholder="Paste the complete JSON object here" className="min-h-56 font-mono text-xs" /></div><Button loading={loading} disabled={!raw.trim() || !prompt} className="mt-3" onClick={validate}><ShieldAlert size={15}/> Validate and save</Button></Card>
          {error && <Notice kind="error">{error}</Notice>}{message && <Notice kind="success">{message}</Notice>}
        </div>
      </div>
      <Card className="mt-5"><p className="eyebrow">Intermediate outputs</p><h2 className="mt-1 text-xl font-semibold">Validated research record</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">{agents.map((agent) => { const run = workspace.agentRuns[agent]; return <div key={agent} className="border border-line p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{agent}</h3><span className={`text-right text-[10px] font-bold uppercase ${run?.valid ? "text-teal" : "text-mist"}`}>{run?.valid ? run.provenance : "No result"}</span></div>{run?.parsed_output ? <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-300">{JSON.stringify(run.parsed_output, null, 2)}</pre> : <p className="mt-3 text-sm text-mist">Prepare a prompt and import a valid response.</p>}</div>; })}</div></Card>
    </>
  );
}
