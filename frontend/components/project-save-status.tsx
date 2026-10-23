"use client";
import { useState } from "react";
import { saveBlob } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { Button, Notice } from "@/components/ui";
export function ProjectSaveStatus() {
  const {
    workspace,
    project,
    persistenceStatus,
    persistenceMessage,
    exportWorkspace,
    projectMessage,
    dismissProjectMessage,
  } = useWorkspace();
  const [dismissed, setDismissed] = useState(false);
  const [backedUp, setBackedUp] = useState<number | null>(null);
  const label =
    persistenceStatus === "saving" || persistenceStatus === "loading"
      ? "Saving"
      : persistenceStatus === "error"
        ? /unavailable|denied/i.test(persistenceMessage)
          ? "Storage Unavailable"
          : "Save Failed"
        : "Saved Locally";
  const meaningful =
    workspace.figures.length > 0 ||
    workspace.documents.length > 0 ||
    workspace.company.name !== "Untitled company";
  const reminder = meaningful && !dismissed && backedUp !== workspace.revision;
  function backup() {
    saveBlob(
      new Blob([exportWorkspace()], { type: "application/json" }),
      "equitylens-project.json",
    );
    setBackedUp(workspace.revision);
    setDismissed(true);
  }
  return (
    <div className="mb-5">
      {projectMessage && (
        <Notice kind="success">
          {projectMessage}{" "}
          <Button variant="secondary" onClick={dismissProjectMessage}>
            Dismiss
          </Button>
        </Notice>
      )}
      <p
        aria-live="polite"
        title={persistenceMessage}
        className="mb-2 text-xs text-mist"
      >
        {label} · {project.name}
        {persistenceStatus === "saved" || persistenceStatus === "local-only"
          ? ` · Project updated ${new Date(project.updated_at).toLocaleString()}`
          : ""}
      </p>
      {(reminder || persistenceStatus === "error") && (
        <Notice kind={persistenceStatus === "error" ? "error" : "info"}>
          {persistenceStatus === "error"
            ? persistenceMessage
            : "Your project is stored in this browser and is not synchronized across devices. Export a backup to preserve it outside this device."}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={backup}>
              Export Project Backup
            </Button>
            {persistenceStatus !== "error" && (
              <Button variant="secondary" onClick={() => setDismissed(true)}>
                Dismiss Reminder
              </Button>
            )}
          </div>
        </Notice>
      )}
    </div>
  );
}
