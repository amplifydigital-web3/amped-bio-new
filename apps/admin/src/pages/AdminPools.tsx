import { FC, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Coins,
  ExternalLink,
  FilePen,
  MoreHorizontal,
  RefreshCw,
  SearchX,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Chip,
  EmptyState,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Notice,
  formatHandle,
  trpc,
  trpcClient,
} from "@repo/ui";
import { getChainConfig } from "@repo/web3";
import { CopyButton } from "../kit/CopyButton";
import { FilterChips, SearchWell, retryToast, undoToast } from "../kit/parts";
import { SlabPager, SlabSkeletonRows, rowClass, stickyCell, tdClass, thClass } from "../kit/Slab";
import { WordBadge } from "../kit/WordBadge";
import { formatCount, shortHex } from "../kit/format";
import SyncTransactionDialog from "./SyncTransactionDialog";
import SetTxidDialog from "./SetTxidDialog";
import SyncPoolProgressDialog from "./SyncPoolProgressDialog";

// Screen Review 089 I09 to I15. Pools as a G2 slab: person first creator,
// network names, a Missing badge with Set, a labeled Hidden from Explore
// checkbox with Undo, Sync as a 44 icon button (or Set creation tx when the
// pool cannot sync), explorer and public page links in the row overflow.

type Visibility = "all" | "visible" | "hidden";
const PAGE_SIZE = 20;
const COLUMNS = 8;

type Pool = NonNullable<ReturnType<typeof usePools>["data"]>[number];

function usePools() {
  return useQuery(trpc.admin.pools.getAllPools.queryOptions());
}

const iconButton =
  "prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint";

export const AdminPools: FC = () => {
  const pools = usePools();
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("all");
  const [needsTx, setNeedsTx] = useState(false);
  const [page, setPage] = useState(1);
  const [hiddenOverride, setHiddenOverride] = useState<Record<number, boolean>>({});
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncingPool, setSyncingPool] = useState<Pool | null>(null);
  const [txidPool, setTxidPool] = useState<Pool | null>(null);

  useEffect(() => setPage(1), [search, visibility, needsTx]);
  useEffect(() => setHiddenOverride({}), [pools.data]);

  const all = useMemo(() => pools.data ?? [], [pools.data]);
  const cannotSync = all.filter(pool => !pool.poolAddress || !pool.creationTxid);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter(pool => {
      const hidden = hiddenOverride[pool.id] ?? !!pool.hidden;
      if (visibility === "visible" && hidden) return false;
      if (visibility === "hidden" && !hidden) return false;
      if (needsTx && pool.poolAddress && pool.creationTxid) return false;
      if (!term) return true;
      return [
        pool.name,
        String(pool.id),
        pool.poolAddress,
        pool.wallet?.user?.handle,
        pool.wallet?.user?.email,
      ].some(value => value?.toLowerCase().includes(term));
    });
  }, [all, search, visibility, needsTx, hiddenOverride]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const setHidden = async (pool: Pool, hidden: boolean, fromUndo = false) => {
    const name = pool.name || `Pool #${pool.id}`;
    setHiddenOverride(o => ({ ...o, [pool.id]: hidden }));
    try {
      await trpcClient.admin.pools.setHidden.mutate({ poolId: pool.id, hidden });
      if (!fromUndo) {
        undoToast(
          hidden ? `${name} hidden from Explore` : `${name} visible in Explore`,
          () => void setHidden(pool, !hidden, true)
        );
      }
      void pools.refetch();
    } catch {
      setHiddenOverride(o => ({ ...o, [pool.id]: !hidden }));
      retryToast(`${name} did not update`, () => void setHidden(pool, hidden, fromUndo));
    }
  };

  const filtersOn = search.trim() !== "" || visibility !== "all" || needsTx;

  return (
    <div className="space-y-[13px] font-prism">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <SearchWell
          label="Search pools"
          placeholder="Pool, creator or address"
          value={search}
          onChange={setSearch}
          className="flex-1"
        />
        <Button variant="secondary" onClick={() => setSyncOpen(true)}>
          <ArrowLeftRight aria-hidden />
          Sync transaction
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <FilterChips
          label="Visibility"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: "all", label: "All" },
            { value: "visible", label: "Visible" },
            { value: "hidden", label: "Hidden" },
          ]}
        />
        <Chip selected={needsTx} onClick={() => setNeedsTx(v => !v)}>
          Needs creation tx
        </Chip>
        <p className="ml-auto text-prism-meta tabular-nums text-prism-ink-2">
          {pools.data ? `${formatCount(filtered.length)} pools` : ""}
        </p>
      </div>

      {cannotSync.length > 0 && (
        <Notice
          variant="warning"
          title={`${formatCount(cannotSync.length)} ${cannotSync.length === 1 ? "pool cannot" : "pools cannot"} sync`}
        >
          <p>Set their creation transaction first.</p>
          {!needsTx && (
            <Button variant="ghost" className="-ml-3 mt-1" onClick={() => setNeedsTx(true)}>
              Show them
            </Button>
          )}
        </Notice>
      )}

      {pools.isError ? (
        <ErrorCard
          title="Pools did not load"
          cause="Check your connection, then try again."
          retryLabel="Retry"
          onRetry={() => void pools.refetch()}
        />
      ) : (
        <div className="prism-slab overflow-hidden">
          <div className="overflow-x-auto">
            <table aria-label="Pools" className="w-full min-w-[1040px] text-left">
              <thead>
                <tr>
                  <th scope="col" className={`${thClass} ${stickyCell}`}>
                    Pool
                  </th>
                  <th scope="col" className={thClass}>
                    Creator
                  </th>
                  <th scope="col" className={thClass}>
                    Address
                  </th>
                  <th scope="col" className={thClass}>
                    Network
                  </th>
                  <th scope="col" className={thClass}>
                    Creation tx
                  </th>
                  <th scope="col" className={thClass}>
                    Hidden
                  </th>
                  <th scope="col" className={thClass}>
                    Sync
                  </th>
                  <th scope="col" className={thClass}>
                    <span className="sr-only">More</span>
                  </th>
                </tr>
              </thead>
              {pools.isPending ? (
                <SlabSkeletonRows columns={COLUMNS} />
              ) : rows.length === 0 ? (
                <tbody>
                  <tr className="border-t border-prism-line">
                    <td colSpan={COLUMNS}>
                      {filtersOn ? (
                        <EmptyState
                          icon={SearchX}
                          title="No pools match these filters"
                          action={
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setSearch("");
                                setVisibility("all");
                                setNeedsTx(false);
                              }}
                            >
                              Show all
                            </Button>
                          }
                        />
                      ) : (
                        <EmptyState icon={Coins} title="No pools yet" />
                      )}
                    </td>
                  </tr>
                </tbody>
              ) : (
                <tbody>
                  {rows.map(pool => {
                    const name = pool.name || `Pool #${pool.id}`;
                    const chain = getChainConfig(parseInt(pool.chainId));
                    const explorer = chain?.blockExplorers?.default?.url;
                    const hidden = hiddenOverride[pool.id] ?? !!pool.hidden;
                    const canSync = !!pool.poolAddress && !!pool.creationTxid;
                    const handle = pool.wallet?.user?.handle;
                    return (
                      <tr key={pool.id} className={rowClass}>
                        <td className={`${tdClass} ${stickyCell}`}>
                          <p className="max-w-[233px] truncate text-prism-label font-semibold text-prism-ink">
                            {name}
                          </p>
                          <p className="text-prism-meta tabular-nums text-prism-ink-2">
                            #{pool.id}
                          </p>
                        </td>
                        <td className={tdClass}>
                          {handle ? (
                            <a
                              href={`${import.meta.env.VITE_LANDINGPAGE_URL}/${formatHandle(handle)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="prism-focus rounded-prism-8 text-prism-label text-prism-ink hover:underline"
                            >
                              {formatHandle(handle)}
                              <span className="sr-only"> (opens in a new tab)</span>
                            </a>
                          ) : (
                            <span className="text-prism-label text-prism-ink">
                              {pool.wallet?.user?.email ?? "Unknown"}
                            </span>
                          )}
                        </td>
                        <td className={tdClass}>
                          {pool.poolAddress ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap font-prism-mono text-prism-code-sm text-prism-ink">
                              {shortHex(pool.poolAddress)}
                              <CopyButton
                                value={pool.poolAddress}
                                label={`Copy address of ${name}`}
                                size="inline"
                              />
                            </span>
                          ) : (
                            <WordBadge tone="warning">Missing</WordBadge>
                          )}
                        </td>
                        <td
                          className={`${tdClass} whitespace-nowrap text-prism-meta text-prism-ink`}
                          title={`Chain ID ${pool.chainId}`}
                        >
                          {chain?.name ?? `Chain ${pool.chainId}`}
                        </td>
                        <td className={tdClass}>
                          {pool.creationTxid ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap font-prism-mono text-prism-code-sm text-prism-ink">
                              {shortHex(pool.creationTxid)}
                              <CopyButton
                                value={pool.creationTxid}
                                label={`Copy creation transaction of ${name}`}
                                size="inline"
                              />
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <WordBadge tone="warning">Missing</WordBadge>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setTxidPool(pool)}
                                aria-label={`Set creation transaction of ${name}`}
                              >
                                Set
                              </Button>
                            </span>
                          )}
                        </td>
                        <td className={tdClass}>
                          <Checkbox
                            checked={hidden}
                            onCheckedChange={next => void setHidden(pool, next)}
                            ariaLabel={`${name} hidden from Explore`}
                          >
                            <span className="sr-only">Hidden from Explore</span>
                          </Checkbox>
                        </td>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          {canSync ? (
                            <button
                              type="button"
                              aria-label={`Sync ${name}`}
                              onClick={() => setSyncingPool(pool)}
                              className="prism-icon-btn prism-focus"
                            >
                              <RefreshCw aria-hidden className="h-5 w-5" strokeWidth={1.5} />
                            </button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => setTxidPool(pool)}>
                              Set creation tx
                            </Button>
                          )}
                        </td>
                        <td className={`${tdClass} text-right`}>
                          <Menu>
                            <MenuTrigger
                              aria-label={`More actions for ${name}`}
                              className={iconButton}
                            >
                              <MoreHorizontal aria-hidden className="h-5 w-5" />
                            </MenuTrigger>
                            <MenuContent align="end">
                              {pool.poolAddress && explorer && (
                                <MenuItem asChild>
                                  <a
                                    href={`${explorer}/address/${pool.poolAddress}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink aria-hidden />
                                    Open in explorer
                                  </a>
                                </MenuItem>
                              )}
                              {pool.poolAddress && (
                                <MenuItem asChild>
                                  <a
                                    href={`${import.meta.env.VITE_LANDINGPAGE_URL}/i/pools/${pool.poolAddress}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink aria-hidden />
                                    Open public page
                                  </a>
                                </MenuItem>
                              )}
                              {pool.creationTxid && (
                                <MenuItem onSelect={() => setTxidPool(pool)}>
                                  <FilePen aria-hidden />
                                  Edit creation tx
                                </MenuItem>
                              )}
                            </MenuContent>
                          </Menu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
          <SlabPager
            page={page}
            pages={pages}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPage={setPage}
            noun="Pools"
          />
        </div>
      )}

      <SyncTransactionDialog
        isOpen={syncOpen}
        onClose={() => setSyncOpen(false)}
        onSyncComplete={() => void pools.refetch()}
      />
      {txidPool && (
        <SetTxidDialog
          isOpen
          onClose={() => setTxidPool(null)}
          poolId={txidPool.id}
          poolName={txidPool.name || `Pool #${txidPool.id}`}
          poolAddress={txidPool.poolAddress}
          chainId={txidPool.chainId}
          currentTxid={txidPool.creationTxid}
          onSuccess={() => void pools.refetch()}
        />
      )}
      {syncingPool && (
        <SyncPoolProgressDialog
          isOpen
          onClose={() => setSyncingPool(null)}
          poolId={syncingPool.id}
          poolName={syncingPool.name || `Pool #${syncingPool.id}`}
          onComplete={() => void pools.refetch()}
        />
      )}
    </div>
  );
};
