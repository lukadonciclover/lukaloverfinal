"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProjectPortfolio } from "@/lib/workspace";
import { Button, Field, Notice } from "@/components/ui";
export function CreateProjectForm() {
  const { createProject } = useProjectPortfolio();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  function close() {
    setOpen(false);
    setName("");
    setError("");
    requestAnimationFrame(() =>
      container.current?.querySelector<HTMLButtonElement>("button")?.focus(),
    );
  }
  return (
    <div ref={container} className="max-w-sm">
      {!open ? (
        <Button onClick={() => setOpen(true)}>Create Project</Button>
      ) : (
        <form
          aria-label="Create project"
          noValidate
          className="space-y-3 rounded border border-line bg-panel p-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) {
              setError("Enter a project name.");
              return;
            }
            if (trimmed.length > 300) {
              setError("Project names must be 300 characters or fewer.");
              return;
            }
            try {
              createProject(trimmed);
              close();
              router.push("/workspace");
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Could not create project.",
              );
            }
          }}
        >
          <Field
            label="Project Name"
            placeholder="Enter project name"
            autoFocus
            required
            maxLength={300}
            value={name}
            aria-invalid={!!error}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
          />
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit">Create Project</Button>
          </div>
        </form>
      )}
    </div>
  );
}
