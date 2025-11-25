const PoolDetailsModalSkeleton = () => {
  return (
    <div className="p-6">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 bg-gray-300 rounded w-48 mb-2 animate-pulse"></div>
            <div className="h-5 bg-gray-200 rounded w-32 animate-pulse"></div>
          </div>
          <div className="w-10 h-10 bg-gray-200 rounded-xl animate-pulse"></div>
        </div>
      </div>

      {/* Hero Section - Image and Stats Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Pool Image Skeleton */}
        <div className="h-64 rounded-2xl overflow-hidden border border-gray-200 animate-pulse">
          <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
            <div className="w-16 h-16 bg-gray-300 rounded-full animate-pulse"></div>
          </div>
        </div>

        {/* Stats Grid - 2x2 with matching height */}
        <div className="h-64">
          <div className="grid grid-cols-2 gap-4 h-full">
            <div className="rounded-xl p-4 border border-blue-100 bg-gray-100 animate-pulse">
              <div className="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
              <div className="h-6 bg-gray-300 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/3 mt-2"></div>
            </div>

            <div className="rounded-xl p-4 border border-yellow-100 bg-gray-100 animate-pulse">
              <div className="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
              <div className="h-6 bg-gray-300 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/3 mt-2"></div>
              <div className="mt-2 h-8 bg-gray-300 rounded-lg"></div>
            </div>

            <div className="rounded-xl p-4 border border-purple-100 bg-gray-100 animate-pulse">
              <div className="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
              <div className="h-6 bg-gray-300 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/3 mt-2"></div>
            </div>

            <div className="rounded-xl p-4 border border-orange-100 bg-gray-100 animate-pulse">
              <div className="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
              <div className="h-6 bg-gray-300 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/3 mt-2"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Full-Width Description */}
      <div className="mb-8">
        <div className="rounded-xl p-6 border border-gray-100 bg-gray-100 animate-pulse">
          <div className="h-5 bg-gray-300 rounded w-1/3 mb-4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
            <div className="h-4 bg-gray-200 rounded w-3/6 mt-4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/4 mt-1"></div>
          </div>
        </div>
      </div>

      {/* Stake Action Error Message - Hidden when loading */}
      {/* No skeleton needed for error message */}

      {/* DialogFooter Skeleton */}
      <div className="border-t border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between">
          <div className="h-10 w-40 bg-gray-200 rounded-xl animate-pulse mb-4 sm:mb-0 sm:mr-4"></div>
          <div className="flex items-center space-x-3">
            <div className="h-12 w-32 bg-red-200 rounded-xl animate-pulse"></div>
            <div className="h-12 w-32 bg-blue-200 rounded-xl animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PoolDetailsModalSkeleton;
