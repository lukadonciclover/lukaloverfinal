"use client";
import { previewPeers, importNewPeers } from "@/lib/peer-import";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { AssumptionNumber } from "@/components/assumption-number";
import { assumptionStatus } from "@/lib/assumption-status";
import { HistoricalReferenceControls } from "@/components/historical-reference-controls";
import { historicalLabel } from "@/lib/historical-references";
import { assumptionExport } from "@/lib/assumptions";
import { AssumptionShortcuts } from "@/components/assumption-shortcuts";
import { CreateProjectForm } from "@/components/create-project-form";
import { FinancialDataTable } from "@/components/financial-data-table";
import { FinancialChartTooltip } from "@/components/financial-chart";
import {
  formatFinancialLabel,
  formatFinancialValue,
  formatFinancialMessage,
  financialInputHint,
} from "@/lib/financial-formatting";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiDownload, apiUpload, saveBlob } from "@/lib/api";
import {
  previewProjectBackup,
  persistenceCopy,
  useWorkspace,
} from "@/lib/workspace";
import {
  payloadFor,
  settingsFor,
  profitabilityMethod,
  type PeerInput,
  type WorkbenchResult,
  type ModelOutput,
} from "@/lib/workbench";
import { Button, Card, Field, Notice, PageHeader } from "@/components/ui";

import { ForecastComparison } from "@/components/forecast-comparison";
import { ValuationReadiness } from "@/components/valuation-readiness";
import { workbookFingerprint } from "@/lib/export-fingerprint";
import { useModel } from "@/lib/use-model";
const label = formatFinancialLabel;
const DataTable = FinancialDataTable;
function Errors({
  result,
  error,
  loading,
  retry,
}: {
  result: WorkbenchResult | null;
  error: string;
  loading?: boolean;
  retry?: () => void;
}) {
  return (
    <div className="my-4 space-y-2" aria-live="polite">
      {loading && <Notice>Calculating current financial inputs…</Notice>}
      {error && (
        <Notice kind="error">
          {formatFinancialMessage(error)}{" "}
          {retry && (
            <Button variant="secondary" onClick={retry}>
              Retry Calculation
            </Button>
          )}
        </Notice>
      )}
      {Object.entries(result?.errors ?? {}).map(([k, v]) => (
        <Notice kind="warning" key={k}>
          {label(k)}: {formatFinancialMessage(v)}
        </Notice>
      ))}
    </div>
  );
}
function NumberInputs<T extends object>({
  values,
  change,
  omit = [],
  group,
}: {
  values: T;
  change: (key: keyof T, value: number | null) => void;
  omit?: string[];
  group?: string;
}) {
  const { workspace, updateWorkspace } = useWorkspace();
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Object.entries(values)
        .filter(
          ([k, v]) =>
            !omit.includes(k) && (typeof v === "number" || v === null),
        )
        .map(([k, v]) => (
          <AssumptionNumber
            key={k}
            id={`assumption-${group}-${k}`}
            metric={k}
            label={label(k)}
            value={v}
            onValue={(value) => {
              change(k as keyof T, value);
              if (group)
                updateWorkspace((w) => ({
                  ...w,
                  valuationWorkbench: {
                    ...settingsFor(w),
                    edited_inputs: [
                      ...new Set([
                        ...(settingsFor(w).edited_inputs ?? []),
                        `${group}.${k}`,
                      ]),
                    ],
                  },
                }));
            }}
            disabled={
              group === "forecast" &&
              ((k === "opex_ratio" &&
                profitabilityMethod(settingsFor(workspace)) === "ebitda") ||
                (k === "ebitda_margin" &&
                  profitabilityMethod(settingsFor(workspace)) === "opex"))
            }
            hint={
              group
                ? assumptionStatus(workspace, `${group}.${k}`)
                : v === null
                  ? "Missing Supporting Data - enter a reviewed value"
                  : "Analyst Assumption - editable model input"
            }
          />
        ))}
    </div>
  );
}
export function ValuationDashboard() {
  const { workspace, projects, persistenceStatus } = useWorkspace();
  return (
    <>
      <PageHeader
        kicker="Equity Lens"
        title="Dashboard"
        actions={<CreateProjectForm />}
      />
      <ValuationReadiness />
      <div className="grid gap-5 md:grid-cols-3">
        {[
          [
            "Historical periods",
            String(new Set(workspace.figures.map((f) => f.period)).size),
          ],
          ["Historical figures", String(workspace.figures.length)],
          ["Project storage", persistenceStatus],
        ].map(([k, v]) => (
          <Card key={k}>
            <p className="eyebrow">{k}</p>
            <p className="mt-3 text-2xl">{v}</p>
          </Card>
        ))}
      </div>
      {!workspace.figures.length && (
        <p className="my-4 text-sm text-mist">No financial data available</p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {[
          ["workspace", "Financial Data"],
          ["financials", "Financial Analysis"],
          ["forecasting", "Forecasting"],
          ["valuation", "Valuation Models"],
          ["report", "Results & Export"],
        ].map(([href, title]) => (
          <Link
            key={href}
            href={`/${href}`}
            className="border border-line px-4 py-2 text-sm hover:border-gold"
          >
            {title}
          </Link>
        ))}
      </div>
      <p className="mt-5 text-sm text-mist">
        {projects.length} browser-local projects. Export a project backup to
        move it between browsers.
      </p>
    </>
  );
}
export function ForecastingPage() {
  const { settings: s, update, result, error, loading, retry } = useModel();
  return (
    <>
      <PageHeader
        kicker="Forecasting"
        title="Forecasting"
        description="Rate inputs are percentages. Monetary inputs and outputs use actual currency units."
      />
      <details className="mb-5">
        <summary className="cursor-pointer font-semibold">
          Historical References & Assumption Adoption
        </summary>
        <HistoricalReferenceControls scope="forecast" />
      </details>
      <details open className="mb-5">
        <summary className="cursor-pointer font-semibold">
          Forecast Configuration
        </summary>
        <Card>
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={s.enabled.forecast}
              onChange={(e) =>
                update((v) => ({
                  ...v,
                  enabled: { ...v.enabled, forecast: e.target.checked },
                }))
              }
            />{" "}
            Enable integrated forecast and link it to DCF
          </label>
          <label className="my-4 block">
            Profitability Forecast Method
            <select
              className="field mt-2"
              value={profitabilityMethod(s)}
              onChange={(e) =>
                update((v) => ({
                  ...v,
                  profitability_method: e.target.value as "ebitda" | "opex",
                }))
              }
            >
              <option value="ebitda">Use EBITDA Margin</option>
              <option value="opex">Use Operating Expenses / Revenue</option>
            </select>
          </label>
          <div className="my-5 flex gap-6">
            <label>
              Horizon
              <select
                className="field ml-3"
                value={s.forecast.horizon}
                onChange={(e) =>
                  update((v) => ({
                    ...v,
                    forecast: {
                      ...v.forecast,
                      horizon: Number(e.target.value) as 3 | 5 | 10,
                    },
                  }))
                }
              >
                {[3, 5, 10].map((y) => (
                  <option key={y} value={y}>
                    {y} years
                  </option>
                ))}
              </select>
            </label>
            <label>
              Financing
              <select
                className="field ml-3"
                value={s.forecast.financing}
                onChange={(e) =>
                  update((v) => ({
                    ...v,
                    forecast: {
                      ...v.forecast,
                      financing: e.target.value as "revolver" | "none",
                    },
                  }))
                }
              >
                <option value="revolver">Revolver to minimum cash</option>
                <option value="none">No balancing financing</option>
              </select>
            </label>
          </div>
          <Link
            className="my-3 inline-block text-teal"
            href="/workspace#assumption-analysis"
          >
            Review document assumptions
          </Link>
        </Card>
      </details>
      <details open className="mb-5">
        <summary className="cursor-pointer font-semibold">
          Operating Assumptions
        </summary>
        <Card>
          <AssumptionShortcuts kind="forecast" />
          <NumberInputs
            group="forecast"
            values={s.forecast}
            omit={["horizon"]}
            change={(k, v) =>
              update((a) => ({ ...a, forecast: { ...a.forecast, [k]: v } }))
            }
          />
          <p className="mt-4 text-sm text-mist">
            The selected profitability method controls EBITDA. Operating
            expenses must exclude depreciation, which is deducted separately.
            Other assets and non-debt liabilities remain constant. NWC
            represents net operating assets. Interest uses opening debt;
            revolver draws occur at year-end. Missing opening balances block the
            forecast.
          </p>
        </Card>
      </details>
      <ForecastComparison />
      <Errors result={result} loading={loading} retry={retry} error={error} />
      <details className="mb-5">
        <summary className="cursor-pointer font-semibold">
          Historical Actuals
        </summary>
        <Card>
          <h2>Historical Actuals</h2>
          <DataTable
            rows={Object.entries(result?.history ?? {}).map(
              ([period, row]) => ({
                period,
                ...row,
              }),
            )}
          />
        </Card>
      </details>
      <details open>
        <summary className="cursor-pointer font-semibold">
          Projected Financial Statements
        </summary>
        <Card className="mt-5">
          <h2 className="text-teal">
            Projected income, balance sheet and cash flow statements
          </h2>
          <DataTable
            rows={result?.forecast ?? []}
            caption="Forecast outputs - calculated from user-entered assumptions"
          />
        </Card>
      </details>
      {!!result?.forecast.length && (
        <Link
          href="/valuation"
          className="mt-4 block text-sm text-teal underline"
        >
          Continue to Valuation Models
        </Link>
      )}
    </>
  );
}
function PeerEditor({
  rows,
  currency,
  transactions,
  change,
}: {
  rows: PeerInput[];
  currency: string;
  transactions: boolean;
  change: (rows: PeerInput[]) => void;
}) {
  const { project, workspace } = useWorkspace();
  const latest = useRef({ id: project.id, revision: workspace.revision });
  latest.current = { id: project.id, revision: workspace.revision };
  const controller = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    revision: number;
    rows: PeerInput[];
  } | null>(null);
  const [replacement, setReplacement] = useState<number | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [project.id],
  );
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const visible = (row: PeerInput) =>
    row.company.toLowerCase().includes(query.toLowerCase());
  const numeric = [
    "unit_scale",
    "market_cap",
    "enterprise_value",
    "debt",
    "cash",
    "revenue",
    "ebitda",
    "ebit",
    "net_income",
    "book_equity",
  ] as const;
  const edit = (i: number, k: keyof PeerInput, value: unknown) =>
    change(
      rows.map((r, n) =>
        n === i
          ? {
              ...r,
              [k]: value,
              ...(k !== "selected" && k !== "basis_reviewed"
                ? { basis_reviewed: false }
                : {}),
            }
          : r,
      ),
    );
  async function upload(file: File | undefined) {
    if (!file) return;
    try {
      controller.current?.abort();
      controller.current = new AbortController();
      const signal = controller.current.signal,
        captured = { ...latest.current };
      const form = new FormData();
      form.append("file", file);
      const data = await apiUpload<{ rows: PeerInput[] }>(
        "/v1/workbench/import-peers",
        form,
        { signal },
      );
      if (signal.aborted || latest.current.id !== captured.id) return;
      if (latest.current.revision !== captured.revision) {
        setError(
          "Project changed during import; upload again for a fresh preview.",
        );
        return;
      }
      setPreview({ ...captured, rows: data.rows });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
  }
  return (
    <>
      {preview && (
        <Card className="mb-4">
          <h3>Import preview</h3>
          <p>
            New records are imported unselected. Duplicates and conflicts
            require review; existing rows are preserved.
          </p>
          {previewPeers(rows, preview.rows, transactions).map((r, i) => (
            <div key={i} className="my-2">
              <span>
                {r.row.company}: {r.status} -{" "}
                {r.row.financial_period || "period missing"},{" "}
                {r.row.reporting_basis || "unverified"}
              </span>
              <details>
                <summary>Inspect imported values</summary>
                <pre className="max-h-48 overflow-auto">
                  {JSON.stringify(r.row, null, 2)}
                </pre>
              </details>
              {r.status === "conflict" && (
                <Button variant="secondary" onClick={() => setReplacement(i)}>
                  Review Conflict / Use Imported Record
                </Button>
              )}
            </div>
          ))}
          <Button
            onClick={() => {
              if (
                latest.current.id !== preview.id ||
                latest.current.revision !== preview.revision
              ) {
                setError("Project changed; upload again for a fresh preview.");
                setPreview(null);
                return;
              }
              change(importNewPeers(rows, preview.rows, transactions));
              setPreview(null);
            }}
          >
            Import New Records / Skip Duplicates
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setPreview(null);
              setReplacement(null);
            }}
          >
            Cancel Import
          </Button>
        </Card>
      )}
      {preview && replacement !== null && (
        <ConfirmationDialog
          title="Replace existing observation?"
          confirmLabel="Replace Reviewed Record"
          onCancel={() => setReplacement(null)}
          onConfirm={() => {
            if (
              latest.current.id !== preview.id ||
              latest.current.revision !== preview.revision
            ) {
              setError("Project changed; review a fresh import.");
              setReplacement(null);
              setPreview(null);
              return;
            }
            const item = previewPeers(rows, preview.rows, transactions)[
              replacement
            ];
            if (item.existingIndex >= 0)
              change(
                rows.map((r, i) =>
                  i === item.existingIndex
                    ? { ...item.row, selected: false, basis_reviewed: false }
                    : r,
                ),
              );
            else
              change([
                ...rows,
                { ...item.row, selected: false, basis_reviewed: false },
              ]);
            setReplacement(null);
            setPreview(null);
          }}
        >
          <p>
            Use these imported values for this observation, replacing its
            existing record if present? It will be unselected and require basis
            review.
          </p>
          <pre className="max-h-64 overflow-auto">
            {JSON.stringify(
              {
                existing:
                  rows[
                    previewPeers(rows, preview.rows, transactions)[replacement]
                      .existingIndex
                  ],
                imported: preview.rows[replacement],
              },
              null,
              2,
            )}
          </pre>
        </ConfirmationDialog>
      )}
      <div className="my-4 flex flex-wrap gap-4">
        <Button
          variant="secondary"
          onClick={() =>
            change([
              ...rows,
              {
                company: "",
                selected: true,
                currency,
                unit_scale: 1,
                acquisition_date: "",
                market_cap: null,
                enterprise_value: null,
                debt: null,
                cash: null,
                revenue: null,
                ebitda: null,
                ebit: null,
                net_income: null,
                book_equity: null,
              },
            ])
          }
        >
          Add {transactions ? "transaction" : "peer"}
        </Button>
        <label>
          Import CSV / XLSX
          <input
            className="ml-3"
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
      </div>
      <div className="my-3 flex flex-wrap gap-2">
        <Field
          label="Filter companies"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() => change(rows.map((r) => ({ ...r, selected: true })))}
        >
          Select All
        </Button>
        <Button
          variant="secondary"
          onClick={() => change(rows.map((r) => ({ ...r, selected: false })))}
        >
          Deselect All
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            change(rows.map((r) => (visible(r) ? { ...r, selected: true } : r)))
          }
        >
          Select Visible
        </Button>
        <Button
          variant="danger"
          disabled={!rows.some((r) => r.selected)}
          onClick={() => {
            if (
              window.confirm(
                `Remove ${rows.filter((r) => r.selected).length} selected ${transactions ? "transactions" : "peers"}?`,
              )
            )
              change(rows.filter((r) => !r.selected));
          }}
        >
          Bulk Remove Selected
        </Button>
        <p className="text-sm text-mist">
          {rows.filter((r) => r.selected).length} selected / {rows.length}{" "}
          records
        </p>
      </div>
      {error && <Notice kind="error">{formatFinancialMessage(error)}</Notice>}
      <p className="text-xs text-mist">
        Import columns match this table with underscores. Currency and
        unit_scale are mandatory. Review imported rows before inclusion.
      </p>
      <div className="table-wrap mt-4">
        <table className="data-table">
          <thead>
            <tr>
              <th>Include</th>
              <th>Company</th>
              <th>Currency</th>
              <th>Identity and reporting basis</th>
              {transactions && <th>Acquisition date</th>}
              {numeric.map((k) => (
                <th key={k}>{label(k)}</th>
              ))}
              <th>Remove</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) =>
              visible(r) ? (
                <tr key={i}>
                  <td>
                    <input
                      aria-label={`Include row ${i + 1}`}
                      type="checkbox"
                      checked={r.selected}
                      onChange={(e) => edit(i, "selected", e.target.checked)}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Company row ${i + 1}`}
                      className="field w-40"
                      value={r.company}
                      onChange={(e) => edit(i, "company", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Currency row ${i + 1}`}
                      className="field w-20"
                      value={r.currency}
                      onChange={(e) =>
                        edit(i, "currency", e.target.value.toUpperCase())
                      }
                    />
                  </td>
                  <td className="min-w-56">
                    {(
                      [
                        "company_id",
                        "ticker",
                        "exchange",
                        "financial_period",
                        "period_end",
                        "measurement_date",
                        ...(transactions ? ["transaction_id", "acquirer"] : []),
                      ] as const
                    ).map((k) => (
                      <Field
                        key={k}
                        label={`${label(k)} row ${i + 1}`}
                        type={
                          k.endsWith("date") || k === "period_end"
                            ? "date"
                            : "text"
                        }
                        value={
                          (r as unknown as Record<string, string>)[k] ?? ""
                        }
                        onChange={(e) => {
                          edit(i, k as keyof PeerInput, e.target.value);
                        }}
                      />
                    ))}
                    <label>
                      Reporting basis
                      <select
                        className="field"
                        aria-label={`Reporting basis row ${i + 1}`}
                        value={r.reporting_basis ?? "unverified"}
                        onChange={(e) =>
                          edit(i, "reporting_basis", e.target.value)
                        }
                      >
                        {["unverified", "annual", "ttm", "forward"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <input
                        aria-label={`Confirm reporting basis row ${i + 1}`}
                        type="checkbox"
                        checked={r.basis_reviewed ?? false}
                        onChange={(e) =>
                          edit(i, "basis_reviewed", e.target.checked)
                        }
                      />{" "}
                      Reviewed complete annual / TTM / forward denominator and
                      dates
                    </label>
                  </td>
                  {transactions && (
                    <td>
                      <input
                        aria-label={`Date row ${i + 1}`}
                        type="date"
                        className="field"
                        value={r.acquisition_date}
                        onChange={(e) =>
                          edit(i, "acquisition_date", e.target.value)
                        }
                      />
                    </td>
                  )}
                  {numeric.map((k) => (
                    <td key={k}>
                      <input
                        aria-label={`${label(k)} row ${i + 1}`}
                        className="field w-28"
                        type="number"
                        step="any"
                        value={r[k] ?? ""}
                        onChange={(e) =>
                          edit(
                            i,
                            k,
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      aria-label={`Remove row ${i + 1}`}
                      onClick={() => change(rows.filter((_, n) => n !== i))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function ModelsPage() {
  const {
    workspace,
    updateWorkspace,
    settings: s,
    update,
    result,
    error,
    loading,
    retry,
  } = useModel();
  const [tab, setTab] = useState<
    "dcf" | "peers" | "transactions" | "ddm" | "assets"
  >("dcf");
  useEffect(() => {
    const sync = () => {
      const value = location.hash.slice(1);
      if (["dcf", "peers", "transactions", "ddm", "assets"].includes(value))
        setTab(value as typeof tab);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const annual = [
    "revenue_growth",
    "ebit_margin",
    "tax_rate",
    "depreciation_pct_revenue",
    "capex_pct_revenue",
    "nwc_pct_revenue",
  ] as const;
  return (
    <>
      <PageHeader
        kicker="Valuation models"
        title="Valuation Models"
        description="Independent models. Money in actual currency units; diluted shares in actual shares. Rate inputs are percentages."
      />
      <Link
        className="mb-3 inline-block text-teal"
        href="/workspace#assumption-analysis"
      >
        Review document assumptions
      </Link>
      <HistoricalReferenceControls scope="valuation" />
      <Card className="mb-4">
        <h2>Comparable and transaction target basis</h2>
        <label>
          Target financial basis
          <select
            className="field"
            value={s.relative_basis ?? "annual"}
            onChange={(e) =>
              update((v) => ({
                ...v,
                relative_basis: e.target.value as "annual" | "ttm" | "forward",
              }))
            }
          >
            <option value="annual">Latest annual</option>
            <option value="ttm">Verified trailing twelve months</option>
            <option value="forward">Reviewed forward annual forecast</option>
          </select>
        </label>
        <p className="text-sm text-mist">
          Selected peer multiples must use the same basis. Quarterly earnings
          are never treated as annual. P/B uses a dated balance-sheet
          observation.
        </p>
        {s.relative_basis === "forward" && (
          <div className="grid gap-3 sm:grid-cols-3">
            {(["period", "balance_date"] as const).map((k) => (
              <Field
                key={k}
                label={`Forward ${label(k)}`}
                type={k === "balance_date" ? "date" : "text"}
                value={s.forward_target?.[k] ?? ""}
                onChange={(e) =>
                  update((v) => ({
                    ...v,
                    forward_target: {
                      reviewed: false,
                      currency: workspace.company.currency,
                      period: "",
                      balance_date: "",
                      metrics: {},
                      ...v.forward_target,
                      [k]: e.target.value,
                    },
                  }))
                }
              />
            ))}
            {["revenue", "ebitda", "ebit", "net_income", "total_equity"].map(
              (k) => (
                <Field
                  key={k}
                  label={`Forward ${label(k)} (actual units)`}
                  type="number"
                  step="any"
                  value={s.forward_target?.metrics[k] ?? ""}
                  onChange={(e) =>
                    update((v) => {
                      const f = {
                        reviewed: false,
                        currency: workspace.company.currency,
                        period: "",
                        balance_date: "",
                        metrics: {},
                        ...v.forward_target,
                      };
                      const metrics = { ...f.metrics };
                      if (e.target.value === "") delete metrics[k];
                      else metrics[k] = Number(e.target.value);
                      return {
                        ...v,
                        forward_target: { ...f, metrics, reviewed: false },
                      };
                    })
                  }
                />
              ),
            )}
            <label>
              <input
                type="checkbox"
                checked={s.forward_target?.reviewed ?? false}
                onChange={(e) =>
                  update((v) => ({
                    ...v,
                    forward_target: {
                      currency: workspace.company.currency,
                      period: "",
                      balance_date: "",
                      metrics: {},
                      ...v.forward_target,
                      reviewed: e.target.checked,
                    },
                  }))
                }
              />{" "}
              Reviewed forward annual values and compatible forward peer basis
            </label>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="mb-4">Equity bridge and market reference</h2>
        <NumberInputs
          group="settings"
          values={{
            cash: s.cash,
            debt: s.debt,
            shares: s.shares,
            price: s.price,
            minority: s.minority,
            non_operating_assets: s.non_operating_assets,
          }}
          change={(k, v) => update((a) => ({ ...a, [k]: v }))}
        />
        <p className="mt-3 text-xs text-mist">
          Explicit cash and debt are required, including confirmed zeros. No
          currency conversion is assumed.
        </p>
      </Card>
      <div
        className="my-5 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Valuation method"
      >
        {(
          [
            ["dcf", "Discounted cash flow"],
            ["peers", "Trading comparables"],
            ["transactions", "Precedent transactions"],
            ["ddm", "Dividend discount"],
            ["assets", "Asset based"],
          ] as const
        ).map(([k, name]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
              history.replaceState(null, "", `#${k}`);
            }}
            className={`border px-4 py-3 ${tab === k ? "border-gold text-gold" : "border-line text-mist"}`}
          >
            {name}
          </button>
        ))}
      </div>
      <Card>
        <label className="mb-5 flex gap-3">
          <input
            type="checkbox"
            checked={s.enabled[tab]}
            onChange={(e) =>
              update((v) => ({
                ...v,
                enabled: { ...v.enabled, [tab]: e.target.checked },
              }))
            }
          />{" "}
          Include this model in calculations and export
        </label>
        {tab === "dcf" && (
          <>
            <div className="mb-5 flex flex-wrap gap-5">
              <label>
                Terminal method
                <select
                  className="field ml-2"
                  value={s.terminal_method}
                  onChange={(e) =>
                    update((v) => ({
                      ...v,
                      terminal_method: e.target.value as
                        "growth" | "exit_multiple",
                    }))
                  }
                >
                  <option value="growth">Perpetuity growth</option>
                  <option value="exit_multiple">Exit EV / EBITDA</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={s.enabled.wacc}
                  onChange={(e) =>
                    update((v) => ({
                      ...v,
                      enabled: { ...v.enabled, wacc: e.target.checked },
                    }))
                  }
                />{" "}
                Calculate WACC from market weights
              </label>
            </div>
            {s.enabled.wacc && (
              <div className="mb-5">
                <NumberInputs
                  group="wacc"
                  values={s.wacc}
                  change={(k, v) =>
                    update((a) => ({ ...a, wacc: { ...a.wacc, [k]: v } }))
                  }
                />
                {result?.wacc && <DataTable rows={[result.wacc]} />}
              </div>
            )}
            <NumberInputs
              group="dcf"
              omit={s.enabled.wacc ? ["wacc"] : []}
              values={{
                wacc: workspace.dcfInputs.wacc,
                terminal_growth: workspace.dcfInputs.terminal_growth,
              }}
              change={(k, v) =>
                updateWorkspace((w) => ({
                  ...w,
                  dcfInputs: { ...w.dcfInputs, [k]: v },
                }))
              }
            />
            <div className="mt-4">
              <NumberInputs
                group="settings"
                values={{
                  exit_multiple: s.exit_multiple,
                  opening_nwc: s.opening_nwc,
                }}
                change={(k, v) => update((a) => ({ ...a, [k]: v }))}
              />
            </div>
            {s.enabled.forecast ? (
              <p className="mt-5 text-teal">
                Operating assumptions link to Forecasting.
              </p>
            ) : (
              <>
                <Link
                  className="my-3 inline-block text-teal"
                  href="/workspace#assumption-analysis"
                >
                  Review document assumptions
                </Link>
                <AssumptionShortcuts kind="dcf" />
                <p className="my-4 text-mist">
                  Standalone DCF. Blank opening NWC uses base revenue ×
                  first-year NWC ratio.
                </p>
                <Field
                  label="Base revenue (actual units)"
                  hint={assumptionStatus(workspace, "dcf.base_revenue")}
                  type="number"
                  value={workspace.dcfInputs.base_revenue ?? ""}
                  onChange={(e) =>
                    updateWorkspace((w) => ({
                      ...w,
                      dcfInputs: {
                        ...w.dcfInputs,
                        base_revenue:
                          e.target.value === "" ? null : Number(e.target.value),
                      },
                    }))
                  }
                />
                <label className="mt-4 block">
                  Forecast years
                  <select
                    className="field ml-3"
                    value={workspace.dcfInputs.revenue_growth.length}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      updateWorkspace((w) => {
                        const d = { ...w.dcfInputs };
                        for (const k of annual)
                          d[k] = Array.from({ length: n }, (_, i) =>
                            i < d[k].length ? d[k][i] : (d[k].at(-1) ?? null),
                          );
                        return { ...w, dcfInputs: d };
                      });
                    }}
                  >
                    {[3, 5, 10].map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                </label>
                <div className="table-wrap mt-4">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Year</th>
                        {annual.map((k) => (
                          <th key={k}>{label(k)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.dcfInputs.revenue_growth.map((_, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          {annual.map((k) => (
                            <td key={k}>
                              <AssumptionNumber
                                metric={k}
                                label={`${label(k)} year ${i + 1}`}
                                value={workspace.dcfInputs[k][i]}
                                hint={assumptionStatus(
                                  workspace,
                                  `dcf.${k}.${i}`,
                                )}
                                onValue={(value) =>
                                  updateWorkspace((w) => ({
                                    ...w,
                                    dcfInputs: {
                                      ...w.dcfInputs,
                                      [k]: w.dcfInputs[k].map((v, n) =>
                                        n === i ? value : v,
                                      ),
                                    },
                                  }))
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <h3 className="mt-6">Scenario adjustments</h3>
            {Object.entries(s.scenarios).map(([name, scenario]) => (
              <div className="my-4" key={name}>
                <p className="mb-2 text-gold">{name}</p>
                <NumberInputs
                  group={`scenarios.${name}`}
                  values={scenario}
                  change={(k, v) =>
                    update((a) => ({
                      ...a,
                      scenarios: {
                        ...a.scenarios,
                        [name]: { ...a.scenarios[name], [k]: v },
                      },
                    }))
                  }
                />
              </div>
            ))}
          </>
        )}
        {(tab === "peers" || tab === "transactions") && (
          <PeerEditor
            key={tab}
            rows={s[tab]}
            currency={workspace.company.currency}
            transactions={tab === "transactions"}
            change={(rows) => update((a) => ({ ...a, [tab]: rows }))}
          />
        )}{" "}
        {tab === "ddm" && (
          <>
            <label>
              Dividend stages
              <select
                className="field mb-5 ml-3"
                value={s.ddm.horizon}
                onChange={(e) =>
                  update((a) => ({
                    ...a,
                    ddm: {
                      ...a.ddm,
                      horizon: Number(e.target.value) as 0 | 3 | 5 | 10,
                    },
                  }))
                }
              >
                {[0, 3, 5, 10].map((y) => (
                  <option key={y} value={y}>
                    {y === 0 ? "Gordon growth" : `${y}-year multi-stage`}
                  </option>
                ))}
              </select>
            </label>
            <NumberInputs
              group="ddm"
              values={s.ddm}
              omit={["horizon"]}
              change={(k, v) =>
                update((a) => ({ ...a, ddm: { ...a.ddm, [k]: v } }))
              }
            />
          </>
        )}
        {tab === "assets" && (
          <>
            <NumberInputs
              group="assets"
              values={s.assets}
              change={(k, v) =>
                update((a) => ({ ...a, assets: { ...a.assets, [k]: v } }))
              }
            />
            <p className="mt-4 text-mist">
              Signed adjustments convert book values to estimated fair values.
              Positive liability adjustments reduce equity.
            </p>
          </>
        )}
      </Card>
      <Errors result={result} loading={loading} retry={retry} error={error} />
      <Results result={result} price={s.price} />
      {result && Object.keys(result.models).length > 0 && (
        <Link href="/report" className="mt-4 block text-teal underline">
          View Valuation Results
        </Link>
      )}
    </>
  );
}
export function comparableEquity(
  method: string,
  model: ModelOutput,
  shares: number | null,
): number | null {
  if (method === "DDM") {
    if (
      shares === null ||
      !Number.isFinite(shares) ||
      shares <= 0 ||
      model.per_share == null ||
      !Number.isFinite(model.per_share)
    )
      return null;
    const value = model.per_share * shares;
    return Number.isFinite(value) ? value : null;
  }
  return model.equity_value != null && Number.isFinite(model.equity_value)
    ? model.equity_value
    : null;
}
function Results({
  result,
  price,
}: {
  result: WorkbenchResult | null;
  price: number | null;
}) {
  const { workspace } = useWorkspace();
  const currency = result?.currency ?? workspace.company.currency;
  const shares = settingsFor(workspace).shares;
  const ranges = Object.entries(result?.models ?? {}).flatMap(
    ([method, m]) =>
      m.ranges?.map((r) => ({
        method: `${label(method)} / ${label(r.multiple)}`,
        low: r.low,
        high: r.high,
        equity_value: r.equity_value,
        per_share: r.per_share,
        enterprise_value: r.enterprise_value ?? null,
        book_equity: null,
      })) ?? [
        {
          method: label(method),
          low: comparableEquity(method, m, shares),
          high: comparableEquity(method, m, shares),
          equity_value: comparableEquity(method, m, shares),
          per_share: m.per_share ?? null,
          enterprise_value: m.enterprise_value ?? null,
          book_equity: m.book_equity ?? null,
        },
      ],
  );
  const chart = ranges
    .filter((r) => r.low !== null && r.high !== null)
    .map((r) => ({ ...r, range: [r.low, r.high] }));
  return (
    <>
      <Card className="mt-5">
        <h2 className="text-xl">Valuation comparison</h2>
        <p className="mt-2 text-sm text-mist">
          {currency} - actual units. Enterprise value, equity value and value
          per share are shown separately.
        </p>
        <DataTable
          rows={ranges.map((r) => ({
            ...r,
            upside_downside:
              price && r.per_share !== null ? r.per_share / price - 1 : null,
          }))}
        />
        {chart.length > 0 && (
          <div className="mt-5 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={chart}>
                <XAxis
                  type="number"
                  tickFormatter={(v) =>
                    formatFinancialValue("equity_value", v, {
                      currency,
                      compact: true,
                    })
                  }
                  fontSize={12}
                />
                <YAxis
                  dataKey="method"
                  type="category"
                  width={125}
                  fontSize={12}
                />
                <Tooltip
                  content={<FinancialChartTooltip currency={currency} />}
                />
                <Bar
                  dataKey="range"
                  fill="#45b6ad"
                  name="Equity value range"
                  minPointSize={3}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-3 text-xs text-mist">
          Football field: equity ranges. Thin marks denote point estimates; read
          exact values above. DDM enters this chart only when a valid share
          count converts its per-share result to total equity. Upside/downside
          is not a recommendation.
        </p>
      </Card>
      {result?.models.DCF?.forecast && (
        <Card className="mt-5">
          <h2 className="text-lg">DCF cash-flow and discounting schedule</h2>
          <DataTable rows={result.models.DCF.forecast} />
          <DataTable
            rows={[
              {
                terminal_value: result.models.DCF.terminal_value ?? null,
                pv_terminal_value: result.models.DCF.pv_terminal_value ?? null,
              },
            ]}
          />
          <p className="mt-3 text-xs text-mist">
            Year-end discounting. Terminal value is measured at the end of the
            final forecast year.
          </p>
        </Card>
      )}
      {Object.entries(result?.models ?? {})
        .filter(([, m]) => m.multiples)
        .map(([name, m]) => (
          <Card key={name} className="mt-5">
            <h3>{label(name)}</h3>
            <DataTable rows={m.multiples ?? []} />
            <DataTable
              rows={Object.entries(m.statistics ?? {}).map(
                ([multiple, stats]) => ({ multiple, ...stats }),
              )}
            />
            <p className="mt-3 text-xs text-mist">{m.note}</p>
            {m.target && (
              <p>
                Target: {m.target.basis} - {m.target.period}; balance date:{" "}
                {m.target.balance_date || "unverified"}
              </p>
            )}
            {m.warnings?.map((v) => (
              <Notice key={v} kind="warning">
                {v}
              </Notice>
            ))}
          </Card>
        ))}
    </>
  );
}
export function ResultsPage() {
  const { workspace, settings, result, error, loading, retry } =
    useModel("extended");
  const { exportWorkspace, importWorkspace, project, updateWorkspace } =
    useWorkspace();
  const exportContext = useRef({
    id: project.id,
    revision: workspace.revision,
  });
  exportContext.current = { id: project.id, revision: workspace.revision };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [pendingImport, setPendingImport] = useState<{
    name: string;
    raw: string;
  } | null>(null);
  const [exportError, setExportError] = useState(""),
    [busy, setBusy] = useState(false);
  async function download() {
    const captured = { ...exportContext.current };
    setBusy(true);
    setExportError("");
    try {
      const f = await apiDownload("/v1/workbench/export", {
        ...payloadFor(persistenceCopy(workspace)),
        assumption_sources: assumptionExport(workspace),
      });
      if (
        !mounted.current ||
        captured.id !== exportContext.current.id ||
        captured.revision !== exportContext.current.revision
      )
        return;
      saveBlob(f.blob, f.filename);
      updateWorkspace((w) => ({
        ...w,
        modelExport: {
          input_hash: workbookFingerprint(w),
          filename: f.filename,
          created_at: new Date().toISOString(),
        },
      }));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        kicker="Results & export"
        title="Results & Export"
        description="Only current, valid calculations are displayed. Incomplete models are marked in exports."
        actions={
          <Button
            disabled={!result || !Object.keys(result.models).length}
            loading={busy}
            onClick={() => void download()}
          >
            Export Excel model
          </Button>
        }
      />
      <Errors
        result={result}
        loading={loading}
        retry={retry}
        error={error || exportError}
      />
      <Results result={result} price={settings.price} />
      <Card className="mt-5">
        <h2>Scenario comparison</h2>
        <DataTable
          rows={Object.entries(result?.scenarios ?? {}).map(
            ([scenario, m]) => ({
              scenario,
              equity_value: m?.equity_value ?? null,
              per_share: m?.per_share ?? null,
            }),
          )}
        />
      </Card>
      {Object.entries(result?.sensitivities ?? {}).map(([kind, grid]) => (
        <Card className="mt-5" key={kind}>
          <h2>
            {kind === "growth"
              ? "WACC vs. terminal growth"
              : kind === "exit_multiple"
                ? "WACC vs. exit EV / EBITDA"
                : "Revenue growth delta vs. EBIT margin delta"}
          </h2>
          <p className="mt-2 text-xs text-mist">
            Equity values, actual units. Changing model assumptions recalculates
            these tables.
          </p>
          <div className="table-wrap mt-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    {kind === "growth"
                      ? "Terminal Growth / WACC"
                      : kind === "exit_multiple"
                        ? "Exit Multiple / WACC"
                        : "Margin / Growth Adjustment"}
                  </th>
                  {grid.columns.map((c, i) => (
                    <th key={i} className="numeric">
                      {formatFinancialValue(
                        kind === "operating" ? "growth_delta" : "wacc",
                        c,
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((r, i) => (
                  <tr key={i}>
                    <th className="numeric">
                      {formatFinancialValue(
                        kind === "growth"
                          ? "terminal_growth"
                          : kind === "exit_multiple"
                            ? "exit_multiple"
                            : "margin_delta",
                        r,
                      )}
                    </th>
                    {grid.values[i].map((v, j) => (
                      <td key={j} className="numeric">
                        {formatFinancialValue("equity_value", v, {
                          currency: workspace.company.currency,
                        })}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      {pendingImport && (
        <ConfirmationDialog
          title="Import Project Backup"
          confirmLabel="Create Imported Project"
          onCancel={() => setPendingImport(null)}
          onConfirm={() => {
            try {
              importWorkspace(pendingImport.raw);
              setPendingImport(null);
              setExportError("");
            } catch (reason) {
              setExportError(
                reason instanceof Error ? reason.message : "Import failed.",
              );
            }
          }}
        >
          <p>{pendingImport.name}</p>
          <p>
            A new independent project will be created. Existing projects will be
            preserved. Source metadata and assumptions are retained; source text
            retention remains disabled.
          </p>
        </ConfirmationDialog>
      )}
      <Card className="mt-5">
        <h2 className="mb-4">Portable project backup</h2>
        <Button
          variant="secondary"
          onClick={() =>
            saveBlob(
              new Blob([exportWorkspace()], { type: "application/json" }),
              "equitylens-project.json",
            )
          }
        >
          Save project JSON
        </Button>
        <label className="ml-5">
          Reopen project
          <input
            className="ml-3"
            type="file"
            accept=".json"
            onChange={async (e) => {
              try {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 10 * 1024 * 1024)
                    throw new Error("Project imports are limited to 10 MB.");
                  const raw = await f.text();
                  const preview = previewProjectBackup(raw);
                  setPendingImport({ raw, name: preview.name });
                }
                e.target.value = "";
              } catch (reason) {
                setExportError(
                  reason instanceof Error ? reason.message : "Invalid backup",
                );
              }
            }}
          />
        </label>
      </Card>
    </>
  );
}
