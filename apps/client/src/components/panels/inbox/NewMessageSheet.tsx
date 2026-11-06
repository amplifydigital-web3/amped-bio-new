import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MESSAGE_UI } from "@repo/constants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Notice,
  trpc,
  trpcClient,
} from "@repo/ui";
import { Composer, Refusal } from "./ConversationView";
import { PersonAvatar } from "./parts";
import { errorMessage, newIdempotencyKey } from "./util";

const S = MESSAGE_UI;

/**
 * New message (spec 8.2 item 2, board m4): find a person in your conversations or type
 * a handle; the server says first whether they take messages from you, so a refusal
 * shows before anything is written. Sending opens the conversation.
 */
export function NewMessageSheet({
  open,
  onOpenChange,
  onOpenConversation,
  initialHandle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenConversation: (conversationId: string, folder: "PRIMARY" | "REQUESTS") => void;
  initialHandle?: string | null;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState(initialHandle ?? "");
  const [handle, setHandle] = useState<string | null>(initialHandle ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setQuery(initialHandle ?? "");
      setHandle(initialHandle ?? null);
      setError(null);
    }
  }, [open, initialHandle]);

  const term = query.trim().replace(/^@/, "");
  const people = useQuery({
    ...trpc.messages.search.queryOptions({ q: term }),
    enabled: open && term.length >= 2 && !handle,
    staleTime: 30_000,
  });
  const can = useQuery({
    ...trpc.messages.canMessage.queryOptions({ handle: handle ?? "" }),
    enabled: open && !!handle,
    retry: false,
  });

  // A handle you already talk to: go straight to that conversation
  useEffect(() => {
    if (can.data?.allowed && can.data.conversationId) {
      onOpenChange(false);
      onOpenConversation(can.data.conversationId, can.data.folder);
    }
  }, [can.data, onOpenChange, onOpenConversation]);

  const send = async (body: string) => {
    if (!handle) return;
    setError(null);
    try {
      const sent = await trpcClient.messages.send.mutate({
        to: handle,
        body,
        idempotencyKey: newIdempotencyKey(),
      });
      void queryClient.invalidateQueries({ queryKey: trpc.messages.list.pathKey() });
      onOpenChange(false);
      onOpenConversation(sent.conversationId, "PRIMARY");
    } catch (e) {
      setError(errorMessage(e, S.failed));
    }
  };

  const notFound = can.isError;
  const person = can.data?.person;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{S.newMessageTitle}</DialogTitle>
          <DialogDescription>{S.toHelp}</DialogDescription>
        </DialogHeader>

        {!handle ? (
          <div className="space-y-[13px]">
            <label
              htmlFor="new-message-to"
              className="block text-prism-label font-semibold text-prism-ink"
            >
              {S.toLabel}
            </label>
            <input
              id="new-message-to"
              autoFocus
              autoComplete="off"
              value={query}
              placeholder={S.toPlaceholder}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && term.length >= 2) {
                  e.preventDefault();
                  setHandle(term.toLowerCase());
                }
              }}
              className="prism-well prism-focus block h-touch w-full rounded-prism-13 px-4 text-prism-label text-prism-ink outline-none placeholder:text-prism-ink-3"
            />
            {(people.data ?? []).length > 0 && (
              <ul className="max-h-[280px] overflow-y-auto">
                {people.data!.map(p => (
                  <li key={p.conversationId}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenConversation(p.conversationId, "PRIMARY");
                      }}
                      className="prism-focus flex min-h-commit w-full items-center gap-3 rounded-prism-13 px-2 text-left hover:bg-white/60"
                    >
                      <PersonAvatar person={p.person} size={34} />
                      <span className="min-w-0">
                        <span className="block truncate text-prism-label font-semibold text-prism-ink">
                          {p.person.name}
                        </span>
                        {p.person.handle && (
                          <span className="block truncate text-prism-meta text-prism-ink-2">
                            @{p.person.handle}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-[13px]">
            <button
              type="button"
              onClick={() => setHandle(null)}
              className="prism-focus flex min-h-touch items-center gap-3 rounded-prism-13 text-left"
              aria-label={`${S.toLabel} @${handle}. Change`}
            >
              <PersonAvatar person={person ?? { name: handle }} size={34} />
              <span className="min-w-0">
                <span className="block truncate text-prism-label font-semibold text-prism-ink">
                  {person?.name ?? `@${handle}`}
                </span>
                <span className="block truncate text-prism-meta text-prism-ink-2">@{handle}</span>
              </span>
            </button>
            {notFound ? (
              <Notice variant="warning">{S.toNotFound}</Notice>
            ) : can.data && !can.data.allowed ? (
              <Refusal refusal={can.data} handle={handle} onFollowed={() => void can.refetch()} />
            ) : can.data?.allowed ? (
              <>
                {can.data.folder === "REQUESTS" && (
                  <p className="text-prism-meta text-prism-ink-2">{S.goesToRequests(handle)}</p>
                )}
                {error && <Notice variant="error">{error}</Notice>}
                <Composer
                  conversationId={null}
                  handle={handle}
                  onSend={body => void send(body)}
                  autoFocus
                />
              </>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
