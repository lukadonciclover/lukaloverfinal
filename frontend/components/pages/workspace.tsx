"use client";

import Link from "next/link";
import { FinancialsPage } from "./financials";
import { useRef, useState } from "react";
import { Archive, Copy, FileSpreadsheet, FileText, FolderPlus, Pencil, Trash2, UploadCloud } from "lucide-react";
import { apiUpload } from "@/lib/api";
import { defaultDCF } from "@/lib/demo";
import type { DocumentRecord } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";
import { Button, Card, Field, Notice, PageHeader, TextArea } from "@/components/ui";

type ProcessResponse = { document: Omit<DocumentRecord, "chunks" | "suggestions">; chunks: DocumentRecord["chunks"]; suggestions: DocumentRecord["suggestions"] };

export function WorkspacePage() {
  const { workspace, project, projects, updateWorkspace, createProject, renameProject, duplicateProject, archiveProject, restoreProject, persistenceStatus, persistenceMessage, setDocumentRetention } = useWorkspace();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const company = workspace.company;
  const updateCompany = (field: string, value: string | number | null) => updateWorkspace((current) => {
    const replacingSyntheticIdentity = current.company.is_synthetic && (field === "name" || field === "ticker") && value !== current.company[field as "name" | "ticker"];
    return {
      ...current,
      company: { ...current.company, [field]: value, ...(replacingSyntheticIdentity ? { is_synthetic: false } : {}) },
      ...(replacingSyntheticIdentity ? { valuationWorkbench: undefined, figures: [], documents: [], dcfInputs: { ...structuredClone(defaultDCF), base_revenue: 0, cash: 0, debt: 0, diluted_shares: null, reference_price: null }, dcfResult: null, dcfInputHash: null, dcfCalculationHash: null, agentRuns: {}, claimAssessments: [], chats: [], financialAnalysis: null, thesis: null, reportSnapshot: null } : {})
    };
  });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (uploading) return;
    setUploading(true); setError(""); setMessage("");
    let completed = 0;
    try {
      for (const file of Array.from(files)) {
        const form = new FormData(); form.append("file", file); form.append("currency", company.currency);
        const result = await apiUpload<ProcessResponse>("/v1/documents/process", form);
        updateWorkspace((current) => ({ ...current, documents: [...current.documents.filter((item) => item.identifier !== result.document.identifier), { ...result.document, chunks: result.chunks, suggestions: result.suggestions }] }));
        completed += 1;
      }
      setMessage(`${completed} document${completed === 1 ? "" : "s"} processed. Review extraction suggestions before using them.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed."); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  function removeDocument(identifier: string, name: string) {
    if (!window.confirm(`Remove ${name} and all financial figures, chat history, and claim checks derived from it?`)) return;
    updateWorkspace((current) => ({
      ...current,
      documents: current.documents.filter((item) => item.identifier !== identifier),
      figures: current.figures.filter((figure) => !(figure.source?.document_identifier === identifier || (!figure.source?.document_identifier && figure.source?.document_name === name))),
      chats: [],
      claimAssessments: []
    }));
  }

  return (
    <>
      <PageHeader kicker="Financial data" title="Financial data & projects." description="Company metadata, source documents, reporting units, and analyst context remain attached to this browser workspace." />
      <Card className="mb-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">Project management</p><h2 className="mt-1 text-xl font-semibold">{project.name}</h2><p className="mt-1 text-xs text-mist">{projects.filter((item) => !item.archived).length} active · {projects.filter((item) => item.archived).length} archived · isolated browser-local projects</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { const name = window.prompt("New project name", "Untitled company")?.trim(); if (name) createProject(name); }}><FolderPlus size={14}/> Create</Button><Button variant="secondary" onClick={() => { const name = window.prompt("Rename project", project.name)?.trim(); if (name) renameProject(project.id, name); }}><Pencil size={14}/> Rename</Button><Button variant="secondary" onClick={() => duplicateProject(project.id)}><Copy size={14}/> Duplicate</Button><Button variant="danger" disabled={projects.filter((item) => !item.archived).length <= 1} onClick={() => { if (window.confirm(`Archive ${project.name}? Its data remains stored and can be restored here.`)) archiveProject(project.id); }}><Archive size={14}/> Archive</Button></div></div>{projects.some((item) => item.archived) && <div className="mt-4 border-t border-line pt-3"><p className="text-xs font-semibold uppercase tracking-wider text-mist">Archived projects</p><div className="mt-2 flex flex-wrap gap-2">{projects.filter((item) => item.archived).map((item) => <button key={item.id} onClick={() => restoreProject(item.id)} className="border border-line px-3 py-2 text-xs text-mist hover:text-white">Restore {item.name}</button>)}</div></div>}</Card>
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <div className="mb-5"><p className="eyebrow">Company profile</p><h2 className="mt-1 text-xl font-semibold">Company details</h2></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Company name" value={company.name} onChange={(e) => updateCompany("name", e.target.value)} />
            <Field label="Ticker" value={company.ticker ?? ""} onChange={(e) => updateCompany("ticker", e.target.value || null)} />
            <Field label="Country" value={company.country} onChange={(e) => updateCompany("country", e.target.value)} />
            <Field label="Industry" value={company.industry} onChange={(e) => updateCompany("industry", e.target.value)} />
            <Field label="Currency" value={company.currency} maxLength={3} onChange={(e) => updateCompany("currency", e.target.value.toUpperCase())} />
            <Field label="Reporting standard" value={company.reporting_standard} onChange={(e) => updateCompany("reporting_standard", e.target.value)} />
            <Field label="Latest financial year" type="number" value={company.latest_financial_year ?? ""} onChange={(e) => updateCompany("latest_financial_year", e.target.value ? Number(e.target.value) : null)} />
            <Field label="Share price" type="number" step="0.01" value={company.share_price ?? ""} onChange={(e) => updateCompany("share_price", e.target.value ? Number(e.target.value) : null)} />
            <Field label="Shares outstanding" type="number" step="0.01" value={company.shares_outstanding ?? ""} onChange={(e) => updateCompany("shares_outstanding", e.target.value ? Number(e.target.value) : null)} />
            <Field label="Statement dates" value={company.statement_dates} onChange={(e) => updateCompany("statement_dates", e.target.value)} />
            <Field label="Investment horizon" value={company.investment_horizon} onChange={(e) => updateCompany("investment_horizon", e.target.value)} />
            <Field label="Required annual return" type="number" step="0.005" value={company.required_return ?? ""} onChange={(e) => updateCompany("required_return", e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div className="mt-4"><TextArea label="Analyst notes" value={company.analyst_notes} onChange={(e) => updateCompany("analyst_notes", e.target.value)} /></div>
          <p className={`mt-3 text-xs ${persistenceStatus === "error" ? "text-red-300" : "text-mist"}`}>{persistenceMessage}</p>
        </Card>
        <Card>
          <p className="eyebrow">Source intake</p><h2 className="mt-1 text-xl font-semibold">Process financial documents</h2>
          <button disabled={uploading} onClick={() => inputRef.current?.click()} className="mt-5 flex min-h-48 w-full flex-col items-center justify-center border border-dashed border-line bg-ink/60 p-6 text-center transition hover:border-teal disabled:cursor-not-allowed disabled:opacity-50">
            <UploadCloud className="text-teal" size={30}/><span className="mt-3 font-semibold">Choose PDF, CSV, or XLSX</span><span className="mt-1 text-xs text-mist">4 MB and 100-page synchronous limit</span>
          </button>
          <input ref={inputRef} aria-label="Upload financial documents" className="hidden" type="file" accept=".pdf,.csv,.xlsx" multiple onChange={(event) => upload(event.target.files)} />
          <Button loading={uploading} disabled={uploading} className="mt-3 w-full" onClick={() => inputRef.current?.click()}>{uploading ? "Processing document" : "Select documents"}</Button>
          <div className="mt-4"><Notice kind="info">Uploaded bytes have no application-level server retention. The platform may use transient function memory or temporary upload storage. Extracted text is not persisted in this browser unless source-text retention is enabled below.</Notice></div>
          {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
          {message && <div className="mt-3"><Notice kind="success">{message}</Notice></div>}
        </Card>
      </div>
      <p className="mt-5"><Link href="/financials" className="text-teal underline">Review, correct and approve extracted figures in Financial Analysis</Link></p>
      <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={workspace.settings.persistDocumentText} onChange={e => void setDocumentRetention(e.target.checked)}/> Retain source text in this browser for traceability</label>
      <Card className="mt-5">
        <div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">Document register</p><h2 className="mt-1 text-xl font-semibold">Attached evidence</h2></div><span className="text-xs text-mist">{workspace.documents.length} source(s)</span></div>
        {workspace.documents.length === 0 ? <div className="border border-dashed border-line p-8 text-center text-sm text-mist">No documents processed in this workspace.</div> : <div className="grid gap-3 md:grid-cols-2">{workspace.documents.map((document) => <div key={document.identifier} className="border border-line bg-ink/50 p-4"><div className="flex items-start gap-3">{document.name.toLowerCase().endsWith(".pdf") ? <FileText className="text-gold"/> : <FileSpreadsheet className="text-teal"/>}<div className="min-w-0 flex-1"><p className="truncate font-semibold">{document.name}</p><p className="mt-1 text-xs text-mist">{document.document_type} · {document.pages} page(s) · {document.reporting_period || "period not detected"}</p><p className="mt-2 text-xs">{document.chunks.length} chunks · {document.suggestions.length} review suggestions</p></div><button aria-label={`Remove ${document.name} and derived data`} onClick={() => removeDocument(document.identifier, document.name)} className="min-h-10 min-w-10 text-mist hover:text-red-300"><Trash2 size={17}/></button></div>{document.warning && <p className="mt-3 border-l-2 border-gold pl-3 text-xs text-amber-100">{document.warning}</p>}</div>)}</div>}
      </Card>
      <div className="mt-8"><FinancialsPage /></div>
    </>
  );
}
