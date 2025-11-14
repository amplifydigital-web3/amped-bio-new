import React from "react";
import { User } from "lucide-react";
import UserSkeleton from "./UserSkeleton";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../../../utils/trpc";

// Define filter and sort types
type UserFilter = 'all' | 'active-7-days' | 'has-creator-pool' | 'has-stake-in-pool';
type UserSort = 'newest' | 'name-asc' | 'name-desc';

interface UsersTabProps {
  searchQuery: string;
  userFilter: UserFilter;
  userSort: UserSort;
  handleViewProfile: (username: string) => void;
}

const UsersTab: React.FC<UsersTabProps> = ({ searchQuery, userFilter, userSort, handleViewProfile }) => {
  const { data: users, isLoading } = useQuery(
    trpc.user.getUsers.queryOptions({ 
      search: searchQuery,
      filter: userFilter,
      sort: userSort
    })
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <UserSkeleton key={index} />
          ))
        ) : users && users.length > 0 ? (
          users.map(user => (
            <div
              key={user.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
            >
              {user.banner ? (
                <div className="h-24 bg-gradient-to-r from-blue-500 to-purple-600 relative">
                  <img
                    src={user.banner}
                    alt={`${user.displayName} banner`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-20"></div>
                </div>
              ) : (
                <div className="h-24 bg-gradient-to-r from-blue-500 to-purple-600 relative shadow-inner"></div>
              )}

              <div className="p-6 relative">
                <div className="absolute -top-12 left-6">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.displayName}
                      className="w-16 h-16 rounded-full border-4 border-white shadow-lg object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full border-4 border-white shadow-lg object-cover flex items-center justify-center bg-gray-200 text-gray-500">
                      <User className="w-8 h-8" />
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-semibold text-gray-900">{user.displayName}</h3>
                    </div>
                    <div className="relative group">
                      <span className="px-2 py-1 rounded-full text-xs font-medium cursor-help bg-gray-100 text-gray-700">
                        {user.poolStake.toLocaleString()} Pool Stake
                      </span>
                      <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                        <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                          Amount staked to users pool by others
                          <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-gray-500 mb-2">@{user.username}</p>
                  <div
                    className="text-sm text-gray-600 mb-4 line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: user.bio }}
                  />

                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleViewProfile(user.username)}
                      className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors duration-200 text-sm"
                    >
                      View Profile
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500 col-span-full">
            No users found.
          </div>
        )}
      </div>
    </div>
  );
};

export default UsersTab;