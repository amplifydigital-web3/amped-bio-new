import { useEffect, useState } from "react";
import { ChevronDown, Download, Eye, EyeOff, SearchX, Users } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Chip,
  EmptyState,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  trpc,
  trpcClient,
} from "@repo/ui";
import { FilterChips, SearchWell } from "../../kit/parts";
import { SlabPager } from "../../kit/Slab";
import { downloadCsv, formatCount, formatDay } from "../../kit/format";
import { UsersSlab, type AdminUser, type UsersSort } from "./UsersSlab";

// Screen Review 087 I14 to I17: the Users destination. A filter bar (search
// well, Role and Status chips, Show emails, Reset filters, one Export menu)
// over the users slab with the pager in its footer.

type RoleFilter = "all" | "user" | "admin";
type StatusFilter = "all" | "active" | "blocked";

const CSV_HEADER = [
  "ID",
  "Name",
  "Email",
  "Handle",
  "Role",
  "Status",
  "Blocks",
  "Themes",
  "Date Joined",
  "Referrer",
  "Wallet Address",
];

type ExportUser = Pick<
  AdminUser,
  "id" | "name" | "email" | "handle" | "role" | "block" | "_count" | "created_at" | "wallet"
> & { referralsReceived?: { referrer: { handle: string | null } }[] };

function csvRows(users: ExportUser[]) {
  return users.map(user => [
    user.id,
    user.name,
    user.email,
    user.handle,
    user.role,
    user.block === "yes" ? "Blocked" : "Active",
    user._count.blocks,
    user._count.themes,
    formatDay(user.created_at),
    user.referralsReceived?.[0]?.referrer.handle ?? "",
    user.wallet?.address ?? "",
  ]);
}

/** Debounces the search so a query runs 300ms after typing stops. */
function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function UserManagement() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [role, setRole] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [showEmails, setShowEmails] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useState<UsersSort>({ column: "created_at", direction: "desc" });
  const debounced = useDebounced(search.trim());
  // Search runs from 2 characters (087 I14)
  const query = debounced.length >= 2 ? debounced : undefined;

  const filters = {
    role: role === "all" ? undefined : role,
    blocked: status === "all" ? undefined : status === "blocked",
    search: query,
    sortBy: sort.column,
    sortDirection: sort.direction,
  };

  const users = useQuery({
    ...trpc.admin.users.getUsers.queryOptions({ page, limit, ...filters }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => setPage(1), [role, status, query, limit]);

  const filtered = role !== "all" || status !== "all" || search !== "";
  const resetFilters = () => {
    setRole("all");
    setStatus("all");
    setSearch("");
  };

  const onSort = (column: string) =>
    setSort(prev =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "desc" }
    );

  const exportPage = () => {
    if (!users.data?.users.length) return;
    downloadCsv("users-current-page.csv", CSV_HEADER, csvRows(users.data.users));
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const result = await trpcClient.admin.users.getAllUsersForExport.query(filters);
      downloadCsv("all-users.csv", CSV_HEADER, csvRows(result.users as ExportUser[]));
    } catch {
      toast.error("The export did not finish", {
        duration: Infinity,
        action: { label: "Retry", onClick: () => void exportAll() },
      });
    } finally {
      setExporting(false);
    }
  };

  const total = users.data?.pagination.total ?? 0;
  const pages = users.data?.pagination.pages ?? 1;

  return (
    <div className="space-y-[13px] font-prism">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <SearchWell
          label="Search users"
          placeholder="Name, email or wallet"
          value={search}
          onChange={setSearch}
          className="min-w-[233px] flex-1"
        />
        <div className="flex flex-wrap gap-2">
          <Chip selected={showEmails} onClick={() => setShowEmails(v => !v)}>
            {showEmails ? (
              <EyeOff aria-hidden className="h-5 w-5" />
            ) : (
              <Eye aria-hidden className="h-5 w-5" />
            )}
            Show emails
          </Chip>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" disabled={exporting} aria-busy={exporting || undefined}>
                <Download aria-hidden />
                Export
                <ChevronDown aria-hidden />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem disabled={!users.data?.users.length} onSelect={exportPage}>
                This page
              </MenuItem>
              <MenuItem disabled={total === 0} onSelect={() => void exportAll()}>
                All matching
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
      {search.trim().length === 1 && (
        <p className="text-prism-meta text-prism-ink-2">Search runs from 2 characters.</p>
      )}

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <FilterChips
          label="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: "all", label: "All" },
            { value: "user", label: "Users" },
            { value: "admin", label: "Admins" },
          ]}
        />
        <FilterChips
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "blocked", label: "Blocked" },
          ]}
        />
        {filtered && (
          <Button variant="ghost" onClick={resetFilters}>
            Reset filters
          </Button>
        )}
        <p className="ml-auto text-prism-meta tabular-nums text-prism-ink-2">
          {users.data ? `${formatCount(total)} users` : ""}
        </p>
      </div>

      {users.isError && !users.data ? (
        <ErrorCard
          title="Users did not load"
          cause="Check your connection, then try again."
          retryLabel="Retry"
          onRetry={() => void users.refetch()}
        />
      ) : (
        <UsersSlab
          label="Users"
          users={users.data?.users ?? []}
          loading={users.isPending}
          showEmails={showEmails}
          sort={sort}
          onSort={onSort}
          onChanged={() => void users.refetch()}
          skeletonRows={Math.min(limit, 10)}
          empty={
            filtered ? (
              <EmptyState
                icon={SearchX}
                title="No users match these filters"
                action={
                  <Button variant="ghost" onClick={resetFilters}>
                    Show all
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={Users} title="No users yet" />
            )
          }
          footer={
            <SlabPager
              page={page}
              pages={pages}
              total={total}
              pageSize={limit}
              onPage={setPage}
              onPageSize={setLimit}
              noun="Users"
            />
          }
        />
      )}
    </div>
  );
}
