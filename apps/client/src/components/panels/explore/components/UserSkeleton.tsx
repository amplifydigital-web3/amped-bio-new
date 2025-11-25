const UserSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    {/* Banner skeleton */}
    <div className="h-24 bg-gradient-to-r from-blue-200 to-purple-200 relative animate-pulse"></div>

    {/* Profile image skeleton */}
    <div className="p-6 relative">
      <div className="absolute -top-12 left-6">
        <div className="w-16 h-16 rounded-full border-4 border-white shadow-lg bg-gray-300 animate-pulse"></div>
      </div>

      <div className="mt-6">
        {/* Name and verification skeleton */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <div className="h-5 bg-gray-300 rounded w-24 animate-pulse"></div>
            <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse"></div>
          </div>
          <div>
            <div className="h-6 bg-gray-300 rounded-full w-28 animate-pulse"></div>
          </div>
        </div>

        {/* Username skeleton */}
        <div className="h-4 bg-gray-300 rounded w-20 mb-2 animate-pulse"></div>

        {/* Bio skeleton */}
        <div className="space-y-2 mb-4">
          <div className="h-4 bg-gray-300 rounded w-full animate-pulse"></div>
          <div className="h-4 bg-gray-300 rounded w-4/5 animate-pulse"></div>
        </div>

        {/* Action button skeleton */}
        <div className="flex space-x-2">
          <div className="flex-1 py-2 px-3 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>
      </div>
    </div>
  </div>
);

export default UserSkeleton;
