import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, trpc } from "@repo/ui";

// QA-008 (Fan Graph #22). Home for an account with an unpublished page: this
// card takes the place of the setup checklist, in the same lens. Not now
// hides it for 30 days (stored on user_onboarding, so it follows the account).
export function MakeYourPageCard({ onPublish }: { onPublish: () => void }) {
  const queryClient = useQueryClient();
  const dismiss = useMutation(
    trpc.onboarding.mark.mutationOptions({
      onSuccess: next => queryClient.setQueryData(trpc.onboarding.status.queryKey(), next),
    })
  );

  return (
    <section aria-labelledby="make-page-title" className="relative isolate">
      <span aria-hidden className="prism-halo-card" />
      <div className="prism-lens relative rounded-prism-21 p-2">
        <span aria-hidden className="prism-rim" />
        <div className="relative space-y-[21px] p-[13px] font-prism sm:p-[21px]">
          <div className="space-y-2">
            <h2 id="make-page-title" className="text-prism-panel-title text-prism-ink">
              Make your own page
            </h2>
            <p className="text-prism-body text-prism-ink-2">
              Your account can follow creators. Publish a page to share your own links.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-[13px] max-sm:flex-col max-sm:items-stretch">
            <Button size="lg" onClick={onPublish}>
              Publish your page
            </Button>
            <Button
              variant="ghost"
              onClick={() => dismiss.mutate({ moment: "publishCardDismissed" })}
              disabled={dismiss.isPending}
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
