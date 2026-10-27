import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ErrorCard, trpc } from "@repo/ui";
import { Eyebrow } from "../../kit/parts";
import { UsersSlab } from "../users/UsersSlab";

// Screen Review 087 I13. Newest users renders the Users row component, five
// rows, with emails masked and a ghost View all users in the slab footer.
export function NewestUsers() {
  const users = useQuery(
    trpc.admin.users.getUsers.queryOptions({
      page: 1,
      limit: 5,
      sortBy: "created_at",
      sortDirection: "desc",
    })
  );

  return (
    <section aria-labelledby="dash-newest" className="space-y-[13px]">
      <Eyebrow id="dash-newest">Newest users</Eyebrow>
      {users.isError ? (
        <ErrorCard
          title="Newest users did not load"
          cause="Check your connection, then try again."
          retryLabel="Retry"
          onRetry={() => void users.refetch()}
        />
      ) : (
        <UsersSlab
          label="Newest users"
          users={users.data?.users ?? []}
          loading={users.isPending}
          showEmails={false}
          onChanged={() => void users.refetch()}
          empty={<p className="px-4 py-5 text-prism-body text-prism-ink-2">No users yet.</p>}
          footer={
            <div className="flex min-h-commit items-center justify-end border-t border-prism-line px-2">
              <Link
                to="/users"
                className="prism-btn-ghost prism-focus inline-flex h-touch items-center gap-2 rounded-prism-13 px-4 text-prism-label font-semibold"
              >
                View all users
                <ArrowRight aria-hidden className="h-5 w-5" />
              </Link>
            </div>
          }
        />
      )}
    </section>
  );
}
