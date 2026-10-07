import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  BottomSheet,
  BottomSheetContent,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  normalizeHandle,
  trpcClient,
  useAuth,
} from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { toast } from "@/components/ui/toast";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { PublicUrlField } from "@/components/panels/account/PublicUrlRow";
import {
  statusLine,
  usePublicUrlInput,
  type UrlLine,
} from "@/components/panels/account/publicUrlInput";
import type { URLStatus } from "@/hooks/useHandleAvailability";
import { useRefreshPageStatus } from "./pageVisibility";

// QA-008. The one deliberate step that makes a page public. The URL field is
// the Account, Public URL field with its live check, prefilled with the
// current handle. A bottom sheet on phones, a dialog on larger screens.

const TITLE = "Publish your page";
const NOTICE =
  "Anyone with the link can see your page. Search engines can list it once it has a bio or a block.";

function PublishForm({ onDone }: { onDone: () => void }) {
  const { profile, setProfile } = useEditor();
  const { authUser, updateAuthUser } = useAuth();
  const refresh = useRefreshPageStatus();
  const currentHandle = normalizeHandle(profile.handle || authUser?.handle || "");
  const field = usePublicUrlInput(currentHandle);
  const [publishing, setPublishing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [takenOnPublish, setTakenOnPublish] = useState(false);

  const status: URLStatus = takenOnPublish ? "Unavailable" : field.urlStatus;
  const ready = status === "Current" || status === "Available";

  const onInput = (raw: string) => {
    field.onInput(raw);
    setFailed(false);
    setTakenOnPublish(false);
  };

  const publish = async () => {
    if (publishing || !ready) return;
    setPublishing(true);
    setFailed(false);
    const next = normalizeHandle(field.url).toLowerCase();
    try {
      const result = await trpcClient.user.publishPage.mutate(
        field.isCurrentUrl ? undefined : { handle: next }
      );
      if (result.handle !== currentHandle.toLowerCase()) {
        setProfile({ ...profile, handle: result.handle, handleFormatted: `@${result.handle}` });
        updateAuthUser({ handle: result.handle });
      }
      await refresh();
      toast.add({ type: "success", title: "Your page is live." });
      onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/taken/i.test(message)) setTakenOnPublish(true);
      else setFailed(true);
    } finally {
      setPublishing(false);
    }
  };

  const line: UrlLine | null = failed
    ? { tone: "error", text: "Your page did not publish. Try again." }
    : statusLine(status, field.url, field.showChecking);
  const retry = failed ? publish : status === "Error" ? field.recheck : null;

  return (
    <form
      className="space-y-[21px]"
      onSubmit={event => {
        event.preventDefault();
        void publish();
      }}
    >
      <PublicUrlField
        url={field.url}
        onInput={onInput}
        line={line}
        retry={retry}
        cleaned={field.cleaned}
        statusId="publish-url-status"
      />
      <p className="text-prism-body text-prism-ink-2">{NOTICE}</p>
      <div className="flex justify-end">
        <Button
          type="submit"
          size="lg"
          className="min-w-[200px] max-sm:w-full"
          disabled={!ready || publishing}
          aria-busy={publishing}
        >
          {publishing && (
            <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
          )}
          {publishing ? "Publishing" : "Publish"}
        </Button>
      </div>
    </form>
  );
}

export function PublishPageSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const close = () => onOpenChange(false);

  if (phone) {
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange}>
        <BottomSheetContent title={TITLE}>
          {/* Mounted only while open, so the field starts from the current handle */}
          {open && <PublishForm onDone={close} />}
        </BottomSheetContent>
      </BottomSheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>Choose the address people use to reach your page.</DialogDescription>
        </DialogHeader>
        {open && <PublishForm onDone={close} />}
      </DialogContent>
    </Dialog>
  );
}
