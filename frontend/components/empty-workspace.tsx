"use client";
import { CreateProjectForm } from "@/components/create-project-form";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProjectPortfolio } from "@/lib/workspace";
import { Button, Card, Field, Notice, PageHeader } from "@/components/ui";

export function EmptyWorkspace() {
  const {
    projects,
    restoreProject,
    switchProject,
    createProject,
    importWorkspace,
    persistenceStatus,
    persistenceMessage,
  } = useProjectPortfolio();
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <>
      <PageHeader title="Dashboard" />
      {persistenceStatus === "error" && (
        <Notice kind="error">{persistenceMessage}</Notice>
      )}
      <Card>
        <p className="mb-4 text-sm text-mist">No valuation projects yet.</p>
        <CreateProjectForm />
        <label className="mt-4 block text-sm text-mist">
          Import project
          <input
            aria-label="Import project"
            type="file"
            accept=".json"
            className="mt-2 block"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                importWorkspace(await file.text());
                router.push("/workspace");
              } catch (reason) {
                setError(
                  reason instanceof Error ? reason.message : "Import failed.",
                );
              }
            }}
          />
        </label>
        {projects
          .filter((project) => project.archived)
          .map((project) => (
            <Button
              key={project.id}
              variant="secondary"
              onClick={() => {
                restoreProject(project.id);
                switchProject(project.id);
              }}
            >
              Restore {project.name}
            </Button>
          ))}
        {error && <Notice kind="error">{error}</Notice>}
      </Card>
    </>
  );
}
