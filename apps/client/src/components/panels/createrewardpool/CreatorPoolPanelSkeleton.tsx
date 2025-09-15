import React from "react";

export const CreatorPoolPanelSkeleton = () => (
  <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
    <div className="mb-8">
      <div className="h-8 bg-gray-200 rounded w-1/3 mb-4 animate-pulse"></div>
      <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>
    </div>

    <div className="space-y-8">
      {/* Pool Details Skeleton */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-gray-200 rounded-lg w-10 h-10 animate-pulse"></div>
          <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-2 animate-pulse"></div>
            <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>

          <div>
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-2 animate-pulse"></div>
            <div className="h-24 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Pool Image Skeleton */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-gray-200 rounded-lg w-10 h-10 animate-pulse"></div>
          <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="w-32 h-32 bg-gray-200 rounded-lg animate-pulse"></div>
          <div>
            <div className="h-10 bg-gray-200 rounded-lg w-32 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-40 mt-2 animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Your Initial Stake Skeleton */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-gray-200 rounded-lg w-10 h-10 animate-pulse"></div>
          <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
        </div>
        <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
      </div>

      {/* Creator Fee Skeleton */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-gray-200 rounded-lg w-10 h-10 animate-pulse"></div>
          <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse"></div>
            <div className="h-6 bg-gray-200 rounded w-10 animate-pulse"></div>
          </div>
          <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
        </div>
      </div>

      {/* Staking Tiers Skeleton */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gray-200 rounded-lg w-10 h-10 animate-pulse"></div>
            <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
          </div>
          <div className="h-10 bg-gray-200 rounded-lg w-32 animate-pulse"></div>
        </div>

        <div className="h-4 bg-gray-200 rounded w-full mb-4 animate-pulse"></div>

        <div className="space-y-4">
          {[1, 2].map(item => (
            <div key={item} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gray-200 rounded-lg w-8 h-8 animate-pulse"></div>
                  <div className="h-6 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                </div>
                <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-2 animate-pulse"></div>
                  <div className="h-10 bg-gray-200 rounded-lg animate-pulse"></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-8 bg-gray-200 rounded flex-1 animate-pulse"></div>
                    <div className="w-3 h-3 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-8 bg-gray-200 rounded flex-1 animate-pulse"></div>
                    <div className="w-3 h-3 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Button Skeleton */}
      <div className="flex justify-center pt-6">
        <div className="h-14 bg-gray-200 rounded-xl w-64 animate-pulse"></div>
      </div>
    </div>
  </div>
);
