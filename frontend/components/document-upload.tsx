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
  status: "Waiting" | "Processing" | "Processed" | "Failed";
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
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [project.id],
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
        update(item.id, "Processing");
        try {
          if (item.file.size > 4 * 1024 * 1024)
            throw new Error("File exceeds the 4 MB upload limit.");
          const form = new FormData();
          form.append("file", item.file);
          form.append("currency", currency);
          const result = await apiUpload<ProcessResponse>(
            "/v1/documents/process",
            form,
            { signal },
          );
          if (signal.aborted) return;
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
          update(item.id, "Processed");
        } catch (reason) {
          update(
            item.id,
            "Failed",
            reason instanceof Error ? reason.message : "Upload failed.",
          );
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <Card>
      <h2>Process Financial Documents</h2>
      <p className="my-3 text-sm text-mist">
        PDF, CSV or XLSX · 4 MB and 100 pages per file
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
          disabled={busy || !queue.some((r) => r.status === "Failed")}
          onClick={() =>
            void process(queue.filter((r) => r.status === "Failed"))
          }
        >
          Retry Failed Uploads
        </Button>
      </div>
      <ul aria-live="polite" className="my-3 space-y-2 text-sm">
        {queue.map((row) => (
          <li key={row.id} className="border-b border-line py-2">
            <span className="break-all">{row.file.name}</span> —{" "}
            <span
              className={
                row.status === "Failed"
                  ? "text-red-300"
                  : row.status === "Processed"
                    ? "text-teal"
                    : "text-mist"
              }
            >
              {row.status}
            </span>
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
