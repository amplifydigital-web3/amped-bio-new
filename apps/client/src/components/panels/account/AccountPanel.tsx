import { useEffect, useState } from "react";
import { ErrorCard, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, useAuth } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { useDelayed } from "@/hooks/useDelayed";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { AccountSettings } from "./AccountSettings";
import { DeveloperPanel } from "../developer/DeveloperPanel";

const TABS = ["settings", "developers"] as const;

// A load that has not finished by then shows the error card (098 I08)
const LOAD_TIMEOUT_MS = 10_000;

// Moves focus to the visible top bar title, the h1 Account (098 I09)
function focusShellTitle() {
  const titles = document.querySelectorAll<HTMLElement>("[data-shell-title]");
  const visible = Array.from(titles).find(title => title.offsetParent !== null);
  visible?.focus({ preventScroll: true });
}

/** 098 I08: the tabs container, then five 55 rows in the G1 clear card. */
function AccountSkeleton() {
  return (
    <div aria-busy aria-label="Loading account" className="px-4 pb-6 pt-5 md:px-6">
      <Skeleton className="h-commit w-[244px] max-w-full rounded-prism-34" />
      <div className="prism-glass-clear mt-[21px] max-w-[610px] px-[21px]">
        {[0, 1, 2, 3, 4].map(index => (
          <div
            key={index}
            className="flex h-commit items-center justify-between border-b border-prism-line last:border-b-0"
          >
            <Skeleton className="h-4 w-[110px] rounded-full" />
            <Skeleton className="h-3 w-[89px] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Account destination (D04, D30), reached from the avatar menu. Settings holds
 * Public URL, Email, Password, Two factor and Connected apps (019 to 021,
 * 092 I16); Developers holds the OAuth apps a person builds (092, which
 * restyles it). The tab lives in ?tab= (098 I02).
 */
export function AccountPanel() {
  const [tab, setTab] = useDestinationTab(TABS);
  const { authUser } = useAuth();
  const { profile, setUser } = useEditor();
  const loaded = !!authUser && !!profile.handle;
  const showSkeleton = useDelayed(!loaded, 400);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (loaded) {
      setFailed(false);
      return;
    }
    const timer = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded]);

  // Focus the h1 on arrival, once the destination has content
  useEffect(() => {
    if (loaded) focusShellTitle();
  }, [loaded]);

  const retry = async () => {
    if (!authUser?.handle || retrying) return;
    setRetrying(true);
    try {
      const result = await setUser(authUser.handle);
      setFailed(!result);
    } catch {
      setFailed(true);
    } finally {
      setRetrying(false);
    }
  };

  if (!loaded) {
    if (failed) {
      return (
        <div className="px-4 pb-6 pt-5 md:px-6">
          <ErrorCard
            title="Your account did not load"
            cause="Check your connection and try again."
            onRetry={() => void retry()}
            retryLabel={retrying ? "Retrying" : "Retry"}
            className="max-w-[610px]"
          />
        </div>
      );
    }
    return showSkeleton ? <AccountSkeleton /> : null;
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
      <div className="px-4 pt-5 md:px-6">
        <TabsList aria-label="Account sections" className="max-sm:w-full">
          <TabsTrigger value="settings" className="max-sm:flex-1">
            Settings
          </TabsTrigger>
          <TabsTrigger value="developers" className="max-sm:flex-1">
            Developers
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="settings" className="mt-0 px-4 pb-6 pt-[21px] md:px-6">
        <AccountSettings />
      </TabsContent>
      {/* Developers keeps its look until row 092 restyles it, on a white surface */}
      <TabsContent
        value="developers"
        className="mx-4 mb-6 mt-[21px] overflow-hidden rounded-prism-21 bg-white shadow-prism-e3 md:mx-6"
      >
        <DeveloperPanel />
      </TabsContent>
    </Tabs>
  );
}
