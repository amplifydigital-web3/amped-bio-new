import { useState } from "react";
import { StatBoxProps } from "./types";

interface StatsSectionProps {
  stats: StatBoxProps[];
}

function StatBox({ icon: Icon, label, value, tooltip, color, soon }: StatBoxProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={`relative bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 hover:shadow-md transition-all duration-200 cursor-help touch-manipulation ${soon ? "opacity-70" : ""}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(!showTooltip)} // Touch support for tooltips
    >
      <div className="flex flex-row items-center space-x-3">
        <div className={`p-1.5 sm:p-2 rounded-lg ${color} flex-shrink-0`}>
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5 leading-tight">
            {label}
          </div>
          <div className="text-sm sm:text-lg font-bold text-gray-900 truncate leading-tight">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
        </div>
      </div>

      {/* Soon label */}
      {soon && (
        <div className="absolute top-0 right-0 transform translate-x-1/3 -translate-y-1/3">
          <span className="inline-block bg-yellow-200 text-yellow-800 text-xs px-2 py-0.5 rounded-full font-medium shadow-sm border border-yellow-300">
            Soon
          </span>
        </div>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-20 max-w-xs sm:max-w-none">
          <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 shadow-lg whitespace-normal sm:whitespace-nowrap">
            {tooltip}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StatsSection({ stats }: StatsSectionProps) {

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
      {stats.map((stat, index) => (
        <StatBox
          key={index}
          icon={stat.icon}
          label={stat.label}
          value={stat.value}
          tooltip={stat.tooltip}
          color={stat.color}
          soon={stat.soon}
        />
      ))}
    </div>
  );
}

export default StatsSection;
