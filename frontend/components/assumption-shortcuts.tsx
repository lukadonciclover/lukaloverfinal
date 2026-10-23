"use client";
import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { settingsFor } from "@/lib/workbench";
import {
  formatFinancialLabel,
  formatFinancialValue,
} from "@/lib/financial-formatting";
import { Button, Field, Select } from "./ui";
import { ConfirmationDialog } from "./confirmation-dialog";
const annual = [
  "revenue_growth",
  "ebit_margin",
  "tax_rate",
  "depreciation_pct_revenue",
  "capex_pct_revenue",
  "nwc_pct_revenue",
] as const;
export function AssumptionShortcuts({ kind }: { kind: "dcf" | "forecast" }) {
  const { project } = useWorkspace();
  return (
    <ProjectAssumptionShortcuts key={`${project.id}:${kind}`} kind={kind} />
  );
}
function ProjectAssumptionShortcuts({ kind }: { kind: "dcf" | "forecast" }) {
  const { workspace, project, updateWorkspace } = useWorkspace();
  const [snapshotProject] = useState(project.id);
  const [snapshotMethod] = useState(
    settingsFor(workspace).profitability_method,
  );
  const [error, setError] = useState("");
  const [saved] = useState(() =>
    structuredClone(
      kind === "dcf" ? workspace.dcfInputs : settingsFor(workspace).forecast,
    ),
  );
  const [field, setField] = useState<(typeof annual)[number]>("revenue_growth"),
    [value, setValue] = useState(""),
    [year, setYear] = useState(2),
    [reset, setReset] = useState<{ project: string; revision: number } | null>(
      null,
    );
  return (
    <div className="my-4 space-y-3 border border-line p-4">
      <h3>Assumption Shortcuts</h3>
      {kind === "dcf" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Assumption to apply"
              value={field}
              onChange={(e) => setField(e.target.value as typeof field)}
            >
              {annual.map((k) => (
                <option key={k} value={k}>
                  {formatFinancialLabel(k)}
                </option>
              ))}
            </Select>
            <Field
              label="Value across years"
              hint="% - Analyst Assumption"
              type="number"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button
              disabled={!value.trim() || !Number.isFinite(Number(value))}
              onClick={() =>
                updateWorkspace((w) => ({
                  ...w,
                  dcfInputs: {
                    ...w.dcfInputs,
                    [field]: w.dcfInputs[field].map(() => Number(value) / 100),
                  },
                }))
              }
            >
              Apply Value Across All Years
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Copy into year"
              value={Math.min(year, workspace.dcfInputs.revenue_growth.length)}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {workspace.dcfInputs.revenue_growth.slice(1).map((_, i) => (
                <option key={i} value={i + 2}>
                  {i + 2}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              onClick={() =>
                updateWorkspace((w) => {
                  const index =
                    Math.min(year, w.dcfInputs.revenue_growth.length) - 1;
                  const d = { ...w.dcfInputs };
                  for (const k of annual)
                    d[k] = d[k].map((v, i) => (i === index ? d[k][i - 1] : v));
                  return { ...w, dcfInputs: d };
                })
              }
            >
              Copy Previous Year
            </Button>
          </div>
        </>
      )}
      {kind === "forecast" && (
        <p className="text-xs text-mist">
          Integrated forecast assumptions already apply across every forecast
          year.
        </p>
      )}
      <Button
        variant="secondary"
        onClick={() =>
          setReset({ project: project.id, revision: workspace.revision })
        }
      >
        Reset to Page-Opening Snapshot
      </Button>
      <p className="text-xs text-mist">
        Restores the values captured when this page was opened, not the latest
        autosave. Changes continue to autosave. Historical financial data is
        unaffected.
      </p>
      {error && <p role="alert">{error}</p>}
      {reset && reset.project === project.id && (
        <ConfirmationDialog
          title="Reset Assumptions"
          confirmLabel="Reset Assumptions"
          onCancel={() => setReset(null)}
          onConfirm={() => {
            if (
              snapshotProject !== project.id ||
              reset.project !== project.id ||
              reset.revision !== workspace.revision
            ) {
              setError(
                "Reset unavailable - the project changed since confirmation. Review the differences again.",
              );
              setReset(null);
              return;
            }
            updateWorkspace((w) =>
              w.revision !== reset.revision
                ? w
                : kind === "dcf"
                  ? {
                      ...w,
                      dcfInputs: structuredClone(saved) as typeof w.dcfInputs,
                    }
                  : {
                      ...w,
                      valuationWorkbench: {
                        ...settingsFor(w),
                        profitability_method: snapshotMethod,
                        forecast: structuredClone(saved) as ReturnType<
                          typeof settingsFor
                        >["forecast"],
                      },
                    },
            );
            setReset(null);
          }}
        >
          <div className="max-h-64 overflow-auto">
            <table>
              <thead>
                <tr>
                  <th>Input</th>
                  <th>Current</th>
                  <th>Page-opening value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(saved)
                  .filter(
                    ([, v]) =>
                      typeof v === "number" || v === null || Array.isArray(v),
                  )
                  .map(([key, value]) => (
                    <tr key={key}>
                      <td>{formatFinancialLabel(key)}</td>
                      <td>
                        {JSON.stringify(
                          (
                            (kind === "dcf"
                              ? workspace.dcfInputs
                              : settingsFor(workspace)
                                  .forecast) as unknown as Record<
                              string,
                              unknown
                            >
                          )[key],
                        )}
                      </td>
                      <td>
                        {Array.isArray(value)
                          ? value
                              .map((v) => formatFinancialValue(key, v))
                              .join(", ")
                          : formatFinancialValue(key, value)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p>
            Replace the current {kind === "dcf" ? "DCF" : "forecast"}{" "}
            assumptions with the snapshot captured on opening this page?
          </p>
        </ConfirmationDialog>
      )}
    </div>
  );
}
