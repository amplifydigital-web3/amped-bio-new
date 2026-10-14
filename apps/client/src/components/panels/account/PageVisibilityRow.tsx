import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  trpc,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { PublishPageSheet } from "@/components/shell/PublishPageSheet";
import { usePageStatus, useRefreshPageStatus } from "@/components/shell/pageVisibility";
import { DisclosureRow, useDisclosureGroup } from "../design/kit/DisclosureRow";

// QA-008 (Fan Graph #22, decision 3). Page visibility, a row of the Account
// card. Published: Unpublish behind a confirm; the page reads as not found
// and followers stay. Unpublished: Publish opens the publish sheet.

export const PAGE_VISIBILITY_ROW = "visibility";

function VisibilityEditor({ published }: { published: boolean }) {
  const { setOpen } = useDisclosureGroup();
  const refresh = useRefreshPageStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const unpublish = useMutation(
    trpc.user.unpublishPage.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setConfirmOpen(false);
        setOpen(null);
        toast.add({ type: "success", title: "Your page is unpublished." });
      },
      onError: () => toast.add({ type: "error", title: "Your page did not unpublish. Try again." }),
    })
  );

  if (!published) {
    return (
      <div className="space-y-[13px]">
        <p className="text-prism-meta text-prism-ink-2">
          Only you can see your page. Publish it to share your links.
        </p>
        <div className="flex justify-end">
          <Button className="max-sm:w-full" onClick={() => setPublishOpen(true)}>
            Publish
          </Button>
        </div>
        <PublishPageSheet
          open={publishOpen}
          onOpenChange={open => {
            setPublishOpen(open);
            if (!open) setOpen(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-[13px]">
      <p className="text-prism-meta text-prism-ink-2">Anyone with the link can see your page.</p>
      <div className="flex justify-end">
        <Button variant="secondary" className="max-sm:w-full" onClick={() => setConfirmOpen(true)}>
          Unpublish
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={open => !unpublish.isPending && setConfirmOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unpublish your page?</DialogTitle>
            <DialogDescription>
              Your page will show as not found. Your followers stay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={unpublish.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => unpublish.mutate()}
              disabled={unpublish.isPending}
              aria-busy={unpublish.isPending}
            >
              {unpublish.isPending && (
                <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
              )}
              Unpublish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PageVisibilityRow() {
  const status = usePageStatus();
  // Flag off or still loading: no row, so nothing shows a guessed state
  if (!status) return null;
  const published = status === "PUBLISHED";
  return (
    <DisclosureRow
      id={PAGE_VISIBILITY_ROW}
      label="Page visibility"
      value={published ? "Published" : "Not published"}
    >
      <VisibilityEditor published={published} />
    </DisclosureRow>
  );
}
