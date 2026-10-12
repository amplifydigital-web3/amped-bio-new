import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button, Notice, cn, normalizeHandle, trpcClient, useAuth } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { toast } from "@/components/ui/toast";
import { copyPageLink } from "@/components/shell/pageLink";
import type { URLStatus } from "@/hooks/useHandleAvailability";
import { statusLine, urlPrefix, usePublicUrlInput, type UrlLine } from "./publicUrlInput";
import { DisclosureRow, useDisclosureGroup } from "../design/kit/DisclosureRow";
import { wellClass } from "../page/blocks/linkValue";

// Screen Review 020. Public URL, the first row of the Account card. One well
// with the address prefix inside it, a status line in words and icon, the old
// links notice, and an explicit Use this URL. Creator URLs read
// amped.bio/handle with no @ (Rob, 30 Sep).

export const PUBLIC_URL_ROW = "url";

function LineIcon({ tone }: { tone: UrlLine["tone"] }) {
  if (tone === "busy") {
    return (
      <Loader2
        aria-hidden
        className="h-[21px] w-[21px] shrink-0 animate-spin text-prism-nav motion-reduce:animate-none"
      />
    );
  }
  if (tone === "error") {
    return <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-danger" />;
  }
  return <CheckCircle2 aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-success" />;
}

const TONE_TEXT: Record<UrlLine["tone"], string> = {
  ok: "text-prism-success",
  muted: "text-prism-ink-2",
  error: "text-prism-danger",
  busy: "text-prism-ink-2",
};

/** 020 I04, I09: one well with the address prefix inside it, then the status line. */
export function PublicUrlField({
  url,
  onInput,
  line,
  retry,
  cleaned,
  statusId,
}: {
  url: string;
  onInput: (raw: string) => void;
  line: UrlLine | null;
  retry: (() => void) | null;
  cleaned: boolean;
  statusId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      {/* A tap on the prefix focuses the input */}
      <div className={wellClass(false)} onClick={() => inputRef.current?.focus()}>
        <span
          aria-hidden
          className="pointer-events-none -mr-1 shrink-0 select-none text-prism-label text-prism-ink-2"
        >
          {urlPrefix()}
        </span>
        <input
          ref={inputRef}
          value={url}
          onChange={event => onInput(event.target.value)}
          aria-label="Public URL handle"
          aria-describedby={statusId}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
        />
        {line && <LineIcon tone={line.tone} />}
      </div>

      <div id={statusId} role="status" aria-live="polite" className="min-h-[21px]">
        {line && (
          <p className={cn("flex items-center gap-1.5 text-prism-meta", TONE_TEXT[line.tone])}>
            <LineIcon tone={line.tone} />
            <span>{line.text}</span>
            {retry && (
              <Button variant="ghost" className="ml-1" onClick={() => void retry()}>
                Retry
              </Button>
            )}
          </p>
        )}
      </div>
      {cleaned && (
        <p className="text-prism-meta text-prism-ink-2">
          Lowercase letters, numbers, hyphens and underscores only.
        </p>
      )}
    </div>
  );
}

function UrlEditor() {
  const { profile, setProfile } = useEditor();
  const { updateAuthUser } = useAuth();
  const { setOpen } = useDisclosureGroup();
  const currentHandle = normalizeHandle(profile.handle || "");
  const field = usePublicUrlInput(currentHandle);
  const { url, urlStatus, isCurrentUrl, recheck } = field;
  const [claiming, setClaiming] = useState(false);
  const [claimFailed, setClaimFailed] = useState(false);
  const [takenOnClaim, setTakenOnClaim] = useState(false);

  const status: URLStatus = takenOnClaim ? "Unavailable" : urlStatus;
  const differs = url !== "" && !isCurrentUrl;

  const onInput = (raw: string) => {
    field.onInput(raw);
    setClaimFailed(false);
    setTakenOnClaim(false);
  };

  const claim = async () => {
    if (claiming || status !== "Available") return;
    setClaiming(true);
    setClaimFailed(false);
    const next = normalizeHandle(url);
    try {
      const response = await trpcClient.handle.redeem.mutate({ newHandle: next });
      if (!response.success) throw new Error(response.message);
      // 020 I07: stay on Account; update the editor and session at once
      setProfile({ ...profile, handle: next, handleFormatted: `@${next}` });
      updateAuthUser({ handle: next });
      setOpen(null);
      toast.add({
        type: "success",
        title: `Your page is now at ${urlPrefix()}${next}`,
        actionProps: { children: "Copy link", onClick: () => void copyPageLink(next) },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/taken/i.test(message)) setTakenOnClaim(true);
      else setClaimFailed(true);
    } finally {
      setClaiming(false);
    }
  };

  const line: UrlLine | null = claimFailed
    ? { tone: "error", text: "That URL did not save." }
    : statusLine(status, url, field.showChecking);
  const retry = claimFailed ? claim : status === "Error" ? recheck : null;

  return (
    <div className="space-y-[13px]">
      <p className="text-prism-meta text-prism-ink-2">
        Visitors use this address to reach your page.
      </p>

      <PublicUrlField
        url={url}
        onInput={onInput}
        line={line}
        retry={retry}
        cleaned={field.cleaned}
        statusId="public-url-status"
      />

      {differs && status === "Available" && (
        <Notice variant="warning" title="Your old links stop working">
          <span className="break-all">
            {urlPrefix()}
            {currentHandle.toLowerCase()}
          </span>{" "}
          will no longer open your page, and someone else can claim it.
        </Notice>
      )}

      {differs && (
        <div className="flex justify-end">
          <Button
            size="lg"
            className="min-w-[200px] max-sm:w-full"
            disabled={status !== "Available" || claiming}
            aria-busy={claiming}
            onClick={() => void claim()}
          >
            {claiming && (
              <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
            )}
            {claiming ? "Claiming" : "Use this URL"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function PublicUrlRow() {
  const { profile } = useEditor();
  const handle = normalizeHandle(profile.handle || "").toLowerCase();
  return (
    <DisclosureRow
      id={PUBLIC_URL_ROW}
      label="Public URL"
      value={handle ? `${urlPrefix()}${handle}` : ""}
    >
      <UrlEditor />
    </DisclosureRow>
  );
}
