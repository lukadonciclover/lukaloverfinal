"use client";
import { useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/lib/workspace";
import {
  unresolvedSources,
  resolveRemovedSource,
} from "@/lib/source-dependencies";
import { currentValue, targetLabel } from "@/lib/assumptions";
import { Button, Notice } from "./ui";
import { ConfirmationDialog } from "./confirmation-dialog";

export function SourceReview() {
  const { workspace: w, project, updateWorkspace } = useWorkspace();
  const [confirm, setConfirm] = useState<{
    id: string;
    project: string;
    revision: number;
    action: "keep" | "clear";
  } | null>(null);
  const [error, setError] = useState("");
  const rows = unresolvedSources(w);
  return (
    <div className="my-4 space-y-3">
      {error && <Notice kind="error">{error}</Notice>}
      {rows.map((a) => (
        <Notice kind="warning" key={a.id}>
          <p>
            {targetLabel(a.target)}: {String(currentValue(w, a.target))}. Source
            document removed - assumption requires review.
          </p>
          <p>
            Original source: {a.source.document_name}; adopted {a.accepted_at}.
          </p>
          <Button
            variant="secondary"
            onClick={() =>
              setConfirm({
                id: a.id,
                project: project.id,
                revision: w.revision,
                action: "keep",
              })
            }
          >
            Keep as Reviewed Analyst Assumption
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              setConfirm({
                id: a.id,
                project: project.id,
                revision: w.revision,
                action: "clear",
              })
            }
          >
            Clear Affected Input
          </Button>
          <Link
            className="ml-3 underline"
            href="/workspace#assumption-analysis"
          >
            Replace using a new reviewed source
          </Link>
        </Notice>
      ))}
      {confirm && confirm.project === project.id && (
        <ConfirmationDialog
          title="Resolve removed-source assumption"
          confirmLabel="Confirm Resolution"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (
              confirm.project !== project.id ||
              confirm.revision !== w.revision
            ) {
              setError("Project changed; review a fresh confirmation.");
              setConfirm(null);
              return;
            }
            try {
              updateWorkspace((value) =>
                resolveRemovedSource(
                  value,
                  confirm.id,
                  confirm.action,
                  confirm.revision,
                ),
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "Resolution failed");
            }
            setConfirm(null);
          }}
        >
          <p>
            {confirm.action === "keep"
              ? "Retain the current numerical value as your explicitly reviewed analyst assumption? Its original source remains recorded as removed."
              : "Clear only this affected model input? Its adoption audit history will be preserved."}
          </p>
        </ConfirmationDialog>
      )}
    </div>
  );
}
