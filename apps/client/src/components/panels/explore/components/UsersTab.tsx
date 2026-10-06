import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import UserSkeleton from "./UserSkeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { trpc } from "@repo/ui";
import { htmlToPlainText } from "@repo/constants";
import { publicPageUrl } from "@/components/shell/pageLink";

// Define filter and sort types
type UserFilter = "all" | "active-7-days" | "has-creator-pool";
type UserSort = "newest" | "name-asc" | "name-desc";

interface UsersTabProps {
  searchQuery: string;
  userFilter: UserFilter;
  userSort: UserSort;
  // 045 I10: the result count beside Sort, and Searching while a new query loads
  onResult?: (result: { count: number; fetching: boolean }) => void;
  // 045 I13: Clear search and Clear filter in the no results state
  emptyActions?: React.ReactNode;
}

// 55 avatar with a hairline ring. With no image, or when it fails to load,
// the first letter of the name on the lens thumb gradient (042 I05).
function Avatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        className="h-[55px] w-[55px] shrink-0 rounded-full object-cover shadow-[0_0_0_1px_rgba(22,21,43,0.10)]"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-[55px] w-[55px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#FFFFFF_0%,#F1F0F9_100%)] text-[20px] font-bold leading-[23px] text-prism-nav-pressed shadow-[0_0_0_1px_rgba(22,21,43,0.10)]"
    >
      {(name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

const UsersTab: React.FC<UsersTabProps> = ({
  searchQuery,
  userFilter,
  userSort,
  onResult,
  emptyActions,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(20); // 20 users per page maximum

  const { data, isLoading, isFetching, isPlaceholderData } = useQuery({
    ...trpc.user.getUsers.queryOptions({
      search: searchQuery,
      filter: userFilter,
      sort: userSort,
      page: currentPage,
      limit: limit,
    }),
    // Keep the current results on screen while a new query loads (045 I10)
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!data) return;
    onResult?.({ count: data.total ?? 0, fetching: isFetching && isPlaceholderData });
  }, [data, isFetching, isPlaceholderData, onResult]);

  // A new query starts from the first page
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, userFilter, userSort]);

  const users = data?.users || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Generate page numbers to show in pagination controls
  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxVisiblePages = 5;

    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    // Adjust start page if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  };

  return (
    <div className="space-y-6">
      {/* Prism people cards (QA-027, from the 042 brief I02 to I06 and I11): G1
          clear, avatar, name, @handle and a two line plain text bio. The whole
          card opens the person's page in a new tab. No banner. */}
      <ul className="grid grid-cols-1 gap-[13px] sm:grid-cols-2 sm:gap-[21px] lg:grid-cols-3 2xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <li key={index}>
              <UserSkeleton />
            </li>
          ))
        ) : users && users.length > 0 ? (
          users.map(user => {
            const bio = htmlToPlainText(user.bio ?? "")
              .replace(/\s+/g, " ")
              .trim();
            return (
              <li key={user.id}>
                <a
                  href={publicPageUrl(user.username)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${user.displayName || `@${user.username}`}'s page, @${user.username} (opens in a new tab)`}
                  title={user.displayName || undefined}
                  className="prism-glass-clear prism-focus flex min-h-[189px] flex-col gap-[13px] p-[21px] font-prism transition-shadow duration-prism-hover ease-prism hover:shadow-prism-e4"
                >
                  <span className="flex items-start gap-[13px]">
                    <Avatar url={user.avatar} name={user.displayName || user.username} />
                    <span className="min-w-0 flex-1 pt-1">
                      <span className="block truncate text-prism-label font-bold text-prism-ink">
                        {user.displayName || `@${user.username}`}
                      </span>
                      <span className="block break-all text-prism-meta text-prism-ink-2">
                        @{user.username}
                      </span>
                    </span>
                    <ExternalLink
                      aria-hidden
                      className="h-[21px] w-[21px] shrink-0 text-prism-ink-2"
                    />
                  </span>
                  {bio && (
                    <span className="line-clamp-2 text-prism-meta text-prism-ink-2">{bio}</span>
                  )}
                </a>
              </li>
            );
          })
        ) : (
          <li className="col-span-full space-y-3 py-8 text-center font-prism text-prism-body text-prism-ink-2">
            <p>No users found.</p>
            {emptyActions}
          </li>
        )}
      </ul>

      {/* Pagination Controls */}
      {total > limit && (
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="text-sm text-gray-700">
            Showing{" "}
            <span className="font-medium">{Math.min((currentPage - 1) * limit + 1, total)}</span> to{" "}
            <span className="font-medium">{Math.min(currentPage * limit, total)}</span> of{" "}
            <span className="font-medium">{total}</span> results
          </div>
          <div className="flex space-x-2">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                currentPage === 1
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </button>

            {/* Page Numbers */}
            {getPageNumbers().map(page => (
              <button
                key={page}
                onClick={() => goToPage(page)}
                className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                  page === currentPage
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                currentPage === totalPages
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersTab;
