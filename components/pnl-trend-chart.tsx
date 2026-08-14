"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export type TrendPoint = {
  label: string;
  revenue: number;
  operatingIncome: number;
  cogsPct: number | null;
  primeCostPct: number | null;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function DollarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-medium text-zinc-900">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {money(p.value)}
        </div>
      ))}
    </div>
  );
}

function PctTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-medium text-zinc-900">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value.toFixed(1)}%
        </div>
      ))}
    </div>
  );
}

export function PnlTrendCharts({ data }: { data: TrendPoint[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Revenue &amp; operating income
        </div>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a1a1aa" }} />
              <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} width={60} />
              <Tooltip content={<DollarTooltip />} />
              <Bar dataKey="revenue" name="Revenue" fill="#e4e4e7" radius={[3, 3, 0, 0]} />
              <Line
                type="monotone"
                dataKey="operatingIncome"
                name="Operating income"
                stroke="#18181b"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          COGS % &amp; prime cost % of revenue
        </div>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a1a1aa" }} />
              <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} width={40} unit="%" />
              <Tooltip content={<PctTooltip />} />
              <Line
                type="monotone"
                dataKey="cogsPct"
                name="COGS %"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="primeCostPct"
                name="Prime cost %"
                stroke="#18181b"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
