import { useState } from "react";
import { Button } from "@repo/ui";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import type { AnalyticsDashboard } from "./format";
import { RAMP_ALPHAS, rampColor, rampStep } from "./format";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_TICKS = [0, 6, 12, 18];
const BANDS = 8;

function hourLabel(hour: number) {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

function Cell({ value, max, className }: { value: number; max: number; className?: string }) {
  const step = rampStep(value, max);
  return (
    <div
      className={`rounded-prism-5 ${className ?? ""}`}
      style={
        step === null
          ? { backgroundColor: "#FFFFFF", boxShadow: "inset 0 0 0 1px rgba(22,21,43,0.10)" }
          : { backgroundColor: rampColor(step) }
      }
    />
  );
}

/**
 * Screen Review 093 I36: weekday by hour on a G2 slab with the D3 ramp. The
 * cells are a picture (not focusable); every value is in Show as table. At 390
 * the grid turns into 7 day columns by 8 three hour bands.
 */
export function ActivityHeatmap({ cells }: { cells: AnalyticsDashboard["heatmap"] }) {
  const mobile = useMediaQuery(PHONE_QUERY);
  const [showTable, setShowTable] = useState(false);
  const grid = new Map(cells.map(cell => [`${cell.day}:${cell.hour}`, cell.views]));
  const views = (day: number, hour: number) => grid.get(`${day}:${hour}`) ?? 0;
  const max = Math.max(0, ...cells.map(cell => cell.views));
  const band = (day: number, index: number) =>
    views(day, index * 3) + views(day, index * 3 + 1) + views(day, index * 3 + 2);
  const bandMax = Math.max(
    0,
    ...DAYS.flatMap((_, day) => Array.from({ length: BANDS }, (_, index) => band(day, index)))
  );

  return (
    <div className="font-prism">
      <div className="prism-slab p-[13px]" aria-hidden>
        {mobile ? (
          <div
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: "34px repeat(7, minmax(0, 1fr))" }}
          >
            <div />
            {DAYS.map(day => (
              <div key={day} className="text-center text-prism-meta text-prism-ink-2">
                {day}
              </div>
            ))}
            {Array.from({ length: BANDS }).map((_, index) => (
              <div key={index} className="contents">
                <div className="flex items-center text-prism-meta text-prism-ink-2">
                  {index % 2 === 0 ? hourLabel(index * 3) : ""}
                </div>
                {DAYS.map((day, dayIndex) => (
                  <Cell
                    key={day}
                    value={band(dayIndex, index)}
                    max={bandMax}
                    className="h-[34px]"
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: "34px repeat(24, minmax(0, 1fr))" }}
          >
            {DAYS.map((day, dayIndex) => (
              <div key={day} className="contents">
                <div className="flex items-center text-prism-meta text-prism-ink-2">{day}</div>
                {Array.from({ length: 24 }).map((_, hour) => (
                  <Cell
                    key={hour}
                    value={views(dayIndex, hour)}
                    max={max}
                    className="aspect-square"
                  />
                ))}
              </div>
            ))}
            <div />
            {Array.from({ length: 24 }).map((_, hour) => (
              <div key={hour} className="whitespace-nowrap pt-1 text-prism-meta text-prism-ink-2">
                {HOUR_TICKS.includes(hour) ? hourLabel(hour) : ""}
              </div>
            ))}
          </div>
        )}
        <div className="mt-[13px] flex items-center justify-end gap-[5px] text-prism-meta text-prism-ink-2">
          Fewer
          <span
            className="h-[13px] w-[13px] rounded-prism-5 bg-white"
            style={{ boxShadow: "inset 0 0 0 1px rgba(22,21,43,0.10)" }}
          />
          {RAMP_ALPHAS.map((_, step) => (
            <span
              key={step}
              className="h-[13px] w-[13px] rounded-prism-5"
              style={{ backgroundColor: rampColor(step) }}
            />
          ))}
          More
        </div>
      </div>

      <Button
        variant="ghost"
        className="mt-[13px]"
        aria-expanded={showTable}
        onClick={() => setShowTable(open => !open)}
      >
        {showTable ? "Hide table" : "Show as table"}
      </Button>
      {showTable && (
        <div className="prism-slab relative mt-2 overflow-x-auto px-[13px]">
          <table className="w-full min-w-[540px] text-left">
            <caption className="sr-only">Views by weekday and hour, in your time zone</caption>
            <thead>
              <tr className="text-prism-meta text-prism-ink-2">
                <th scope="col" className="sticky left-0 h-touch bg-white/80 pr-2 font-normal">
                  Hour
                </th>
                {DAYS.map(day => (
                  <th key={day} scope="col" className="h-touch text-right font-normal">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-prism-label tabular-nums text-prism-ink">
              {Array.from({ length: 24 }).map((_, hour) => (
                <tr key={hour} className="border-t border-prism-line">
                  <th scope="row" className="sticky left-0 h-touch bg-white/80 pr-2 font-normal">
                    {hourLabel(hour)}
                  </th>
                  {DAYS.map((day, dayIndex) => (
                    <td key={day} className="h-touch text-right">
                      {views(dayIndex, hour).toLocaleString("en-US")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
