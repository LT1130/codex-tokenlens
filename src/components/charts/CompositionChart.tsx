import type { TokenBucket } from "../../data/usageTypes";

type CompositionChartProps = {
  totals: TokenBucket;
  eyebrow: string;
  title: string;
  noData: string;
  labels: {
    input: string;
    output: string;
    cache: string;
    reasoning: string;
    uncachedInput: string;
    visibleOutput: string;
    includedHint: string;
  };
  locale: string;
};

export function CompositionChart({ totals, eyebrow, labels, locale, noData, title }: CompositionChartProps) {
  const formatter = new Intl.NumberFormat(locale);
  const percentFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const cached = Math.min(totals.cache, totals.input);
  const uncached = Math.max(totals.input - cached, 0);
  const reasoning = Math.min(totals.reasoning, totals.output);
  const visibleOutput = Math.max(totals.output - reasoning, 0);
  const total = totals.input + totals.output;

  return (
    <section className="panel composition-panel">
      <div className="panel__header">
        <div><p>{eyebrow}</p><h2>{title}</h2></div>
      </div>
      {total === 0 ? <div className="empty-chart empty-chart--compact">{noData}</div> : (
        <div className="composition-breakdowns">
          <CompositionGroup
            label={labels.input}
            total={totals.input}
            formatter={formatter}
            percentFormatter={percentFormatter}
            hint={labels.includedHint}
            segments={[
              { label: labels.uncachedInput, value: uncached, color: "#2563eb" },
              { label: labels.cache, value: cached, color: "#d97706" }
            ]}
          />
          <CompositionGroup
            label={labels.output}
            total={totals.output}
            formatter={formatter}
            percentFormatter={percentFormatter}
            hint={labels.includedHint}
            segments={[
              { label: labels.visibleOutput, value: visibleOutput, color: "#16a34a" },
              { label: labels.reasoning, value: reasoning, color: "#7c3aed" }
            ]}
          />
        </div>
      )}
    </section>
  );
}

function CompositionGroup({ label, total, segments, formatter, percentFormatter, hint }: {
  label: string;
  total: number;
  segments: Array<{ label: string; value: number; color: string }>;
  formatter: Intl.NumberFormat;
  percentFormatter: Intl.NumberFormat;
  hint: string;
}) {
  return (
    <section className="composition-group">
      <div className="composition-group__header"><span>{label}</span><strong>{formatter.format(total)}</strong></div>
      <div className="composition-bar" aria-label={`${label} ${formatter.format(total)}`}>
        {segments.map((segment) => <i key={segment.label} style={{ width: `${total > 0 ? (segment.value / total) * 100 : 0}%`, background: segment.color }} />)}
      </div>
      <div className="composition-legend">
        {segments.map((segment) => (
          <div key={segment.label}>
            <span><i style={{ background: segment.color }} />{segment.label}</span>
            <strong>{formatter.format(segment.value)}</strong>
            <small>{total > 0 ? `${percentFormatter.format((segment.value / total) * 100)}%` : "0%"}</small>
          </div>
        ))}
      </div>
      <p>{hint}</p>
    </section>
  );
}
