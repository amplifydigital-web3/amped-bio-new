import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FacetRequestCard,
  Skeleton,
  describeFacetScope,
  type FacetRequestState,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { facetRequestApi, type FacetOwnerStatus, type FacetRequestRecord } from "./facetRequestApi";

/**
 * Screen Review 107: the editor Dialog variant of the facet request (D21). It
 * opens over the RNS name page at &request=<id> for the owner, behind
 * VITE_SHOW_FACET_REQUEST. Below 640 the shared Dialog is the bottom sheet with
 * r34 top corners and the 44 grab handle (I10).
 *
 * Data comes only from `facetRequestApi`. Until the facet proof API exists the
 * stub answers unavailable and the dialog says so. No request or proof data is
 * invented here.
 */

const OWNER_STATE: Record<Exclude<FacetOwnerStatus, "can_prove">, FacetRequestState> = {
  cannot_prove: "cannot_prove",
  not_verified: "not_verified",
  tier_too_low: "tier_too_low",
};

/** Only follow a redirect the server built for http or https. */
function followRedirect(url: string | null) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      window.location.assign(parsed.toString());
    }
  } catch {
    // A malformed redirect is ignored; the dialog has already closed
  }
}

/** Fires once when the request itself expires (I07). */
function useRequestExpired(request: FacetRequestRecord | null) {
  const [expired, setExpired] = useState(false);
  const expiresAt = request?.requestExpiresAt;
  useEffect(() => {
    setExpired(false);
    if (!expiresAt) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(remaining)) return;
    if (remaining <= 0) {
      setExpired(true);
      return;
    }
    const timer = window.setTimeout(() => setExpired(true), Math.min(remaining, 2 ** 31 - 1));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  return [expired, setExpired] as const;
}

/** A dialog state without the facet card: not available, not found, unsupported. */
function MessageState({
  titleRef,
  title,
  body,
  onClose,
}: {
  titleRef: React.Ref<HTMLHeadingElement>;
  title: string;
  body: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-[21px] font-prism">
      <DialogTitle ref={titleRef} tabIndex={-1} className="pr-12 outline-none">
        {title}
      </DialogTitle>
      <p className="text-prism-body text-prism-ink">{body}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" className="max-sm:w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

function LoadingState({ titleRef }: { titleRef: React.Ref<HTMLHeadingElement> }) {
  return (
    <div aria-busy className="flex flex-col gap-[21px]">
      <DialogTitle ref={titleRef} tabIndex={-1} className="sr-only">
        Loading the request
      </DialogTitle>
      <div className="flex items-start gap-3 pr-12">
        <Skeleton className="h-touch w-touch rounded-prism-13" />
        <span className="flex-1 space-y-2">
          <Skeleton className="h-5 w-full rounded-full" />
          <Skeleton className="h-3 w-24 rounded-full" />
        </span>
      </div>
      <Skeleton className="h-[89px] rounded-prism-21" />
      <div className="grid gap-[13px] sm:grid-cols-2">
        <Skeleton className="h-[110px] rounded-prism-13" />
        <Skeleton className="h-[110px] rounded-prism-13" />
      </div>
    </div>
  );
}

export function FacetRequestDialog({
  requestId,
  onClose,
  onOpenIdentity,
}: {
  requestId: string;
  /** Removes the request from the URL */
  onClose: () => void;
  /** Opens the Identity tab (row 103) */
  onOpenIdentity: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const [phase, setPhase] = useState<"idle" | "working" | "error">("idle");
  const [declining, setDeclining] = useState(false);

  const lookup = useQuery({
    queryKey: ["rns", "facetRequest", requestId],
    queryFn: () => facetRequestApi.lookup(requestId),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const data = lookup.data;
  const request = data?.status === "found" || data?.status === "expired" ? data.request : null;
  const [expiredByClock, setExpired] = useRequestExpired(request);
  const facet = request ? describeFacetScope(request.facetScope) : null;

  let cardState: FacetRequestState | null = null;
  if (request && facet) {
    if (data?.status === "expired" || expiredByClock) cardState = "expired";
    else if (request.ownerStatus === "can_prove")
      cardState = phase === "working" ? "working" : phase === "error" ? "error" : "ready";
    else cardState = OWNER_STATE[request.ownerStatus];
  }

  // Focus follows the title when the dialog changes what it shows (I09)
  const bodyKind = lookup.isPending
    ? "loading"
    : cardState
      ? `card:${cardState === "working" || cardState === "error" ? "ready" : cardState}`
      : (data?.status ?? "error");
  useEffect(() => {
    titleRef.current?.focus();
  }, [bodyKind]);

  /**
   * Decline, Escape, the close button, Close on cannot prove and Close on
   * expired all answer the app the same way: access_denied (I04, I07, I09).
   */
  const decline = async () => {
    if (declining) return;
    setDeclining(true);
    let redirectTo: string | null = null;
    try {
      const result = await facetRequestApi.decline(requestId);
      if (result.status === "declined") redirectTo = result.redirectTo;
    } catch {
      // The request stays pending on the server and expires on its own
    } finally {
      setDeclining(false);
      onClose();
    }
    followRedirect(redirectTo);
  };

  /** 107 I06: working, then done (toast and redirect) or error (Retry, nothing shared). */
  const share = async () => {
    if (!request || phase === "working") return;
    setPhase("working");
    try {
      const result = await facetRequestApi.approve(requestId);
      if (result.status === "shared") {
        toast.add({ title: `Proof shared with ${request.requester.name}`, type: "success" });
        onClose();
        followRedirect(result.redirectTo);
        return;
      }
      if (result.status === "expired") {
        setPhase("idle");
        setExpired(true);
        return;
      }
      setPhase("error");
    } catch {
      setPhase("error");
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    // While the proof is being made the dialog cannot be dismissed
    if (phase === "working") return;
    if (cardState) void decline();
    else onClose();
  };

  let body: React.ReactNode;
  if (lookup.isPending) {
    body = <LoadingState titleRef={titleRef} />;
  } else if (lookup.isError || !data || data.status === "unavailable") {
    body = (
      <MessageState
        titleRef={titleRef}
        title="Proof requests are not available yet"
        body="Apps cannot ask you for a proof yet. Nothing was shared."
        onClose={onClose}
      />
    );
  } else if (data.status === "not_found") {
    body = (
      <MessageState
        titleRef={titleRef}
        title="We could not find this request"
        body="Go back to the app and try again. Nothing was shared."
        onClose={onClose}
      />
    );
  } else if (!request || !facet || !cardState) {
    body = (
      <MessageState
        titleRef={titleRef}
        title="Amped.Bio cannot answer this request"
        body="This app asks for a fact Amped.Bio does not support. Nothing was shared."
        onClose={() => void decline()}
      />
    );
  } else {
    body = (
      <FacetRequestCard
        channel="editor"
        state={cardState}
        requester={request.requester}
        facet={facet}
        scopes={request.scopes}
        proofTtlSeconds={request.proofTtlSeconds}
        titleAs={DialogTitle}
        titleRef={titleRef}
        titleId={titleId}
        onShare={() => void share()}
        onRetry={() => void share()}
        onDecline={() => void decline()}
        onClose={() => void decline()}
        onVerify={onOpenIdentity}
      />
    );
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        // 107 I09: focus opens on the title, never on Share proof
        onOpenAutoFocus={event => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onEscapeKeyDown={event => {
          if (phase === "working") event.preventDefault();
        }}
        onPointerDownOutside={event => {
          if (phase === "working") event.preventDefault();
        }}
      >
        {body}
      </DialogContent>
    </Dialog>
  );
}
