import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { TrendPoint } from "../../data/usageTypes";
import type { Locale } from "../../i18n/messages";

type TrendChartProps = {
  data: TrendPoint[];
  eyebrow: string;
  locale: Locale;
  noData: string;
  title: string;
};

export function TrendChart({ data, eyebrow, locale, noData, title }: TrendChartProps) {
  const hasData = data.some((item) => item.total > 0);
  const compactFormatter = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1
  });
  const numberFormatter = new Intl.NumberFormat(locale);

  return (
    <section className="panel chart-panel">
      <div className="panel__header">
        <div>
          <p>{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="chart-frame">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 8, right: 12, top: 12, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(100, 116, 139, 0.16)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickFormatter={(value: number) => compactFormatter.format(value)}
                width={62}
              />
              <Tooltip
                formatter={(value: number) => numberFormatter.format(value)}
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  borderRadius: 8,
                  color: "#111827",
                  boxShadow: "0 16px 36px rgba(15, 23, 42, 0.12)"
                }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#trendFill)"
                activeDot={{ r: 4, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-chart">{noData}</div>
        )}
      </div>
    </section>
  );
}
