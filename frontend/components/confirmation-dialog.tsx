"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./ui";
export function ConfirmationDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  disabled = false,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.close) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="fixed inset-0 m-auto max-h-[90vh] w-[min(38rem,95vw)] overflow-auto rounded border border-line bg-panel p-6 text-slate-100 shadow-xl backdrop:bg-black/70"
    >
      <h2>{title}</h2>
      <div className="my-4 space-y-3">{children}</div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" autoFocus onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={disabled} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
