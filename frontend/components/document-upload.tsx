"use client";
import { useEffect, useRef, useState } from "react";
import { apiUpload } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { ensureRecordIds } from "@/lib/bulk-approval";
import type { DocumentRecord } from "@/lib/types";
import { Button, Card, Notice } from "./ui";
type UploadItem = {
  id: string;
  file: File;
  status:
    | "Waiting"
    | "Uploading"
    | "Processing"
    | "Processed"
    | "Failed"
    | "Cancelled";
  warning?: string;
  error?: string;
};
type ProcessResponse = {
  assumptions?: import("@/lib/assumptions").Assumption[];
  document: Omit<DocumentRecord, "chunks" | "suggestions">;
  chunks: DocumentRecord["chunks"];
  suggestions: DocumentRecord["suggestions"];
};
export function DocumentUpload() {
  const { workspace, project, updateWorkspace } = useWorkspace();
  const known = useRef(new Set(workspace.documents.map((d) => d.identifier)));
  useEffect(() => {
    known.current = new Set(workspace.documents.map((d) => d.identifier));
  }, [workspace.documents]);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [project.id, workspace.company.currency],
  );
  const [queue, setQueue] = useState<UploadItem[]>([]),
    [busy, setBusy] = useState(false);
  const busyRef = useRef(false),
    input = useRef<HTMLInputElement>(null);
  async function process(items: UploadItem[]) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const currency = workspace.company.currency;
    request.current = new AbortController();
    const signal = request.current.signal;
    const update = (id: string, status: UploadItem["status"], error?: string) =>
      setQueue((old) =>
        old.map((row) => (row.id === id ? { ...row, status, error } : row)),
      );
    try {
      for (const item of items) {
        if (signal.aborted) break;
        update(item.id, "Uploading");
        try {
          if (!/\.(pdf|csv|xlsx)$/i.test(item.file.name))
            throw new Error(
              "Unsupported file format. Choose PDF, CSV, or XLSX.",
            );
          if (!item.file.size)
            throw new Error(
              "The file is empty. Choose a readable financial document.",
            );
          if (item.file.size > 4 * 1024 * 1024)
            throw new Error(
              "This file exceeds the current 4 MB upload limit. Save relevant pages as a smaller PDF, or upload financial tables as CSV/XLSX.",
            );
          const form = new FormData();
          form.append("file", item.file);
          form.append("currency", currency);
          const result = await apiUpload<ProcessResponse>(
            "/v1/documents/process",
            form,
            {
              signal,
              onUploaded: () => {
                if (!signal.aborted) update(item.id, "Processing");
              },
            },
          );
          if (signal.aborted) return;
          if (known.current.has(result.document.identifier)) {
            update(
              item.id,
              "Processed",
              "Duplicate document identified. Existing approved data and review decisions preserved.",
            );
            continue;
          }
          known.current.add(result.document.identifier);
          updateWorkspace((w) =>
            w.company.currency !== currency
              ? w
              : w.documents.some(
                    (d) => d.identifier === result.document.identifier,
                  )
                ? {
                    ...w,
                    assumptions: [
                      ...(w.assumptions ?? []),
                      ...(result.assumptions ?? []).filter(
                        (a) => !w.assumptions?.some((old) => old.id === a.id),
                      ),
                    ],
                  }
                : ensureRecordIds({
                    ...w,
                    assumptions: [
                      ...(w.assumptions ?? []),
                      ...(result.assumptions ?? []).filter(
                        (a) => !w.assumptions?.some((old) => old.id === a.id),
                      ),
                    ],
                    documents: [
                      ...w.documents,
                      {
                        ...result.document,
                        chunks: result.chunks,
                        suggestions: result.suggestions,
                      },
                    ],
                  }),
          );
          update(item.id, "Processed", result.document.warning);
        } catch (reason) {
          update(
            item.id,
            signal.aborted ? "Cancelled" : "Failed",
            reason instanceof Error ? reason.message : "Upload failed.",
          );
        }
      }
    } finally {
      if (signal.aborted)
        setQueue((old) =>
          old.map((row) =>
            items.some((i) => i.id === row.id) &&
            ["Waiting", "Uploading", "Processing"].includes(row.status)
              ? {
                  ...row,
                  status: "Cancelled",
                  error: "Upload cancelled. Retry to continue.",
                }
              : row,
          ),
        );
      busyRef.current = false;
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <Card>
      <h2>Process Financial Documents</h2>
      <p className="my-3 text-sm text-mist">
        PDF, CSV or XLSX · 4 MB and 100 pages per file. For large annual
        reports, save relevant pages as a smaller PDF and record original page
        numbers in analyst notes, or upload financial tables separately. Only
        the uploaded scope is extracted.
      </p>
      <input
        ref={input}
        aria-label="Upload financial documents"
        className="block max-w-full text-sm"
        type="file"
        accept=".pdf,.csv,.xlsx"
        multiple
        disabled={busy}
        onChange={(e) => {
          const items = Array.from(e.target.files ?? []).map((file) => ({
            id: crypto.randomUUID(),
            file,
            status: "Waiting" as const,
          }));
          setQueue((old) => [...old, ...items]);
          void process(items);
        }}
      />
      <div className="my-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Select documents
        </Button>
        <Button
          disabled={
            busy ||
            !queue.some(
              (r) => r.status === "Failed" || r.status === "Cancelled",
            )
          }
          onClick={() =>
            void process(
              queue.filter(
                (r) => r.status === "Failed" || r.status === "Cancelled",
              ),
            )
          }
        >
          Retry Failed Uploads
        </Button>
        <Button
          variant="secondary"
          disabled={!busy}
          onClick={() => request.current?.abort()}
        >
          Cancel Queue
        </Button>
      </div>
      {queue.length > 0 && (
        <div className="my-3">
          <p className="text-sm">
            Queue completion:{" "}
            {
              queue.filter((r) =>
                ["Processed", "Failed", "Cancelled"].includes(r.status),
              ).length
            }{" "}
            / {queue.length}
          </p>
          <progress
            aria-label="Queue completion"
            className="w-full"
            value={
              queue.filter((r) =>
                ["Processed", "Failed", "Cancelled"].includes(r.status),
              ).length
            }
            max={queue.length}
          />
        </div>
      )}
      <ul aria-live="polite" className="my-3 space-y-2 text-sm">
        {queue.map((row) => (
          <li key={row.id} className="border-b border-line py-2">
            <span className="break-all">
              {row.file.name} · {(row.file.size / 1024).toFixed(1)} KB
            </span>{" "}
            —{" "}
            <span
              className={
                row.status === "Failed"
                  ? "text-red-300"
                  : row.status === "Processed"
                    ? "text-teal"
                    : "text-mist"
              }
            >
              {row.status === "Processed"
                ? "Processed Successfully"
                : row.status}
            </span>
            {row.status === "Processing" && (
              <div>
                <progress aria-label={`Processing ${row.file.name}`} />
                <p className="text-xs text-mist">
                  Extracting financial text. Processing progress is unavailable.
                </p>
              </div>
            )}
            {row.status === "Uploading" && (
              <p className="text-xs text-mist">
                Transferring file to the document processor.
              </p>
            )}
            {row.error && <p>{row.error}</p>}
          </li>
        ))}
      </ul>
      <Notice>
        Uploaded files are processed without application-level server retention.
        Extracted source text is saved in this browser only when source-text
        retention is enabled.
      </Notice>
    </Card>
  );
}
