import { chartGeometry, FLAG_LABEL, formatDate, formatRange } from "@/lib/records";
import type { LabTrend } from "@/lib/types";

const W = 560;
const H = 220;

/** Inline SVG chart plus a data table, so nothing depends on seeing colour or the graphic. */
export function TrendChart({ trend }: { trend: LabTrend }) {
  const { points, ref_low, ref_high, unit, test_name } = trend;
  const g = chartGeometry(points, ref_low, ref_high, W, H);
  const range = formatRange(ref_low, ref_high, unit);
  const first = points[0]!;
  const last = points[points.length - 1]!;

  const latestFlag = FLAG_LABEL[last.flag];

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink">
        <span className="font-medium">{test_name}:</span>{" "}
        <span className="tnum">
          {points.length} result{points.length === 1 ? "" : "s"}, {formatDate(first.observed_on)} to {formatDate(last.observed_on)}. Latest {last.value}
          {unit ? ` ${unit}` : ""} ({latestFlag.toLowerCase()}).
        </span>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${test_name}: ${points.length} result${points.length === 1 ? "" : "s"} from ${formatDate(first.observed_on)} to ${formatDate(last.observed_on)}. Latest ${last.value}${unit ? ` ${unit}` : ""}.`}
        className="w-full rounded-lg border border-line bg-surface"
      >
        {g.band && <rect x={0} width={W} y={g.band.y} height={g.band.height} className="fill-mint-100" />}
        {points.length > 1 && <path d={g.line} fill="none" strokeWidth={2} className="stroke-teal-700" />}
        {g.dots.map((d, i) => (
          <g key={d.id}>
            <circle cx={d.x} cy={d.y} r={5} className="fill-teal-700 stroke-white" strokeWidth={2} />
            {points[i]!.flag !== "normal" && points[i]!.flag !== "unknown" && (
              // Shape, not just colour: a ring marks values outside the report's range.
              <circle cx={d.x} cy={d.y} r={9} fill="none" strokeWidth={2} className="stroke-amber-600" />
            )}
          </g>
        ))}
      </svg>
      <p className="text-xs text-ink-soft">
        {range ? `Shaded band: range printed on your latest report (${range}). ` : "No reference range was entered. "}
        Rings mark results outside the range printed on their own report.
      </p>
      <table className="w-full text-sm">
        <caption className="sr-only">{test_name} results over time</caption>
        <thead>
          <tr className="text-left text-xs text-ink-soft">
            <th className="py-1 pr-3 font-medium">Date</th>
            <th className="py-1 pr-3 font-medium">Result</th>
            <th className="py-1 font-medium">Compared with report range</th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((p) => (
            <tr key={p.id} className="border-t border-line">
              <td className="py-1.5 pr-3">{formatDate(p.observed_on)}</td>
              <td className="py-1.5 pr-3 tabular-nums">
                {p.value}
                {unit ? ` ${unit}` : ""}
              </td>
              <td className="py-1.5">{FLAG_LABEL[p.flag]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
