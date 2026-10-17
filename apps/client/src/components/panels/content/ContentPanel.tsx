import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { Radio, Store } from "lucide-react";
import { EmptyState, Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { CONTENT_COPY } from "./copy";
import { LaterPill } from "./parts";
import { ItemEditor } from "./ItemEditor";
import { LibraryView } from "./LibraryView";
import { CONTENT_PUBLIC_ID_REGEX } from "@repo/constants";

const TABS = ["library", "store", "live"] as const;

/**
 * The Content destination (Build Board #20, decision 14): tabs Library, Store
 * and Live. PR 5 builds Library (cs1, cs2, cs3, cs8). Store arrives with
 * PR 9 and Live with #27; their tabs show Later until then.
 *
 * The open item lives in the URL as ?item=publicId, so Back returns to the
 * library and a link to an item survives a reload.
 */
export function ContentPanel() {
  const [tab, setTab] = useDestinationTab(TABS);
  const [params, setParams] = useSearchParams();
  const raw = params.get("item");
  const itemId = raw && CONTENT_PUBLIC_ID_REGEX.test(raw) ? raw : null;
  const t = CONTENT_COPY.tabs;

  const openItem = useCallback(
    (publicId: string | null) =>
      setParams(current => {
        const next = new URLSearchParams(current);
        next.set("tab", "library");
        if (publicId) next.set("item", publicId);
        else next.delete("item");
        return next;
      }),
    [setParams]
  );

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-5 md:px-6">
        <TabsList aria-label={t.label} className="flex-1">
          <TabsTrigger value="library">{t.library}</TabsTrigger>
          <TabsTrigger value="store" aria-label={t.laterLabel(t.store)}>
            {t.store} <LaterPill className="ml-1.5" />
          </TabsTrigger>
          <TabsTrigger value="live" aria-label={t.laterLabel(t.live)}>
            {t.live} <LaterPill className="ml-1.5" />
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="library" className="mt-0 px-4 pb-6 pt-[21px] md:px-6">
        {itemId ? (
          <ItemEditor key={itemId} publicId={itemId} onBack={() => openItem(null)} />
        ) : (
          <LibraryView onOpenItem={openItem} />
        )}
      </TabsContent>
      <TabsContent value="store" className="mt-0 px-4 pb-6 pt-[21px] md:px-6">
        <div className="prism-glass-clear flex min-h-[377px] items-center justify-center !rounded-prism-21">
          <EmptyState
            icon={Store}
            title={CONTENT_COPY.later.storeTitle}
            description={CONTENT_COPY.later.storeBody}
          />
        </div>
      </TabsContent>
      <TabsContent value="live" className="mt-0 px-4 pb-6 pt-[21px] md:px-6">
        <div className="prism-glass-clear flex min-h-[377px] items-center justify-center !rounded-prism-21">
          <EmptyState
            icon={Radio}
            title={CONTENT_COPY.later.liveTitle}
            description={CONTENT_COPY.later.liveBody}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
