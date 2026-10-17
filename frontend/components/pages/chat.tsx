"use client";

import { useMemo, useState } from "react";
import { Clipboard, Send } from "lucide-react";
import { apiPost } from "@/lib/api";
import type { ChatMessage, EvidenceChunk } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Notice, PageHeader, TextArea } from "@/components/ui";

export function ChatPage() {
  const { workspace, updateWorkspace } = useWorkspace();
  const [question, setQuestion] = useState("");
  const [prompt, setPrompt] = useState("");
  const [raw, setRaw] = useState("");
  const [evidence, setEvidence] = useState<EvidenceChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const chunks = useMemo(() => workspace.documents.flatMap((document) => document.chunks), [workspace.documents]);
  async function ask() {
    if (!question.trim()) return;
    setLoading(true); setError("");
    try {
      const retrieved = chunks.length ? await apiPost<{ results: EvidenceChunk[] }>("/v1/retrieval/search", { query: question, chunks, limit: 6 }) : { results: [] };
      const response = await apiPost<{ prompt: string }>("/v1/chat/prompt", { question, evidence: retrieved.results, calculation_context: workspace.dcfResult ?? {} });
      const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: question, citations: [] };
      updateWorkspace((current) => ({ ...current, chats: [...current.chats, userMessage] }));
      setEvidence(retrieved.results); setPrompt(response.prompt); setQuestion("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Prompt preparation failed."); }
    finally { setLoading(false); }
  }
  async function validate() {
    setLoading(true); setError("");
    try {
      const response = await apiPost<{ valid: boolean; parsed_output: { answer: string; citations: string[] } | null; errors: string[]; provenance: string }>("/v1/chat/validate", { raw_output: raw });
      if (!response.valid || !response.parsed_output) { setError(response.errors.join(" ")); return; }
      const message: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: response.parsed_output.answer, citations: response.parsed_output.citations, provenance: response.provenance };
      updateWorkspace((current) => ({ ...current, chats: [...current.chats, message] })); setPrompt(""); setRaw(""); setEvidence([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Response validation failed."); }
    finally { setLoading(false); }
  }
  return <><PageHeader kicker="Research chat" title="Ask the documents, not the void." description="Relevant passages are retrieved first. Manual responses must cite source documents and pages or explicitly identify missing evidence."/><div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]"><Card><div className="min-h-[420px] space-y-4">{workspace.chats.length === 0 && <div className="flex min-h-72 items-center justify-center text-center text-sm text-mist">No research questions yet.<br/>Process a document, then ask a source-grounded question.</div>}{workspace.chats.map((message) => <div key={message.id} className={`max-w-[86%] border p-4 ${message.role === "user" ? "ml-auto border-gold/40 bg-gold/5" : "border-line bg-ink"}`}><p className="text-[10px] font-bold uppercase tracking-wider text-mist">{message.role}{message.provenance ? ` · ${message.provenance}` : ""}</p><p className="mt-2 text-sm leading-6">{message.content}</p>{message.citations.length > 0 && <p className="mt-3 text-xs text-teal">Sources: {message.citations.join("; ")}</p>}</div>)}</div><div className="mt-4 flex gap-2"><input aria-label="Research question" className="field" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} placeholder="What evidence explains the margin change?"/><Button loading={loading} onClick={ask}><Send size={15}/></Button></div></Card><div className="space-y-5"><Card><div className="flex items-center justify-between"><div><p className="eyebrow">Manual AI packet</p><h2 className="mt-1 text-xl font-semibold">Grounded prompt</h2></div><Button variant="secondary" disabled={!prompt} onClick={() => navigator.clipboard.writeText(prompt)}><Clipboard size={15}/> Copy</Button></div><TextArea label="Prompt" value={prompt} readOnly className="mt-4 min-h-56 font-mono text-xs"/><TextArea label="Paste JSON response" value={raw} onChange={(event) => setRaw(event.target.value)} className="mt-3 min-h-40 font-mono text-xs"/><Button loading={loading} disabled={!raw.trim() || !prompt} className="mt-3" onClick={validate}>Validate answer</Button></Card>{evidence.length > 0 && <Card><p className="eyebrow">Retrieved evidence</p><div className="mt-3 max-h-64 space-y-3 overflow-y-auto">{evidence.map((item, index) => <div key={index} className="border-l-2 border-teal pl-3"><p className="text-xs font-semibold">{item.document_name}, page {item.page}</p><p className="mt-1 line-clamp-3 text-xs leading-5 text-mist">{item.text}</p></div>)}</div></Card>}{!chunks.length && <Notice kind="warning">No document text is available in memory. If you refreshed after upload with document persistence disabled, process the source again.</Notice>}{error && <Notice kind="error">{error}</Notice>}</div></div></>;
}
