export default function EarningsChart() {
  // This is a simple placeholder component for the earnings chart
  // In a real implementation, you would integrate a charting library like recharts, chart.js, etc.

  return (
    <div className="h-32 w-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center">
      <div className="relative w-full h-full px-4 py-2">
        {/* Chart bars - this is a simple static representation */}
        <div className="absolute bottom-0 left-0 w-full h-full flex items-end justify-between px-4 pb-4">
          {[35, 28, 45, 65, 54, 76, 50].map((height, index) => (
            <div
              key={index}
              style={{ height: `${height}%` }}
              className={`w-[8%] rounded-t-sm ${
                index === 6 ? "bg-blue-500" : "bg-blue-300 bg-opacity-70"
              } transition-all duration-300 hover:bg-blue-500`}
            />
          ))}
        </div>

        {/* Horizontal guide lines */}
        <div className="absolute w-full h-full flex flex-col justify-between opacity-50">
          {[1, 2, 3, 4].map(line => (
            <div key={line} className="border-t border-dashed border-gray-300 w-full h-0"></div>
          ))}
        </div>
      </div>
    </div>
  );
}
