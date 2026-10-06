import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  queryClient,
} from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { SESSION_ENDED_EVENT, announceSessionEnded, isSessionEnded } from "@/contexts/unsavedEdits";
import { signInUrl } from "./ShellGate";

/**
 * Screen Review 081 I09. Any 401 during a session (a query, a mutation or an
 * autosave) opens Your session ended on the shared Dialog (bottom sheet below
 * 640). Edits not stored yet are kept in this tab when the dialog opens, and
 * Sign in goes to the public sign in with returnTo set to this URL. The body
 * promises kept edits only when they were kept.
 */
export function SessionEndedDialog() {
  const { keepUnsavedEdits } = useEditor();
  const [open, setOpen] = useState(false);
  const [kept, setKept] = useState(false);

  // Queries and mutations made with React Query report a 401 here
  useEffect(() => {
    const onError = (error: unknown) => {
      if (isSessionEnded(error)) announceSessionEnded();
    };
    const unsubscribeQueries = queryClient.getQueryCache().subscribe(event => {
      if (event.type === "updated" && event.action.type === "error") onError(event.action.error);
    });
    const unsubscribeMutations = queryClient.getMutationCache().subscribe(event => {
      if (event.type === "updated" && event.action.type === "error") onError(event.action.error);
    });
    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, []);

  useEffect(() => {
    const onEnded = () => {
      setKept(keepUnsavedEdits());
      setOpen(true);
    };
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, [keepUnsavedEdits]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-prism-panel-title text-prism-ink">
            Your session ended
          </DialogTitle>
          <DialogDescription className="text-prism-body text-prism-ink-2">
            {kept
              ? "Sign in again to keep editing. We keep your unsaved changes and save them when you are back."
              : "Sign in again to keep editing."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button
            type="button"
            size="lg"
            className="max-sm:w-full"
            onClick={() => window.location.assign(signInUrl())}
          >
            <LogIn aria-hidden />
            Sign in
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
