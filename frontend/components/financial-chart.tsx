"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  formatFinancialLabel,
  formatFinancialValue,
  financialUnit,
} from "@/lib/financial-formatting";

import type { NumericRow } from "@/lib/workbench";

const colors: Record<string, string> = {
  revenue: "#45b6ad",
  ebit: "#d4a84f",
  operating_cash_flow: "#9caef0",
  cash: "#45b6ad",
  short_term_debt: "#d4a84f",
  long_term_debt: "#e08f9f",
  total_equity: "#9caef0",
};

const palette = ["#45b6ad", "#d4a84f", "#9caef0", "#e08f9f"];

export function FinancialChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{
    dataKey?: string | number;
    name?: string | number;
    value?: unknown;
    color?: string;
  }>;
  label?: unknown;
  currency: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="max-w-xs rounded border border-line bg-panel p-3 text-sm shadow-xl">
      <p className="mb-2 font-semibold">{String(label ?? "")}</p>

      {payload.map((item, i) => (
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1" key={i}>
          <span>{item.name ?? formatFinancialLabel(String(item.dataKey))}</span>
          <span className="tabular-nums">
            {Array.isArray(item.value)
              ? item.value
                  .map((v) =>
                    formatFinancialValue(String(item.dataKey), v, { currency }),
                  )
                  .join(" – ")
              : formatFinancialValue(String(item.dataKey), item.value, {
                  currency,
                })}
          </span>
        </div>
      ))}
    </div>
  );
}

export function FinancialChartLegend({
  payload,
}: {
  payload?: ReadonlyArray<{ value?: string; color?: string }>;
}) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-3 text-xs text-mist">
      {payload?.map((item) => (
        <li key={item.value} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: item.color }}
          />
          {item.value}
        </li>
      ))}
    </ul>
  );
}

export function FinancialLineChart({
  rows,
  metrics,
  currency,
}: {
  rows: NumericRow[];
  metrics: string[];
  currency: string;
}) {
  if (
    !rows.some((row) =>
      metrics.some(
        (key) => typeof row[key] === "number" && Number.isFinite(row[key]),
      ),
    )
  )
    return (
      <p className="py-8 text-sm text-mist">No financial data available.</p>
    );

  const axisMetric = metrics[0];

  return (
    <div
      className="mt-4"
      role="img"
      aria-label={metrics.map(formatFinancialLabel).join(", ") + " chart"}
    >
      <p className="mb-2 text-xs text-mist">
        {financialUnit(axisMetric) === "percentage"
          ? "Percent"
          : currency + " - actual units"}
      </p>

      <div className="h-80 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid stroke="#1d3341" vertical={false} />
            <XAxis dataKey="period" stroke="#8fa6b3" fontSize={12} />

            <YAxis
              width={90}
              stroke="#8fa6b3"
              fontSize={12}
              tickFormatter={(v) =>
                formatFinancialValue(axisMetric, v, { currency, compact: true })
              }
            />

            <Tooltip content={<FinancialChartTooltip currency={currency} />} />
            <Legend content={<FinancialChartLegend />} />

            {metrics.map((key, i) => (
              <Line
                key={key}
                dataKey={key}
                name={formatFinancialLabel(key)}
                stroke={colors[key] ?? palette[i % palette.length]}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
