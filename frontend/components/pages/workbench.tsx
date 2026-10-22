"use client";
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
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiDownload, apiPost, apiUpload, saveBlob } from "@/lib/api";
import { persistenceCopy, useWorkspace } from "@/lib/workspace";
import {
  payloadFor,
  settingsFor,
  type PeerInput,
  type WorkbenchResult,
  type ModelOutput,
  type WorkbenchSettings,
  type NumericRow,
} from "@/lib/workbench";
import { Button, Card, Field, Notice, PageHeader } from "@/components/ui";

const label = formatFinancialLabel;
const DataTable = FinancialDataTable;
function useModel() {
  const { workspace, updateWorkspace } = useWorkspace();
  const settings = settingsFor(workspace),
    serialized = JSON.stringify(payloadFor(workspace));
  const [snapshot, setSnapshot] = useState<{
    key: string;
    value: WorkbenchResult;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    const timer = window.setTimeout(() => {
      apiPost<WorkbenchResult>(
        "/v1/workbench/calculate",
        JSON.parse(serialized),
        { signal: controller.signal },
      )
        .then((value) => {
          if (!controller.signal.aborted)
            setSnapshot({ key: serialized, value });
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setError(e instanceof Error ? e.message : "Calculation failed");
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [serialized]);
  const update = (fn: (s: WorkbenchSettings) => WorkbenchSettings) =>
    updateWorkspace((w) => ({ ...w, valuationWorkbench: fn(settingsFor(w)) }));
  return {
    workspace,
    updateWorkspace,
    settings,
    update,
    result: snapshot?.key === serialized ? snapshot.value : null,
    error,
  };
}
function Errors({
  result,
  error,
}: {
  result: WorkbenchResult | null;
  error: string;
}) {
  return (
    <div className="my-4 space-y-2" aria-live="polite">
      {error && <Notice kind="error">{formatFinancialMessage(error)}</Notice>}
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
  const { workspace } = useWorkspace();
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Object.entries(values)
        .filter(
          ([k, v]) =>
            !omit.includes(k) && (typeof v === "number" || v === null),
        )
        .map(([k, v]) => (
          <Field
            key={k}
            label={label(k)}
            hint={(group && historicalLabel(workspace, `${group}.${k}`)) || financialInputHint(k, workspace.company.currency)}
            type="number"
            step="any"
            value={v ?? ""}
            onChange={(e) =>
              change(
                k as keyof T,
                e.target.value === "" ? null : Number(e.target.value),
              )
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
      <div className="grid gap-5 md:grid-cols-3">
        {[
          ["Company", workspace.company.name],
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
  const { settings: s, update, result, error } = useModel();
  return (
    <>
      <PageHeader
        kicker="Forecasting"
        title="Forecasting"
        description="Rates are decimals (0.05 = 5%). Monetary inputs and outputs use actual currency units."
      />
      <HistoricalReferenceControls scope="forecast" />
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
          Opex ratio overrides EBITDA margin when supplied. Other assets and
          non-debt liabilities remain constant. NWC represents net operating
          assets. Interest uses opening debt; revolver draws occur at year-end.
          Missing opening balances block the forecast.
        </p>
      </Card>
      <Errors result={result} error={error} />
      <Card>
        <h2>Historical Actuals</h2>
        <DataTable
          rows={Object.entries(result?.history ?? {}).map(([period, row]) => ({
            period,
            ...row,
          }))}
        />
      </Card>
      <Card className="mt-5">
        <h2 className="text-teal">
          Projected income, balance sheet and cash flow statements
        </h2>
        <DataTable
          rows={result?.forecast ?? []}
          caption="Forecast outputs - calculated from user-entered assumptions"
        />
      </Card>
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
    change(rows.map((r, n) => (n === i ? { ...r, [k]: value } : r)));
  async function upload(file: File | undefined) {
    if (!file) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await apiUpload<{ rows: PeerInput[] }>(
        "/v1/workbench/import-peers",
        form,
      );
      change([...rows, ...data.rows]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
  }
  return (
    <>
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
  } = useModel();
  const [tab, setTab] = useState<
    "dcf" | "peers" | "transactions" | "ddm" | "assets"
  >("dcf");
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
        description="Independent models. Money in actual currency units; diluted shares in actual shares. Rates are decimals."
      />
      <Link
        className="mb-3 inline-block text-teal"
        href="/workspace#assumption-analysis"
      >
        Review document assumptions
      </Link>
      <HistoricalReferenceControls scope="valuation" />
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
            onClick={() => setTab(k)}
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
                  hint={historicalLabel(workspace,"dcf.base_revenue")??undefined}
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
                              <input
                                aria-label={`${label(k)} year ${i + 1}`}
                                className="field w-28"
                                type="number"
                                step="any"
                                value={workspace.dcfInputs[k][i] ?? ""}
                                onChange={(e) =>
                                  updateWorkspace((w) => ({
                                    ...w,
                                    dcfInputs: {
                                      ...w.dcfInputs,
                                      [k]: w.dcfInputs[k].map((v, n) =>
                                        n === i
                                          ? e.target.value === ""
                                            ? null
                                            : Number(e.target.value)
                                          : v,
                                      ),
                                    },
                                  }))
                                }
                              />
                              {historicalLabel(workspace,`dcf.${k}.${i}`) && <p className="mt-1 max-w-40 text-xs text-mist">{historicalLabel(workspace,`dcf.${k}.${i}`)}</p>}
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
      <Errors result={result} error={error} />
      <Results result={result} price={s.price} />
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
          </Card>
        ))}
    </>
  );
}
export function ResultsPage() {
  const { workspace, settings, result, error } = useModel();
  const { exportWorkspace, importWorkspace } = useWorkspace();
  const [exportError, setExportError] = useState(""),
    [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    setExportError("");
    try {
      const f = await apiDownload("/v1/workbench/export", {
        ...payloadFor(persistenceCopy(workspace)),
        assumption_sources: assumptionExport(workspace),
      });
      saveBlob(f.blob, f.filename);
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
      <Errors result={result} error={error || exportError} />
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
                if (f) importWorkspace(await f.text());
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
