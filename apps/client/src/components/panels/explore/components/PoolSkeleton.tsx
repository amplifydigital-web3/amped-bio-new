const PoolSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    {/* Image skeleton */}
    <div className="h-32 bg-gradient-to-r from-blue-200 to-purple-200 relative animate-pulse"></div>

    <div className="p-6">
      {/* Title skeleton */}
      <div className="h-5 bg-gray-300 rounded w-3/4 mb-2 animate-pulse"></div>

      {/* Description skeleton */}
      <div className="space-y-2 mb-4">
        <div className="h-4 bg-gray-300 rounded w-full animate-pulse"></div>
        <div className="h-4 bg-gray-300 rounded w-4/5 animate-pulse"></div>
      </div>

      {/* Stats skeleton */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-gray-300 rounded w-1/3 animate-pulse"></div>
          <div className="h-4 bg-gray-300 rounded w-1/4 animate-pulse"></div>
        </div>
        <div className="flex items-center justify-between">
          <div className="h-4 bg-gray-300 rounded w-1/3 animate-pulse"></div>
          <div className="h-4 bg-gray-300 rounded w-1/4 animate-pulse"></div>
        </div>
      </div>

      {/* Badge skeleton */}
      <div className="absolute top-2 right-2">
        <div className="h-6 w-16 bg-gray-300 rounded-full animate-pulse"></div>
      </div>

      {/* Action buttons skeleton */}
      <div className="flex space-x-2">
        <div className="flex-1 py-2 px-3 bg-gray-200 rounded-lg animate-pulse"></div>
        <div className="flex-1 py-2 px-3 bg-blue-200 rounded-lg animate-pulse"></div>
      </div>
    </div>
  </div>
);

export default PoolSkeleton;
