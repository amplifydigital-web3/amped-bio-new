import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { STORE_BLOCK_LABEL_MAX, STORE_BLOCK_PRODUCTS_MAX, STORE_COPY } from "@repo/constants";
import { Button, Notice, trpc } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { wellClass } from "./linkValue";
import type { ConfigChange } from "./BlockFields";

const B = STORE_COPY.block;

/**
 * Store block fields (board st10). The heading only: which products show is the
 * store's (featured first, then the rest, up to 6), so nothing here picks
 * products or carries an amount. While the store is not live, or has no active
 * product, a notice says visitors do not see the block yet.
 */
export function StoreBlockFields({
  config,
  onValid,
}: {
  config: { label?: string; hidden?: boolean };
  onValid: ConfigChange;
}) {
  const [label, setLabel] = useState(config.label ?? "");
  const { setActivePanelAndNavigate } = useEditor();
  const store = useQuery({ ...trpc.store.settings.get.queryOptions(), staleTime: 30_000 });
  const products = useQuery({ ...trpc.store.products.list.queryOptions(), staleTime: 30_000 });
  const live = store.data ? store.data.status === "live" && store.data.salesOn : null;
  const active = products.data ? products.data.filter(p => p.status === "active").length : null;
  const notice = live === false ? B.notLive : active === 0 ? B.noProducts : null;
  const openStore = () => setActivePanelAndNavigate("content", undefined, { tab: "store" });

  return (
    <div className="space-y-[21px]">
      {notice && (
        <Notice variant="info" className="rounded-prism-13">
          <p>{notice}</p>
          <Button variant="ghost" className="mt-2" onClick={openStore}>
            {B.goToStore}
          </Button>
        </Notice>
      )}
      <div className="space-y-2">
        <label
          htmlFor="store-block-label"
          className="block text-prism-label font-semibold text-prism-ink"
        >
          {B.heading}
        </label>
        <div className={wellClass(false)}>
          <input
            id="store-block-label"
            maxLength={STORE_BLOCK_LABEL_MAX}
            value={label}
            onChange={event => {
              setLabel(event.target.value);
              onValid({ ...config, label: event.target.value.trim() });
            }}
            aria-describedby="store-block-label-help"
            className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
          />
        </div>
        <p
          id="store-block-label-help"
          className="flex justify-between text-prism-meta text-prism-ink-2"
        >
          <span>{B.headingHelp}</span>
          <span className="tabular-nums">
            {label.length} / {STORE_BLOCK_LABEL_MAX}
          </span>
        </p>
      </div>
      <p className="text-prism-meta text-prism-ink-2">
        {`Shows up to ${STORE_BLOCK_PRODUCTS_MAX} active products, featured first, and Visit store. 18+ products never show here.`}
      </p>
    </div>
  );
}
