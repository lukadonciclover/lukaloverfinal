"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { workflowStatus } from "@/lib/research";
import { useWorkspace } from "@/lib/workspace";

export function GuidedWorkflow() {
  const { workspace, updateWorkspace } = useWorkspace();
  if (!workspace.workflow.active) return null;
  const steps = workflowStatus(workspace);
  const currentIndex = Math.min(Math.max(workspace.workflow.current_step - 1, 0), steps.length - 1);
  const current = steps[currentIndex];
  const completed = steps.filter((step) => step.complete).length;
  const move = (step: number) => updateWorkspace((value) => ({ ...value, workflow: { ...value.workflow, current_step: step } }));
  return <section aria-label="Investment analysis workflow" className="border-b border-line bg-panel/95 px-4 py-3 sm:px-6"><div className="mx-auto max-w-[1560px]"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">New Investment Analysis · Step {currentIndex + 1} of {steps.length}</p><p className="mt-1 text-sm font-semibold">{current.label}</p></div><div className="flex items-center gap-2">{currentIndex > 0 && <Link aria-label="Previous workflow step" href={steps[currentIndex - 1].route} onClick={() => move(currentIndex)} className="inline-flex min-h-10 items-center gap-1 border border-line px-3 text-xs text-mist hover:text-white"><ChevronLeft size={14}/> Previous</Link>}{currentIndex < steps.length - 1 && <Link aria-label="Next workflow step" href={steps[currentIndex + 1].route} onClick={() => move(currentIndex + 2)} className="inline-flex min-h-10 items-center gap-1 border border-gold px-3 text-xs font-semibold text-gold">Next <ChevronRight size={14}/></Link>}<button aria-label="Exit guided workflow" onClick={() => updateWorkspace((value) => ({ ...value, workflow: { ...value.workflow, active: false } }))} className="min-h-10 min-w-10 text-mist hover:text-white"><X size={16}/></button></div></div><div className="mt-3 flex gap-1" aria-label={`${completed} of ${steps.length} workflow steps complete`}>{steps.map((step, index) => <Link key={step.label} href={step.route} onClick={() => move(index + 1)} aria-label={`Step ${index + 1}: ${step.label}${step.complete ? ", complete" : ""}`} className={`h-2 flex-1 ${step.complete ? "bg-teal" : index === currentIndex ? "bg-gold" : "bg-line"}`}/>)}</div>{!current.complete && <p className="mt-2 text-xs text-mist">Required: {current.missing}</p>}</div></section>;
}
