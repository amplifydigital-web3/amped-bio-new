import type { AnalyticsDashboard } from "./format";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_TICKS = [0, 6, 12, 18];

// Sequential single hue ramp (light to dark blue)
const RAMP = ["#f1f5fb", "#cfe0f5", "#9fc1ea", "#6ba0dd", "#2a78d6", "#1b56a0"];

function hourLabel(hour: number) {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export function ActivityHeatmap({ cells }: { cells: AnalyticsDashboard["heatmap"] }) {
  const grid = new Map(cells.map(cell => [`${cell.day}:${cell.hour}`, cell.views]));
  const max = Math.max(0, ...cells.map(cell => cell.views));

  const colorFor = (views: number) => {
    if (views === 0 || max === 0) return RAMP[0];
    const step = Math.min(RAMP.length - 1, 1 + Math.floor((views / max) * (RAMP.length - 2)));
    return RAMP[step];
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: "36px repeat(24, minmax(0, 1fr))" }}
        >
          {DAYS.map((day, dayIndex) => (
            <div key={day} className="contents">
              <div className="text-[11px] text-gray-500 flex items-center">{day}</div>
              {Array.from({ length: 24 }).map((_, hour) => {
                const views = grid.get(`${dayIndex}:${hour}`) ?? 0;
                return (
                  <div
                    key={hour}
                    className="aspect-square rounded-[3px] hover:ring-2 hover:ring-gray-900/40"
                    style={{ backgroundColor: colorFor(views) }}
                    title={`${day} ${hourLabel(hour)}: ${views} view${views === 1 ? "" : "s"}`}
                  />
                );
              })}
            </div>
          ))}
          <div />
          {Array.from({ length: 24 }).map((_, hour) => (
            <div key={hour} className="text-[10px] text-gray-500 pt-1">
              {HOUR_TICKS.includes(hour) ? hourLabel(hour) : ""}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-1.5 mt-2 text-[11px] text-gray-500">
          Fewer
          {RAMP.map(color => (
            <span
              key={color}
              className="w-3 h-3 rounded-[3px]"
              style={{ backgroundColor: color }}
            />
          ))}
          More
        </div>
      </div>
    </div>
  );
}
