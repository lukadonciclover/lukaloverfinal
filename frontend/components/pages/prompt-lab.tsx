"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clipboard } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Notice, PageHeader, Select, TextArea } from "@/components/ui";

type Benchmarks = { strategies: string[]; tasks: Record<string, { context: string; expected_numbers: number[]; required_terms: string[] }> };

export function PromptLabPage() {
  const { workspace, updateWorkspace } = useWorkspace();
  const [benchmarks, setBenchmarks] = useState<Benchmarks | null>(null);
  const [strategy, setStrategy] = useState("");
  const [task, setTask] = useState("");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { apiGet<Benchmarks>("/v1/prompts/benchmarks").then((data) => { setBenchmarks(data); setStrategy(data.strategies[0]); setTask(Object.keys(data.tasks)[0]); }).catch((reason) => setError(reason.message)); }, []);
  async function generate() { if (!benchmarks) return; setError(""); try { const response = await apiPost<{ prompt: string }>("/v1/prompts/strategy", { strategy, task, context: benchmarks.tasks[task].context }); setPrompt(response.prompt); } catch (reason) { setError(reason instanceof Error ? reason.message : "Prompt generation failed."); } }
  async function evaluate() { setError(""); try { const result = await apiPost<Record<string, unknown>>("/v1/prompts/evaluate", { task_name: task, output, require_json: strategy === "Structured JSON generation" }); setMetrics(result); updateWorkspace((current) => ({ ...current, experiments: [...current.experiments, { id: crypto.randomUUID(), strategy, task, output, metrics: result }] })); } catch (reason) { setError(reason instanceof Error ? reason.message : "Evaluation failed."); } }
  const chart = workspace.experiments.map((item, index) => ({ name: `${index + 1}. ${item.strategy.replace(" prompting", "")}`, accuracy: Number(item.metrics.known_number_match ?? 0), compliance: item.metrics.instruction_compliance ? 1 : 0, completeness: Number(item.metrics.completeness ?? 0) }));
  return <><PageHeader kicker="Prompt engineering lab" title="Compare methods, not anecdotes." description="Run the same synthetic benchmark through multiple prompt strategies. Objective checks remain separate from human interpretive review."/>{error && <Notice kind="error">{error}</Notice>}<div className="mt-5 grid gap-5 xl:grid-cols-[0.7fr_1.3fr]"><Card><Select label="Benchmark task" value={task} onChange={(event) => { setTask(event.target.value); setPrompt(""); }}>{Object.keys(benchmarks?.tasks ?? {}).map((name) => <option key={name}>{name}</option>)}</Select><div className="mt-4"><Select label="Prompt strategy" value={strategy} onChange={(event) => { setStrategy(event.target.value); setPrompt(""); }}>{benchmarks?.strategies.map((name) => <option key={name}>{name}</option>)}</Select></div><Button className="mt-5 w-full" disabled={!benchmarks} onClick={generate}>Generate experiment prompt</Button><Notice kind="warning"><span className="font-semibold">Evaluation boundary:</span> known numbers, required terms, JSON validity, citation presence, and completeness are automated. Interpretive quality remains human-assessed.</Notice></Card><Card><div className="flex items-center justify-between"><div><p className="eyebrow">Experiment</p><h2 className="mt-1 text-xl font-semibold">Manual response evaluation</h2></div><Button variant="secondary" disabled={!prompt} onClick={() => navigator.clipboard.writeText(prompt)}><Clipboard size={15}/> Copy</Button></div><TextArea label="Editable prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-4 min-h-48 font-mono text-xs"/><TextArea label="Imported model output" value={output} onChange={(event) => setOutput(event.target.value)} className="mt-3 min-h-40 font-mono text-xs"/><Button disabled={!output.trim()} className="mt-3" onClick={evaluate}>Evaluate and save</Button>{metrics && <pre className="mt-4 overflow-auto border border-line bg-ink p-3 text-xs">{JSON.stringify(metrics, null, 2)}</pre>}</Card></div>{chart.length > 0 && <Card className="mt-5"><p className="eyebrow">Experiment history</p><h2 className="mt-1 text-xl font-semibold">Objective benchmark comparison</h2><div className="mt-4 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart}><CartesianGrid stroke="#1d3341" vertical={false}/><XAxis dataKey="name" stroke="#8fa6b3" fontSize={10}/><YAxis domain={[0, 1]} stroke="#8fa6b3"/><Tooltip contentStyle={{ background: "#0d1821", border: "1px solid #1d3341" }}/><Bar dataKey="accuracy" fill="#45b6ad"/><Bar dataKey="compliance" fill="#d4a84f"/><Bar dataKey="completeness" fill="#7d8fff"/></BarChart></ResponsiveContainer></div><p className="text-xs text-mist">One result cannot establish that a prompt strategy is generally superior.</p></Card>}</>;
}
