import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  roomTransition,
} from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import type { EditorPanelType } from "@/types/editor";

interface ShellNavigationValue {
  /** Go to a destination. Asks first while a save failed or is offline (002 I03). */
  go: (panel: EditorPanelType, options?: { tab?: string }) => void;
}

const ShellNavigationContext = createContext<ShellNavigationValue | null>(null);

/**
 * In app leave guard (Screen Review 002 I03, D11). Moving between destinations
 * flushes a pending save first. If the save fails or the browser is offline,
 * the shared Dialog asks before leaving: Retry save or Leave anyway.
 */
export function ShellNavigationProvider({ children }: { children: ReactNode }) {
  const { activePanel, setActivePanelAndNavigate, flushSave, saveStatus, hasUnsavedChanges } =
    useEditor();
  const [pending, setPending] = useState<{ panel: EditorPanelType; tab?: string } | null>(null);
  const [retrying, setRetrying] = useState(false);

  const navigate = useCallback(
    (panel: EditorPanelType, tab?: string) => {
      const commit = () => setActivePanelAndNavigate(panel, undefined, { tab });
      // A new destination plays the 610 ms room transition (#26, section 3.4).
      // Layout marks the commit; a tab change in the same destination does not transition.
      if (panel !== activePanel) roomTransition(commit);
      else commit();
    },
    [activePanel, setActivePanelAndNavigate]
  );

  const go = useCallback(
    async (panel: EditorPanelType, options?: { tab?: string }) => {
      if (!hasUnsavedChanges) return navigate(panel, options?.tab);
      const stored = await flushSave();
      if (stored) return navigate(panel, options?.tab);
      setPending({ panel, tab: options?.tab });
    },
    [flushSave, hasUnsavedChanges, navigate]
  );

  const retry = async () => {
    setRetrying(true);
    const stored = await flushSave();
    setRetrying(false);
    if (stored && pending) {
      navigate(pending.panel, pending.tab);
      setPending(null);
    }
  };

  const leave = () => {
    if (pending) navigate(pending.panel, pending.tab);
    setPending(null);
  };

  const value = useMemo(
    () => ({ go: (p: EditorPanelType, o?: { tab?: string }) => void go(p, o) }),
    [go]
  );

  return (
    <ShellNavigationContext.Provider value={value}>
      {children}
      <Dialog open={pending !== null} onOpenChange={open => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changes not saved yet</DialogTitle>
            <DialogDescription>
              {saveStatus === "offline"
                ? "You are offline. Your latest changes save when you reconnect."
                : "Your latest changes could not be saved. Try again, or leave and lose them."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={leave}>
              Leave anyway
            </Button>
            <Button onClick={retry} disabled={retrying} aria-busy={retrying}>
              Retry save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ShellNavigationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useShellNavigation() {
  const context = useContext(ShellNavigationContext);
  if (!context) throw new Error("useShellNavigation must be used inside ShellNavigationProvider");
  return context;
}
