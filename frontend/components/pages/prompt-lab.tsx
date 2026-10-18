"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clipboard, Trash2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Field, Notice, PageHeader, Select, TextArea, formatPercent } from "@/components/ui";

type TaskSpec = { version: string; context: string; expected_values: unknown[]; required_terms: string[]; required_source_ids: string[] };
type Benchmarks = { version: string; strategies: string[]; tasks: Record<string, TaskSpec> };
type Evaluation = { objective_metrics: Record<string, unknown>; benchmark_version: string; prompt_version: string; model_id: string; human_judgments: { rating: number | null; notes: string } };

export function PromptLabPage() {
  const { workspace, updateWorkspace } = useWorkspace();
  const [benchmarks, setBenchmarks] = useState<Benchmarks | null>(null);
  const [strategy, setStrategy] = useState("");
  const [task, setTask] = useState("");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [modelId, setModelId] = useState("External model (manual import)");
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  async function loadBenchmarks() {
    setLoading(true); setError("");
    try {
      const data = await apiGet<Benchmarks>("/v1/prompts/benchmarks");
      setBenchmarks(data); setStrategy(data.strategies[0] ?? ""); setTask(Object.keys(data.tasks)[0] ?? "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Benchmark loading failed."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadBenchmarks(); }, []);

  function resetResult() { setPrompt(""); setOutput(""); setEvaluation(null); setRating(null); setNotes(""); }

  async function generate() {
    if (!benchmarks || !task || loading) return;
    const request = ++requestRef.current;
    setLoading(true); setError(""); setEvaluation(null); setOutput("");
    try {
      const response = await apiPost<{ prompt: string }>("/v1/prompts/strategy", { strategy, task, context: benchmarks.tasks[task].context });
      if (request === requestRef.current) setPrompt(response.prompt);
    } catch (reason) { if (request === requestRef.current) setError(reason instanceof Error ? reason.message : "Prompt generation failed."); }
    finally { if (request === requestRef.current) setLoading(false); }
  }

  async function evaluate() {
    if (!benchmarks || !prompt.trim() || !output.trim() || !modelId.trim() || loading) return;
    const request = ++requestRef.current;
    setLoading(true); setError("");
    try {
      const result = await apiPost<Evaluation>("/v1/prompts/evaluate", { task_name: task, output, require_json: strategy === "Structured JSON generation", prompt, prompt_version: "prompt-lab-v2.0", model_id: modelId });
      if (request !== requestRef.current) return;
      const complete = { ...result, human_judgments: { rating, notes } };
      setEvaluation(complete);
      updateWorkspace((current) => ({ ...current, experiments: [...current.experiments, {
        id: crypto.randomUUID(), strategy, task, prompt, prompt_version: result.prompt_version,
        benchmark_version: result.benchmark_version, model_id: modelId, output,
        objective_metrics: result.objective_metrics, human_judgments: { rating, notes }, created_at: new Date().toISOString()
      }] }));
    } catch (reason) { if (request === requestRef.current) setError(reason instanceof Error ? reason.message : "Evaluation failed."); }
    finally { if (request === requestRef.current) setLoading(false); }
  }

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); }
    catch { setError("Clipboard access failed. Select the prompt manually."); }
  }

  const chart = workspace.experiments.map((item, index) => ({
    name: `${index + 1}. ${item.strategy.replace(" prompting", "")}`,
    numerical: Number(item.objective_metrics.numerical_accuracy ?? 0),
    evidence: Number(item.objective_metrics.evidence_accuracy ?? 0),
    completeness: Number(item.objective_metrics.completeness ?? 0)
  }));

  return <>
    <PageHeader kicker="Prompt engineering lab" title="Compare methods, not anecdotes." description="Run versioned synthetic benchmarks through named models and prompting strategies. Objective checks remain separate from human judgment."/>
    {error && <Notice kind="error">{error} {!benchmarks && <Button variant="secondary" className="ml-3" onClick={loadBenchmarks}>Retry</Button>}</Notice>}
    <div className="mt-5 grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
      <Card>
        <Select label="Benchmark task" value={task} disabled={!benchmarks || loading} onChange={(event) => { setTask(event.target.value); resetResult(); }}>{Object.keys(benchmarks?.tasks ?? {}).map((name) => <option key={name}>{name}</option>)}</Select>
        <div className="mt-4"><Select label="Prompt strategy" value={strategy} disabled={!benchmarks || loading} onChange={(event) => { setStrategy(event.target.value); resetResult(); }}>{benchmarks?.strategies.map((name) => <option key={name}>{name}</option>)}</Select></div>
        <div className="mt-4"><Field label="Model identifier" value={modelId} onChange={(event) => { setModelId(event.target.value); setEvaluation(null); }} /></div>
        <Button loading={loading} className="mt-5 w-full" disabled={!benchmarks} onClick={generate}>Generate versioned prompt</Button>
        <div className="mt-4"><Notice kind="warning"><span className="font-semibold">Objective:</span> named numerical answers, source IDs, JSON validity, required instructions, hallucinated numbers and required-check completeness. <span className="font-semibold">Human:</span> reasoning quality, usefulness and citation entailment.</Notice></div>
      </Card>
      <Card>
        <div className="flex items-center justify-between"><div><p className="eyebrow">Experiment</p><h2 className="mt-1 text-xl font-semibold">Manual response evaluation</h2></div><Button variant="secondary" disabled={!prompt} onClick={copyPrompt}><Clipboard size={15}/> Copy</Button></div>
        <TextArea label="Editable prompt" value={prompt} onChange={(event) => { setPrompt(event.target.value); setEvaluation(null); }} className="mt-4 min-h-48 font-mono text-xs"/>
        <TextArea label="Imported model output" value={output} onChange={(event) => { setOutput(event.target.value); setEvaluation(null); }} className="mt-3 min-h-40 font-mono text-xs"/>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Human rating (optional, 1-5)" type="number" min="1" max="5" value={rating ?? ""} onChange={(event) => setRating(event.target.value ? Number(event.target.value) : null)}/><TextArea label="Human review notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20"/></div>
        <Button loading={loading} disabled={!prompt.trim() || !output.trim() || !modelId.trim()} className="mt-3" onClick={evaluate}>Evaluate and save</Button>
        {evaluation && <div className="mt-4 grid gap-4 lg:grid-cols-2"><pre className="overflow-auto border border-line bg-ink p-3 text-xs">{JSON.stringify(evaluation.objective_metrics, null, 2)}</pre><div className="border border-line p-3 text-xs"><p className="font-semibold text-gold">Human judgment</p><p className="mt-2">Rating: {evaluation.human_judgments.rating ?? "Not rated"}</p><p className="mt-2 text-mist">{evaluation.human_judgments.notes || "No human notes supplied."}</p></div></div>}
      </Card>
    </div>
    <Card className="mt-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Experiment history</p><h2 className="mt-1 text-xl font-semibold">Side-by-side objective comparison</h2></div>{workspace.experiments.length > 0 && <Button variant="secondary" onClick={() => updateWorkspace((current) => ({ ...current, experiments: [] }))}><Trash2 size={14}/> Clear history</Button>}</div>{workspace.experiments.length === 0 ? <p className="mt-4 text-sm text-mist">No experiment results. EquityLens never inserts fabricated benchmark runs.</p> : <><div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart}><CartesianGrid stroke="#1d3341" vertical={false}/><XAxis dataKey="name" stroke="#8fa6b3" fontSize={10}/><YAxis domain={[0, 1]} stroke="#8fa6b3"/><Tooltip contentStyle={{ background: "#0d1821", border: "1px solid #1d3341" }}/><Bar dataKey="numerical" fill="#45b6ad"/><Bar dataKey="evidence" fill="#d4a84f"/><Bar dataKey="completeness" fill="#7d8fff"/></BarChart></ResponsiveContainer></div><div className="table-wrap mt-4"><table className="data-table"><thead><tr><th>Model</th><th>Strategy</th><th>Task</th><th>Version</th><th>Numerical</th><th>Evidence</th><th>JSON</th><th>Compliance</th><th>Human</th></tr></thead><tbody>{workspace.experiments.map((item) => <tr key={item.id}><td>{item.model_id}</td><td>{item.strategy}</td><td>{item.task}</td><td>{item.benchmark_version}</td><td>{formatPercent(Number(item.objective_metrics.numerical_accuracy ?? 0))}</td><td>{formatPercent(Number(item.objective_metrics.evidence_accuracy ?? 0))}</td><td>{String(item.objective_metrics.structured_output_valid ?? "n/a")}</td><td>{String(item.objective_metrics.instruction_compliance ?? false)}</td><td>{item.human_judgments.rating ?? "—"}</td></tr>)}</tbody></table></div></>}</Card>
  </>;
}
