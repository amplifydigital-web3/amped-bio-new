import { useState } from "react";
import { CheckCircle2, ImageOff, Lock } from "lucide-react";
import { BottomSheet, BottomSheetContent, Button, cn, trpcClient } from "@repo/ui";
import type { MarketplaceTheme } from "@repo/constants";
import { useEditor } from "@/contexts/EditorContext";
import { toast } from "@/components/ui/toast";
import { Preview } from "@/components/Preview";
import { useThemeActions } from "../kit/useThemeActions";

// Screen Review 033. One theme: G1 clear card, 3:4 art, name, two line byline.
// The whole card is the control (a radio in the Themes radiogroup). Selecting
// it makes it the region's one prism lens with the rim and an Apply footer; on
// phones a tap opens a full height preview sheet instead.

function isLockedTheme(theme: MarketplaceTheme) {
  return theme.user_id === null;
}

function useIsCurrentTheme() {
  const { theme } = useEditor();
  return (card: MarketplaceTheme) => {
    const numeric = Number(card.id);
    if (card.user_id === null && Number.isFinite(numeric)) return theme.id === numeric;
    // Local themes are stored as the creator's own theme under the same name
    return theme.user_id !== null && theme.name === card.name;
  };
}

/** Server first, then the editor; Undo for 8 seconds (033 I03, I04). */
function useApplyTheme() {
  const { theme: previous } = useEditor();
  const { restoreTheme, storeOwnTheme, refetch, ensureSaved } = useThemeActions();
  const [applying, setApplying] = useState<string | null>(null);

  const apply = async (card: MarketplaceTheme) => {
    setApplying(card.id);
    const before = previous;
    const numeric = Number(card.id);
    const marketplace = card.user_id === null && Number.isFinite(numeric);
    try {
      await ensureSaved();
      if (marketplace) {
        await trpcClient.theme.applyTheme.mutate({ themeId: numeric });
      } else {
        // Local theme files: every space replaced (I04)
        const response = await fetch(`/themes/${card.name.replaceAll(" ", "_")}.ampedtheme`);
        if (!response.ok) throw new Error(`Theme file ${response.status}`);
        const config = await response.json();
        await storeOwnTheme(card.name, config, card.description);
      }
      await refetch();
      toast.add({
        type: "success",
        title: `${card.name} applied`,
        duration: 8000,
        actionProps: {
          children: "Undo",
          onClick: () => {
            void restoreTheme(before, !marketplace).catch(() =>
              toast.add({ type: "error", title: "Could not undo. Pick your theme again." })
            );
          },
        },
      });
    } catch {
      toast.add({
        type: "error",
        title: `${card.name} was not applied.`,
        actionProps: { children: "Retry", onClick: () => void apply(card) },
      });
    } finally {
      setApplying(null);
    }
  };

  return { apply, applying };
}

function ThemeArt({ card }: { card: MarketplaceTheme }) {
  const [failed, setFailed] = useState(false);
  if (!card.thumbnail || failed) {
    return (
      <div className="prism-glass-clear flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 !rounded-prism-13 p-2 text-center">
        <ImageOff aria-hidden className="h-[34px] w-[34px] text-prism-ink-3" strokeWidth={1.5} />
        <span className="text-prism-meta text-prism-ink-2">{card.name}</span>
      </div>
    );
  }
  return (
    <img
      src={card.thumbnail}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-[3/4] w-full rounded-prism-13 object-cover"
    />
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "category" | "selected" }) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] items-center gap-1 rounded-prism-8 px-2 text-prism-meta",
        tone === "selected" ? "bg-prism-nav font-semibold text-white" : "bg-white/90 text-prism-ink"
      )}
    >
      {children}
    </span>
  );
}

export function ThemeCard({
  card,
  selected,
  focusable,
  mobile,
  onSelect,
}: {
  card: MarketplaceTheme;
  selected: boolean;
  focusable: boolean;
  mobile: boolean;
  onSelect: (card: MarketplaceTheme | null) => void;
}) {
  const { setPreviewOverride, profile, blocks, theme } = useEditor();
  const isCurrent = useIsCurrentTheme()(card);
  const locked = isLockedTheme(card);
  const { apply, applying } = useApplyTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const busy = applying === card.id;

  const previewThis = () =>
    setPreviewOverride({ config: card.theme, label: `Previewing ${card.name}. Not applied yet.` });

  const labelParts = [card.name, locked ? "Locked" : null, isCurrent ? "Current" : null];

  const select = () => {
    if (busy) return;
    if (mobile) {
      setSheetOpen(true);
      return;
    }
    onSelect(selected ? null : card);
  };

  const applyButton = isCurrent ? (
    <p className="flex items-center gap-1.5 text-prism-meta text-prism-success">
      <CheckCircle2 aria-hidden className="h-4 w-4" /> Applied
    </p>
  ) : (
    <Button
      size="lg"
      className="w-full"
      disabled={busy}
      aria-busy={busy}
      onClick={event => {
        event.stopPropagation();
        void apply(card).then(() => setSheetOpen(false));
      }}
    >
      {busy ? "Applying" : "Apply theme"}
    </Button>
  );

  return (
    <>
      <div
        role="radio"
        aria-checked={selected}
        aria-label={labelParts.filter(Boolean).join(", ")}
        tabIndex={focusable ? 0 : -1}
        onClick={select}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select();
          } else if (event.key === "Escape" && selected) {
            onSelect(null);
          }
        }}
        onPointerEnter={selected ? undefined : previewThis}
        onFocus={selected ? undefined : previewThis}
        className={cn(
          "prism-focus group relative flex cursor-pointer flex-col gap-2 p-2 font-prism outline-none",
          selected ? "prism-lens" : "prism-glass-clear",
          busy && "pointer-events-none"
        )}
      >
        {selected && (
          <>
            <span aria-hidden className="prism-halo-card" />
            <span aria-hidden className="prism-rim" />
          </>
        )}
        <div className="relative">
          <ThemeArt card={card} />
          <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
            {isCurrent && <Badge tone="selected">Current</Badge>}
            {locked && (
              <Badge tone="category">
                <Lock aria-hidden className="h-[13px] w-[13px]" /> Locked
              </Badge>
            )}
          </div>
        </div>
        <div className="px-1 pb-1">
          <p className="truncate text-prism-label font-bold text-prism-ink">{card.name}</p>
          {selected ? (
            <p className="mt-1 text-prism-meta text-prism-ink-2">{card.description}</p>
          ) : (
            <p className="mt-1 line-clamp-2 text-prism-meta text-prism-ink-2">{card.description}</p>
          )}
        </div>
        {selected && (
          <div className="space-y-2 px-1 pb-1">
            {locked && (
              <p className="text-prism-meta text-prism-ink-2">
                Locked themes apply as is. Make an editable copy afterwards to change the style.
              </p>
            )}
            {applyButton}
          </div>
        )}
      </div>

      {/* I02: phone preview sheet */}
      {mobile && (
        <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <BottomSheetContent title={card.name} className="h-[90dvh]">
            <div className="flex h-full flex-col">
              <div className="-mx-5 min-h-0 flex-1 overflow-y-auto">
                <Preview
                  isEditing={true}
                  profile={profile}
                  blocks={blocks}
                  theme={{ ...theme, config: { ...theme.config, ...card.theme } }}
                  userId={profile.id}
                />
              </div>
              <div className="space-y-2 pt-3">
                {locked && (
                  <p className="text-prism-meta text-prism-ink-2">
                    Locked themes apply as is. Make an editable copy afterwards to change the style.
                  </p>
                )}
                {applyButton}
              </div>
            </div>
          </BottomSheetContent>
        </BottomSheet>
      )}
    </>
  );
}
