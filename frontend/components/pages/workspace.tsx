"use client";
import { useState } from "react";
import { SourceReview } from "@/components/source-review";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { documentDependencies, removeSource } from "@/lib/source-dependencies";
import { AssumptionAnalysis } from "@/components/assumption-analysis";
import { DocumentUpload } from "@/components/document-upload";

import { CreateProjectForm } from "@/components/create-project-form";
import Link from "next/link";
import { FinancialLedger } from "@/components/financial-ledger";
import {
  Archive,
  Copy,
  FileSpreadsheet,
  FileText,
  Pencil,
  Trash2,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import {
  Button,
  Card,
  Field,
  Notice,
  PageHeader,
  TextArea,
} from "@/components/ui";

export function WorkspacePage() {
  const {
    workspace,
    project,
    projects,
    updateWorkspace,
    renameProject,
    duplicateProject,
    archiveProject,
    restoreProject,
    persistenceStatus,
    persistenceMessage,
    setDocumentRetention,
  } = useWorkspace();
  const company = workspace.company;
  const updateCompany = (field: string, value: string | number | null) =>
    updateWorkspace((current) => {
      return { ...current, company: { ...current.company, [field]: value } };
    });

  const [removal, setRemoval] = useState<{
    id: string;
    name: string;
    project: string;
    revision: number;
  } | null>(null);
  const [removalError, setRemovalError] = useState("");
  function removeDocument(id: string, name: string) {
    setRemoval({ id, name, project: project.id, revision: workspace.revision });
  }
  const dependencies = removal
    ? documentDependencies(workspace, removal.id)
    : null;

  return (
    <>
      <PageHeader title="Financial Data" />
      {removalError && <Notice kind="error">{removalError}</Notice>}
      <SourceReview />
      {removal && dependencies && removal.project === project.id && (
        <ConfirmationDialog
          title="Remove Source Document?"
          confirmLabel="Remove Source and Flag Dependencies"
          onCancel={() => setRemoval(null)}
          onConfirm={() => {
            if (
              removal.project !== project.id ||
              removal.revision !== workspace.revision
            ) {
              setRemovalError(
                "Project changed; review source dependencies again.",
              );
              setRemoval(null);
              return;
            }
            if (dependencies.ambiguous) {
              setRemovalError(
                "Legacy source names are ambiguous. Assign document identifiers before deletion.",
              );
              setRemoval(null);
              return;
            }
            updateWorkspace((w) =>
              removeSource(w, removal.id, removal.revision),
            );
            setRemoval(null);
          }}
        >
          <p>{removal.name}</p>
          <ul>
            <li>{dependencies.figures.length} approved figures</li>
            <li>{dependencies.suggestions} extracted financial suggestions</li>
            <li>{dependencies.assumptions.length} extracted assumptions</li>
            <li>{dependencies.references.length} historical references</li>
            <li>
              {
                dependencies.active.filter((a) =>
                  a.target.startsWith("forecast."),
                ).length
              }{" "}
              active forecasting adoptions
            </li>
            <li>
              {
                dependencies.active.filter(
                  (a) => !a.target.startsWith("forecast."),
                ).length
              }{" "}
              active valuation adoptions
            </li>
          </ul>
          <p>
            Financial results will be invalidated. Dependent values are retained
            but require review before use. Source excerpts are removed from
            affected audit records.
          </p>
          <details>
            <summary>Inspect affected records</summary>
            {dependencies.figures.map((f, i) => (
              <p key={`f${i}`}>
                {f.period}: {f.metric} = {f.value}
              </p>
            ))}
            {dependencies.assumptions.map((a) => (
              <p key={a.id}>
                {a.metric}: {a.period}
              </p>
            ))}
            {dependencies.active.map((a) => (
              <p key={a.id}>
                {a.target}: {a.value} - {a.source.document_name}
              </p>
            ))}
          </details>
        </ConfirmationDialog>
      )}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Project management</p>
            <h2 className="mt-1 text-xl font-semibold">{project.name}</h2>
            <p className="mt-1 text-xs text-mist">
              {projects.filter((item) => !item.archived).length} active ·{" "}
              {projects.filter((item) => item.archived).length} archived ·
              isolated browser-local projects
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CreateProjectForm />
            <Button
              variant="secondary"
              onClick={() => {
                const name = window
                  .prompt("Rename project", project.name)
                  ?.trim();
                if (name) renameProject(project.id, name);
              }}
            >
              <Pencil size={14} /> Rename
            </Button>
            <Button
              variant="secondary"
              onClick={() => duplicateProject(project.id)}
            >
              <Copy size={14} /> Duplicate
            </Button>
            <Button
              variant="danger"
              disabled={projects.filter((item) => !item.archived).length <= 1}
              onClick={() => {
                if (
                  window.confirm(
                    `Archive ${project.name}? Its data remains stored and can be restored here.`,
                  )
                )
                  archiveProject(project.id);
              }}
            >
              <Archive size={14} /> Archive
            </Button>
          </div>
        </div>
        {projects.some((item) => item.archived) && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-mist">
              Archived projects
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {projects
                .filter((item) => item.archived)
                .map((item) => (
                  <button
                    key={item.id}
                    onClick={() => restoreProject(item.id)}
                    className="border border-line px-3 py-2 text-xs text-mist hover:text-white"
                  >
                    Restore {item.name}
                  </button>
                ))}
            </div>
          </div>
        )}
      </Card>
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <div className="mb-5">
            <p className="eyebrow">Company profile</p>
            <h2 className="mt-1 text-xl font-semibold">Company details</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Company name"
              value={company.name}
              onChange={(e) => updateCompany("name", e.target.value)}
            />
            <Field
              label="Ticker"
              value={company.ticker ?? ""}
              onChange={(e) => updateCompany("ticker", e.target.value || null)}
            />
            <Field
              label="Country"
              value={company.country}
              onChange={(e) => updateCompany("country", e.target.value)}
            />
            <Field
              label="Industry"
              value={company.industry}
              onChange={(e) => updateCompany("industry", e.target.value)}
            />
            <Field
              label="Currency"
              value={company.currency}
              maxLength={3}
              onChange={(e) =>
                updateCompany("currency", e.target.value.toUpperCase())
              }
            />
            <Field
              label="Reporting standard"
              value={company.reporting_standard}
              onChange={(e) =>
                updateCompany("reporting_standard", e.target.value)
              }
            />
            <Field
              label="Latest financial year"
              type="number"
              value={company.latest_financial_year ?? ""}
              onChange={(e) =>
                updateCompany(
                  "latest_financial_year",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
            <Field
              label="Share price"
              type="number"
              step="0.01"
              value={company.share_price ?? ""}
              onChange={(e) =>
                updateCompany(
                  "share_price",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
            <Field
              label="Shares outstanding"
              type="number"
              step="0.01"
              value={company.shares_outstanding ?? ""}
              onChange={(e) =>
                updateCompany(
                  "shares_outstanding",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
            <Field
              label="Statement dates"
              value={company.statement_dates}
              onChange={(e) => updateCompany("statement_dates", e.target.value)}
            />
            <Field
              label="Investment horizon"
              value={company.investment_horizon}
              onChange={(e) =>
                updateCompany("investment_horizon", e.target.value)
              }
            />
            <Field
              label="Required annual return"
              type="number"
              step="0.005"
              value={company.required_return ?? ""}
              onChange={(e) =>
                updateCompany(
                  "required_return",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </div>
          <div className="mt-4">
            <TextArea
              label="Analyst notes"
              value={company.analyst_notes}
              onChange={(e) => updateCompany("analyst_notes", e.target.value)}
            />
          </div>
          <p
            className={`mt-3 text-xs ${persistenceStatus === "error" ? "text-red-300" : "text-mist"}`}
          >
            {persistenceMessage}
          </p>
        </Card>
        <DocumentUpload key={project.id} />
      </div>
      <p className="mt-5">
        <Link href="/financials" className="text-teal underline">
          View financial performance analysis
        </Link>
      </p>
      <label className="mt-4 flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={workspace.settings.persistDocumentText}
          onChange={(e) => void setDocumentRetention(e.target.checked)}
        />{" "}
        Retain source text in this browser for traceability
      </label>
      <Card className="mt-5">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="eyebrow">Document register</p>
            <h2 className="mt-1 text-xl font-semibold">Source Documents</h2>
          </div>
          <span className="text-xs text-mist">
            {workspace.documents.length} source(s)
          </span>
        </div>
        {workspace.documents.length === 0 ? (
          <div className="border border-dashed border-line p-8 text-center text-sm text-mist">
            No documents processed in this workspace.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {workspace.documents.map((document) => (
              <div
                key={document.identifier}
                className="border border-line bg-ink/50 p-4"
              >
                <div className="flex items-start gap-3">
                  {document.name.toLowerCase().endsWith(".pdf") ? (
                    <FileText className="text-gold" />
                  ) : (
                    <FileSpreadsheet className="text-teal" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{document.name}</p>
                    <p className="mt-1 text-xs text-mist">
                      {document.document_type} · {document.pages} page(s) ·{" "}
                      {document.reporting_period || "period not detected"}
                    </p>
                    <p className="mt-2 text-xs">
                      {document.chunks.length} chunks ·{" "}
                      {document.suggestions.length} review suggestions
                    </p>
                  </div>
                  <button
                    aria-label={`Remove ${document.name} and derived data`}
                    onClick={() =>
                      removeDocument(document.identifier, document.name)
                    }
                    className="min-h-10 min-w-10 text-mist hover:text-red-300"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                {document.warning && (
                  <p className="mt-3 border-l-2 border-gold pl-3 text-xs text-amber-100">
                    {document.warning}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="mt-8">
        <FinancialLedger />
        <AssumptionAnalysis />
      </div>
    </>
  );
}
