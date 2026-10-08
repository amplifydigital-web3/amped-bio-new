import { useEffect, useState } from "react";
import { z } from "zod";
import {
  ExternalLink,
  Fingerprint,
  Lock,
  MoreHorizontal,
  Pencil,
  ShieldOff,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  cn,
  trpcClient,
  type RouterOutputs,
} from "@repo/ui";
import { CopyButton } from "../../kit/CopyButton";
import { ConfirmDialog, retryToast } from "../../kit/parts";
import { WordBadge } from "../../kit/WordBadge";
import {
  SlabSkeletonRows,
  SortHeader,
  rowClass,
  stickyCell,
  tdClass,
  thClass,
  type SortDirection,
} from "../../kit/Slab";
import { formatCount, formatDay, maskEmailShort, publicPageUrl, shortHex } from "../../kit/format";

// Screen Review 087 I13, I15, I16, I18. One users slab for the Users page and
// the dashboard's Newest users, so both render the same row: Person first,
// masked email with copy, word badges, tabular counts, wallet 6 plus 4 with
// copy, and the row actions (View, Edit, overflow with Block or Unblock and
// Turn off two factor).

export type AdminUser = RouterOutputs["admin"]["users"]["getUsers"]["users"][number];

const COLUMNS = 10;

function Avatar({ user }: { user: AdminUser }) {
  const [failed, setFailed] = useState(false);
  if (user.image && !failed) {
    return (
      <img
        src={user.image}
        alt=""
        onError={() => setFailed(true)}
        className="h-[21px] w-[21px] shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-prism-ink shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)]"
    >
      {(user.name || user.handle || "?").charAt(0).toUpperCase()}
    </span>
  );
}

const editSchema = z.object({
  name: z.string().trim().min(1, "Add a name."),
  email: z.string().trim().email("Use an email address, for example name@example.com."),
});

function EditUserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setErrors({});
  }, [user]);

  if (!user) return null;
  const changes = [
    { label: "Name", before: user.name, after: name.trim() },
    { label: "Email", before: user.email, after: email.trim() },
  ].filter(change => change.after !== change.before);

  const check = (field: "name" | "email") => {
    const result = editSchema.shape[field].safeParse(field === "name" ? name : email);
    setErrors(e => ({
      ...e,
      [field]: result.success ? undefined : result.error.errors[0]?.message,
    }));
  };

  const save = async () => {
    const parsed = editSchema.safeParse({ name, email });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.errors)
        next[issue.path[0] as "name" | "email"] = issue.message;
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      await trpcClient.admin.users.updateUser.mutate({
        id: user.id,
        name: parsed.data.name,
        email: parsed.data.email,
      });
      toast.success(`Saved @${user.handle ?? user.name}`);
      onSaved();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      setErrors(
        message.includes("email")
          ? { email: "This email is already used by another account." }
          : { form: "The changes did not save. Try again." }
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit @{user.handle ?? user.name}</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          onSubmit={event => {
            event.preventDefault();
            void save();
          }}
          className="space-y-5"
        >
          <Input
            label="Name"
            value={name}
            onChange={event => setName(event.target.value)}
            onBlur={() => check("name")}
            error={errors.name}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            onBlur={() => check("email")}
            error={errors.email}
          />
          {changes.length > 0 && (
            <dl className="prism-slab divide-y divide-prism-line">
              {changes.map(change => (
                <div
                  key={change.label}
                  className="grid min-h-touch grid-cols-[89px_1fr] items-center gap-3 px-4 py-2"
                >
                  <dt className="text-prism-label text-prism-ink-2">{change.label}</dt>
                  <dd className="min-w-0 break-words text-prism-label text-prism-ink">
                    <span className="text-prism-ink-2 line-through">{change.before}</span>
                    <span className="block font-semibold">{change.after}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {errors.form && (
            <p role="alert" className="text-prism-meta text-prism-danger">
              {errors.form}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={changes.length === 0 || saving}
              aria-busy={saving || undefined}
            >
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface UsersSort {
  column: string;
  direction: SortDirection;
}

export function UsersSlab({
  users,
  loading,
  showEmails,
  sort,
  onSort,
  onChanged,
  label,
  footer,
  empty,
  skeletonRows = 5,
}: {
  users: AdminUser[];
  loading: boolean;
  showEmails: boolean;
  sort?: UsersSort;
  onSort?: (column: string) => void;
  // Refetch after an action settles
  onChanged: () => void;
  label: string;
  footer?: React.ReactNode;
  empty?: React.ReactNode;
  skeletonRows?: number;
}) {
  // Block state shown before the server answers (087 I16); cleared on refetch
  const [blockOverride, setBlockOverride] = useState<Record<number, "yes" | "no">>({});
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [twoFactorUser, setTwoFactorUser] = useState<AdminUser | null>(null);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);

  useEffect(() => setBlockOverride({}), [users]);

  const setBlock = async (user: AdminUser, block: "yes" | "no", fromUndo = false) => {
    const handle = `@${user.handle ?? user.name}`;
    setBlockOverride(o => ({ ...o, [user.id]: block }));
    try {
      await trpcClient.admin.users.updateUser.mutate({ id: user.id, block });
      if (!fromUndo) {
        toast.success(block === "yes" ? `Blocked ${handle}` : `Unblocked ${handle}`, {
          duration: 8000,
          action: {
            label: "Undo",
            onClick: () => void setBlock(user, block === "yes" ? "no" : "yes", true),
          },
        });
      }
      onChanged();
    } catch {
      setBlockOverride(o => ({ ...o, [user.id]: block === "yes" ? "no" : "yes" }));
      retryToast(
        block === "yes" ? `${handle} was not blocked` : `${handle} was not unblocked`,
        () => void setBlock(user, block, fromUndo)
      );
    }
  };

  const turnOffTwoFactor = async () => {
    if (!twoFactorUser) return;
    const user = twoFactorUser;
    setTwoFactorBusy(true);
    try {
      await trpcClient.admin.users.disableUserTwoFactor.mutate({ userId: user.id });
      toast.success(`Two factor turned off for @${user.handle ?? user.name}`);
      setTwoFactorUser(null);
      onChanged();
    } catch {
      setTwoFactorUser(null);
      retryToast("Two factor was not turned off", () => setTwoFactorUser(user));
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const header = (key: string, text: string, align: "left" | "right" = "left") =>
    sort && onSort ? (
      <SortHeader
        label={text}
        column={key}
        sort={sort}
        onSort={onSort}
        align={align}
        className={cn(align === "right" && "text-right", key === "name" && stickyCell)}
      />
    ) : (
      <th
        scope="col"
        className={cn(thClass, align === "right" && "text-right", key === "name" && stickyCell)}
      >
        {text}
      </th>
    );

  return (
    <>
      <div className="prism-slab overflow-hidden font-prism">
        <div className="relative overflow-x-auto">
          <table aria-label={label} className="w-full min-w-[1040px] border-collapse text-left">
            <thead>
              <tr>
                {header("name", "Person")}
                {header("email", "Email")}
                {header("role", "Role")}
                <th scope="col" className={thClass}>
                  Status
                </th>
                {header("blocks", "Blocks", "right")}
                {header("themes", "Themes", "right")}
                {header("totalClicks", "Clicks", "right")}
                {header("created_at", "Joined")}
                <th scope="col" className={thClass}>
                  Wallet
                </th>
                <th scope="col" className={cn(thClass, "text-right")}>
                  Actions
                </th>
              </tr>
            </thead>
            {loading ? (
              <SlabSkeletonRows rows={skeletonRows} columns={COLUMNS} />
            ) : users.length === 0 ? (
              <tbody>
                <tr className="border-t border-prism-line">
                  <td colSpan={COLUMNS}>{empty}</td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {users.map(user => {
                  const block = blockOverride[user.id] ?? user.block;
                  const blocked = block === "yes";
                  const handle = user.handle ? `@${user.handle}` : user.name;
                  const wallet = user.wallet?.address;
                  return (
                    <tr key={user.id} className={rowClass}>
                      <td className={cn(tdClass, stickyCell)}>
                        <div className="flex items-center gap-3">
                          <Avatar user={user} />
                          <div className="min-w-0">
                            <p className="max-w-[189px] truncate text-prism-label font-semibold text-prism-ink">
                              {user.name}
                            </p>
                            {user.handle && (
                              <p className="text-prism-meta text-prism-ink-2">@{user.handle}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={tdClass}>
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-prism-meta text-prism-ink">
                          {showEmails ? user.email : maskEmailShort(user.email)}
                          <CopyButton
                            value={user.email}
                            label={`Copy email of ${handle}`}
                            size="inline"
                          />
                        </span>
                      </td>
                      <td className={tdClass}>
                        {user.role === "admin" ? (
                          <WordBadge tone="nav">Admin</WordBadge>
                        ) : (
                          <WordBadge tone="ink">User</WordBadge>
                        )}
                      </td>
                      <td className={tdClass}>
                        {blocked ? (
                          <WordBadge tone="danger">Blocked</WordBadge>
                        ) : (
                          <WordBadge tone="success">Active</WordBadge>
                        )}
                      </td>
                      <td className={cn(tdClass, "text-right text-prism-label tabular-nums")}>
                        {formatCount(user._count.blocks)}
                      </td>
                      <td className={cn(tdClass, "text-right text-prism-label tabular-nums")}>
                        {formatCount(user._count.themes)}
                      </td>
                      <td className={cn(tdClass, "text-right text-prism-label tabular-nums")}>
                        {formatCount(user.totalClicks)}
                      </td>
                      <td
                        className={cn(
                          tdClass,
                          "whitespace-nowrap text-prism-meta tabular-nums text-prism-ink"
                        )}
                      >
                        {formatDay(user.created_at)}
                      </td>
                      <td className={tdClass}>
                        {wallet ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap font-prism-mono text-prism-code-sm text-prism-ink">
                            {shortHex(wallet)}
                            <CopyButton
                              value={wallet}
                              label={`Copy wallet address of ${handle}`}
                              size="inline"
                            />
                          </span>
                        ) : (
                          <span className="text-prism-meta text-prism-ink-2">None</span>
                        )}
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap text-right")}>
                        <span className="inline-flex items-center gap-1">
                          {user.handle ? (
                            <a
                              href={publicPageUrl(user.handle)}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`View ${handle} public page (opens in a new tab)`}
                              className="prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint"
                            >
                              <ExternalLink aria-hidden className="h-5 w-5" strokeWidth={1.5} />
                            </a>
                          ) : (
                            <span className="inline-block w-touch" />
                          )}
                          <button
                            type="button"
                            aria-label={`Edit ${handle}`}
                            onClick={() => setEditing(user)}
                            className="prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint"
                          >
                            <Pencil aria-hidden className="h-5 w-5" strokeWidth={1.5} />
                          </button>
                          <Menu>
                            <MenuTrigger
                              aria-label={`More actions for ${handle}`}
                              className="prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint"
                            >
                              <MoreHorizontal aria-hidden className="h-5 w-5" />
                            </MenuTrigger>
                            <MenuContent align="end">
                              <MenuItem
                                onSelect={() => void setBlock(user, blocked ? "no" : "yes")}
                              >
                                {blocked ? <Unlock aria-hidden /> : <Lock aria-hidden />}
                                {blocked ? `Unblock ${handle}` : `Block ${handle}`}
                              </MenuItem>
                              {user.twoFactorEnabled && (
                                <MenuItem destructive onSelect={() => setTwoFactorUser(user)}>
                                  <ShieldOff aria-hidden />
                                  Turn off two factor
                                </MenuItem>
                              )}
                              <MenuSeparator />
                              <MenuItem
                                onSelect={() =>
                                  void navigator.clipboard
                                    .writeText(String(user.id))
                                    .then(() => toast.success("User ID copied"))
                                }
                              >
                                <Fingerprint aria-hidden />
                                Copy user ID
                              </MenuItem>
                            </MenuContent>
                          </Menu>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
        {footer}
      </div>

      <EditUserDialog user={editing} onClose={() => setEditing(null)} onSaved={onChanged} />
      <ConfirmDialog
        open={!!twoFactorUser}
        onOpenChange={open => !open && setTwoFactorUser(null)}
        title={`Turn off two factor for @${twoFactorUser?.handle ?? twoFactorUser?.name ?? ""}?`}
        body="They can sign in with only their password until they set it up again."
        confirmLabel="Turn off two factor"
        destructive
        busy={twoFactorBusy}
        onConfirm={() => void turnOffTwoFactor()}
      />
    </>
  );
}
