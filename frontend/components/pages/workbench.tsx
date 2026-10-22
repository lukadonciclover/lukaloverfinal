"use client";
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
import { useWorkspace } from "@/lib/workspace";
import {
  payloadFor,
  settingsFor,
  type PeerInput,
  type WorkbenchResult,
  type WorkbenchSettings,
  type NumericRow,
} from "@/lib/workbench";
import {
  Button,
  Card,
  Field,
  Notice,
  PageHeader,
  formatNumber,
} from "@/components/ui";

const label = (s: string) => s.replaceAll("_", " ");
export function DataTable({ rows }: { rows: NumericRow[] }) {
  const keys = [...new Set(rows.flatMap(Object.keys))];
  return rows.length ? (
    <div className="table-wrap mt-4">
      <table className="data-table">
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{label(k)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {keys.map((k) => (
                <td key={k}>
                  {typeof r[k] === "number"
                    ? formatNumber(r[k] as number, 2)
                    : (r[k] ?? "Unavailable")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="py-5 text-sm text-mist">
      Supply the required inputs to calculate results.
    </p>
  );
}
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
      {error && <Notice kind="error">{error}</Notice>}
      {Object.entries(result?.errors ?? {}).map(([k, v]) => (
        <Notice kind="warning" key={k}>
          {k}: {v}
        </Notice>
      ))}
    </div>
  );
}
function NumberInputs<T extends object>({
  values,
  change,
  omit = [],
}: {
  values: T;
  change: (key: keyof T, value: number | null) => void;
  omit?: string[];
}) {
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
  const { workspace, projects, createProject, persistenceStatus } =
    useWorkspace();
  return (
    <>
      <PageHeader
        kicker="Equity Lens"
        title="Dashboard"
        actions={
          <Button onClick={() => createProject("Untitled valuation")}>
            Create Project
          </Button>
        }
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
      {!workspace.figures.length && <p className="my-4 text-sm text-mist">No financial data available</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        {[["workspace", "Financial Data"], ["financials", "Financial Analysis"], ["forecasting", "Forecasting"], ["valuation", "Valuation Models"], ["report", "Results & Export"]].map(([href, title]) => <Link key={href} href={`/${href}`} className="border border-line px-4 py-2 text-sm hover:border-gold">{title}</Link>)}
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
        <NumberInputs
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
        <h2>Historical actuals</h2>
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
        <DataTable rows={result?.forecast ?? []} />
      </Card>
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
      {error && <Notice kind="error">{error}</Notice>}
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
            {rows.map((r, i) => (
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
                      aria-label={`${k} row ${i + 1}`}
                      className="field w-28"
                      type="number"
                      step="any"
                      value={r[k] ?? ""}
                      onChange={(e) =>
                        edit(
                          i,
                          k,
                          e.target.value === "" ? null : Number(e.target.value),
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
            ))}
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
      <Card>
        <h2 className="mb-4">Equity bridge and market reference</h2>
        <NumberInputs
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
                  values={s.wacc}
                  change={(k, v) =>
                    update((a) => ({ ...a, wacc: { ...a.wacc, [k]: v } }))
                  }
                />
                {result?.wacc && <DataTable rows={[result.wacc]} />}
              </div>
            )}
              <NumberInputs
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
                <p className="my-4 text-mist">
                  Standalone DCF. Blank opening NWC uses base revenue ×
                  first-year NWC ratio.
                </p>
                <Field
                  label="Base revenue (actual units)"
                  type="number"
                  value={workspace.dcfInputs.base_revenue ?? ""}
                  onChange={(e) =>
                    updateWorkspace((w) => ({
                      ...w,
                      dcfInputs: {
                        ...w.dcfInputs,
                        base_revenue: e.target.value === "" ? null : Number(e.target.value),
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
                          d[k] = Array.from(
                            { length: n },
                            (_, i) => i < d[k].length ? d[k][i] : d[k].at(-1) ?? null,
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
                                aria-label={`${k} year ${i + 1}`}
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
                                        n === i ? (e.target.value === "" ? null : Number(e.target.value)) : v,
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
function Results({
  result,
  price,
}: {
  result: WorkbenchResult | null;
  price: number | null;
}) {
  const ranges = Object.entries(result?.models ?? {}).flatMap(
    ([method, m]) =>
      m.ranges?.map((r) => ({
        method: `${method} / ${r.multiple}`,
        low: r.low,
        high: r.high,
        equity_value: r.equity_value,
        per_share: r.per_share,
        enterprise_value: r.enterprise_value ?? null,
        book_equity: null,
      })) ?? [
        {
          method,
          low: m.equity_value ?? null,
          high: m.equity_value ?? null,
          equity_value: m.equity_value ?? null,
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
          {result?.currency} actual units. DCF values operating cash flow, DDM
          values dividends per share, and asset valuation estimates net assets.
          Multiples reflect selected market or transaction observations. Methods
          have different economic assumptions.
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
                <XAxis type="number" />
                <YAxis
                  dataKey="method"
                  type="category"
                  width={190}
                  fontSize={11}
                />
                <Tooltip />
                <Bar dataKey="range" fill="#45b6ad" name="Equity value range" minPointSize={3} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-3 text-xs text-mist">
          Football field: equity ranges. Thin marks denote point estimates; read
          exact values above. DDM is per share. Upside/downside is a decimal,
          not a recommendation.
        </p>
      </Card>
      {result?.models.DCF?.forecast && <Card className="mt-5"><h2 className="text-lg">DCF cash-flow and discounting schedule</h2><DataTable rows={result.models.DCF.forecast}/><DataTable rows={[{terminal_value:result.models.DCF.terminal_value ?? null,pv_terminal_value:result.models.DCF.pv_terminal_value ?? null}]}/><p className="mt-3 text-xs text-mist">Year-end discounting. Terminal value is measured at the end of the final forecast year.</p></Card>}
      {Object.entries(result?.models ?? {})
        .filter(([, m]) => m.multiples)
        .map(([name, m]) => (
          <Card key={name} className="mt-5">
            <h3>{name}</h3>
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
      const f = await apiDownload(
        "/v1/workbench/export",
        payloadFor(workspace),
      );
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
                  <th>Row / column</th>
                  {grid.columns.map((c, i) => (
                    <th key={i}>{formatNumber(c, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((r, i) => (
                  <tr key={i}>
                    <th>{formatNumber(r, 3)}</th>
                    {grid.values[i].map((v, j) => (
                      <td key={j} title={`Row ${r}; column ${grid.columns[j]}`}>
                        {formatNumber(v, 2)}
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
