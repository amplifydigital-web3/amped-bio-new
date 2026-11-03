import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Search, X } from "lucide-react";
import {
  FONT_CATEGORIES,
  FONT_CATEGORY_LABELS,
  FONT_PAIRINGS,
  clampFontPick,
  findFont,
  fontFaceStyle,
  fontStylesheetHref,
  fontWeightRange,
  isVariableFont,
  popularFonts,
  rankFonts,
  searchFonts,
  weightLabel,
  type FontCatalogEntry,
  type FontCategory,
  type FontPairing,
  type FontPick,
  type ThemeConfig,
} from "@repo/constants";
import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetTrigger,
  Button,
  ChipGroup,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@repo/ui";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { OptionGrid, OptionTile } from "../../kit/OptionTile";
import { CreatorBackdrop } from "../../kit/CreatorArt";
import { RangeField } from "../../kit/RangeField";
import { cardFill, useDesign } from "../../kit/useDesign";
import { ensureFontStylesheet, useFontCatalog, useNearViewport } from "./fontCatalog";

// Theme Engine v2 fonts, phase 2b PR 1 (spec 3.8, boards 02 and 02m): the font
// catalog inside the Text row. Name font and Body font, search over the
// catalog, Popular and Pairings shelves, category chips, See all, then
// weight, italics, width and optical size for the picked face. Phones get the
// face controls in a sheet behind Adjust, as the parameter strip does.

type Role = "name" | "body";
type Shelf = "popular" | "pairings" | FontCategory;

const SHELF_TILES = 8;
const PAGE_TILES = 48;
const SAVE_DELAY_MS = 233;

/** The name face as stored, or the v1 look: the body family at 700. */
export function currentNameFont(config: ThemeConfig, fontFamily: string): FontPick {
  return config.nameFont ?? { family: fontFamily, weight: 700 };
}

/** The body face: the theme's fontFamily with its stored weight, italic and axes. */
export function currentBodyFont(config: ThemeConfig, fontFamily: string): FontPick {
  return { family: fontFamily, weight: 400, ...config.bodyFontStyle };
}

/** The patch that writes a face for a role. The body keeps fontFamily for v1 renderers. */
export function fontPatch(role: Role, pick: FontPick): Partial<ThemeConfig> {
  if (role === "name") return { nameFont: pick };
  const { family, ...style } = pick;
  const plain = (style.weight ?? 400) === 400 && !style.italic && !style.axes;
  return { fontFamily: family, bodyFontStyle: plain ? undefined : style };
}

/** The collapsed Text row value: Fraunces and Figtree. */
export function fontsValue(config: ThemeConfig, fontFamily: string): string {
  const name = currentNameFont(config, fontFamily).family;
  return name === fontFamily ? fontFamily : `${name} and ${fontFamily}`;
}

function useDelayedWrite(write: (patch: Partial<ThemeConfig>) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(write);
  latest.current = write;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  return (patch: Partial<ThemeConfig>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(patch), SAVE_DELAY_MS);
  };
}

/** A tile face: loads only the letters it shows, once the tile nears the viewport. */
function TileFace({
  pick,
  text,
  look,
  secondLine,
  secondPick,
}: {
  pick: FontPick;
  text: string;
  look: ThemeConfig;
  secondLine?: string;
  secondPick?: FontPick;
}) {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  useEffect(() => {
    if (!near) return;
    ensureFontStylesheet(fontStylesheetHref([pick], { text }));
    if (secondPick && secondLine) {
      ensureFontStylesheet(fontStylesheetHref([secondPick], { text: secondLine }));
    }
  }, [near, pick, text, secondPick, secondLine]);
  return (
    <div ref={ref} className="h-full w-full">
      <CreatorBackdrop background={look.background}>
        <span
          className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center"
          style={{ ...cardFill(look), color: look.fontColor }}
        >
          <span
            className="block max-w-full truncate text-[22px] leading-[28px]"
            style={fontFaceStyle(pick)}
          >
            {text}
          </span>
          {secondLine && secondPick && (
            <span
              className="block max-w-full truncate text-[13px] leading-[16px]"
              style={fontFaceStyle(secondPick)}
            >
              {secondLine}
            </span>
          )}
        </span>
      </CreatorBackdrop>
    </div>
  );
}

function FontTiles({
  entries,
  role,
  current,
  name,
  look,
  disabled,
  onPick,
  onPreview,
  onPreviewEnd,
}: {
  entries: FontCatalogEntry[];
  role: Role;
  current: FontPick;
  name: string;
  look: ThemeConfig;
  disabled: boolean;
  onPick: (entry: FontCatalogEntry) => void;
  onPreview: (entry: FontCatalogEntry) => void;
  onPreviewEnd: () => void;
}) {
  const selectedIndex = entries.findIndex(entry => entry.f === current.family);
  const tileWeight = role === "name" ? 700 : 400;
  return (
    <OptionGrid label={role === "name" ? "Name font" : "Body font"} columns="four">
      {entries.map((entry, index) => (
        <OptionTile
          key={entry.f}
          label={entry.f}
          badge={isVariableFont(entry) ? { text: "VAR", spoken: "variable" } : undefined}
          accessibleDescription={FONT_CATEGORY_LABELS[entry.c]}
          selected={index === selectedIndex}
          focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
          disabled={disabled}
          onSelect={() => onPick(entry)}
          onPreview={() => onPreview(entry)}
          onPreviewEnd={onPreviewEnd}
          artClassName="h-[89px]"
          art={
            <TileFace pick={clampFontPick(entry, { weight: tileWeight })} text={name} look={look} />
          }
        />
      ))}
    </OptionGrid>
  );
}

function PairingTiles({
  pairings,
  families,
  current,
  name,
  look,
  disabled,
  onPick,
  onPreview,
  onPreviewEnd,
}: {
  pairings: readonly FontPairing[];
  families: readonly FontCatalogEntry[];
  current: { name: string; body: string };
  name: string;
  look: ThemeConfig;
  disabled: boolean;
  onPick: (pairing: FontPairing) => void;
  onPreview: (pairing: FontPairing) => void;
  onPreviewEnd: () => void;
}) {
  const selectedIndex = pairings.findIndex(p => p.name === current.name && p.body === current.body);
  return (
    <OptionGrid label="Font pairings" columns="four">
      {pairings.map((pairing, index) => {
        const nameEntry = findFont(families, pairing.name);
        const bodyEntry = findFont(families, pairing.body);
        if (!nameEntry || !bodyEntry) return null;
        return (
          <OptionTile
            key={`${pairing.name}-${pairing.body}`}
            label={`${pairing.name} and ${pairing.body}`}
            description={pairing.mood}
            selected={index === selectedIndex}
            focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
            disabled={disabled}
            onSelect={() => onPick(pairing)}
            onPreview={() => onPreview(pairing)}
            onPreviewEnd={onPreviewEnd}
            artClassName="h-[89px]"
            art={
              <TileFace
                pick={clampFontPick(nameEntry, { weight: 700 })}
                text={name}
                look={look}
                secondPick={clampFontPick(bodyEntry, { weight: 400 })}
                secondLine="Your bio goes here"
              />
            }
          />
        );
      })}
    </OptionGrid>
  );
}

/** Weight, italics, width and optical size for the picked face (spec 3.8). */
function FaceControls({
  entry,
  pick,
  disabled,
  autoOpsz,
  onChange,
}: {
  entry: FontCatalogEntry;
  pick: FontPick;
  disabled: boolean;
  /** Where the slider rests while optical size is automatic: the text size in px */
  autoOpsz: number;
  onChange: (next: FontPick, mode: "now" | "drag") => void;
}) {
  const [low, high] = fontWeightRange(entry);
  const weight = pick.weight ?? 400;
  const set = (patch: Omit<FontPick, "family">, mode: "now" | "drag") =>
    onChange(
      clampFontPick(entry, {
        weight,
        italic: pick.italic,
        axes: pick.axes,
        ...patch,
        ...(patch.axes ? { axes: { ...pick.axes, ...patch.axes } } : {}),
      }),
      mode
    );
  const wdth = entry.a?.wdth;
  const opsz = entry.a?.opsz;
  const nothing = low === high && !entry.i && !wdth && !opsz;

  if (nothing) {
    return (
      <p className="text-prism-meta text-prism-ink-2">
        {entry.f} comes in one weight, {weightLabel(low)}.
      </p>
    );
  }

  return (
    <div className="space-y-[21px]">
      {entry.a?.wght ? (
        <RangeField
          label="Weight"
          value={weight}
          min={low}
          max={high}
          step={1}
          valueText={weightLabel(weight)}
          disabled={disabled}
          onChange={value => set({ weight: value }, "drag")}
        />
      ) : (
        entry.w.length > 1 && (
          <div className="space-y-2">
            <p className="text-prism-label font-semibold text-prism-ink">Weight</p>
            <ChipGroup
              label="Weight"
              value={String(weight)}
              onChange={value => set({ weight: Number(value) }, "now")}
              options={entry.w.map(w => ({
                value: String(w),
                label: weightLabel(w),
                disabled,
              }))}
            />
          </div>
        )
      )}
      {entry.i && (
        <div className="space-y-2">
          <p className="text-prism-label font-semibold text-prism-ink">Style</p>
          <ChipGroup
            label="Style"
            value={pick.italic ? "italic" : "upright"}
            onChange={value => set({ italic: value === "italic" }, "now")}
            options={[
              { value: "upright", label: "Upright", disabled },
              { value: "italic", label: "Italic", disabled },
            ]}
          />
        </div>
      )}
      {wdth && (
        <RangeField
          label="Width"
          value={pick.axes?.wdth ?? Math.min(wdth[1], Math.max(wdth[0], 100))}
          min={wdth[0]}
          max={wdth[1]}
          step={1}
          valueText={`${Math.round(pick.axes?.wdth ?? 100)}%`}
          disabled={disabled}
          onChange={value => set({ axes: { wdth: value } }, "drag")}
        />
      )}
      {opsz && (
        <RangeField
          label="Optical size"
          value={pick.axes?.opsz ?? Math.min(opsz[1], Math.max(opsz[0], autoOpsz))}
          min={opsz[0]}
          max={opsz[1]}
          step={1}
          valueText={pick.axes?.opsz === undefined ? "Automatic" : `${Math.round(pick.axes.opsz)}`}
          hint="Lower sizes open the letters for small text. Higher sizes sharpen display text."
          disabled={disabled}
          onChange={value => set({ axes: { opsz: value } }, "drag")}
        />
      )}
    </div>
  );
}

function FaceControlsPanel(props: Parameters<typeof FaceControls>[0]) {
  const phone = useMediaQuery(PHONE_QUERY);
  if (!phone) {
    return (
      <div className="prism-well rounded-prism-21 p-[21px]">
        <FaceControls {...props} />
      </div>
    );
  }
  return (
    <BottomSheet>
      <BottomSheetTrigger asChild>
        <Button variant="secondary" className="w-full" disabled={props.disabled}>
          Adjust {props.entry.f}
        </Button>
      </BottomSheetTrigger>
      <BottomSheetContent title={`${props.entry.f} settings`}>
        <div className="space-y-[21px] px-[21px] pb-[34px]">
          <FaceControls {...props} />
          <BottomSheetClose asChild>
            <Button className="w-full">Done</Button>
          </BottomSheetClose>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

function SearchField({
  value,
  onChange,
  count,
}: {
  value: string;
  onChange: (value: string) => void;
  count: number;
}) {
  return (
    <div className="prism-well flex h-touch items-center gap-2 px-3">
      <Search aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-3" />
      <input
        type="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Escape" && value) {
            event.stopPropagation();
            onChange("");
          }
        }}
        aria-label="Search fonts"
        placeholder={`Search ${count.toLocaleString("en-US")} families`}
        className="min-w-0 flex-1 bg-transparent text-prism-body text-prism-ink outline-none placeholder:text-prism-ink-3 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="prism-focus flex h-[34px] w-[34px] items-center justify-center rounded-full"
        >
          <X aria-hidden className="h-4 w-4 text-prism-ink-2" />
        </button>
      )}
    </div>
  );
}

/** Grows the list as its end scrolls into view (See all, 4 per row). */
function MoreSentinel({ onMore }: { onMore: () => void }) {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  useEffect(() => {
    if (near) onMore();
  }, [near, onMore]);
  return <div ref={ref} aria-hidden className="h-px" />;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="space-y-[13px]">{children}</div>;
}

export function FontCatalogPicker() {
  const design = useDesign();
  const { values, config, profile, locked, update, preview, endPreview } = design;
  const look = { ...config, ...values };
  const name = profile.name || "Your name";
  const state = useFontCatalog();
  const [role, setRole] = useState<Role>("name");
  const [shelf, setShelf] = useState<Shelf>("popular");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(SHELF_TILES);
  const expanded = limit > SHELF_TILES;
  const later = useDelayedWrite(update);

  const nameFont = currentNameFont(config, values.fontFamily);
  const bodyFont = currentBodyFont(config, values.fontFamily);
  const current = role === "name" ? nameFont : bodyFont;
  const currentFamily = current.family;

  // A new shelf, search or role starts at the shelf size again
  useEffect(() => setLimit(SHELF_TILES), [shelf, query, role]);

  const families = state.status === "ready" ? state.catalog.families : null;
  const list = useMemo(() => {
    if (!families) return [];
    const category = shelf === "popular" || shelf === "pairings" ? undefined : shelf;
    if (query.trim()) return searchFonts(families, query, category);
    // Popular shows the top 24; See all opens the whole catalog in rank order
    if (shelf === "popular") {
      if (expanded) return rankFonts(families);
      // The picked face leads the shelf when it is not already on it (board 02)
      const shelfFonts = popularFonts(families);
      const picked = findFont(families, currentFamily);
      if (!picked || shelfFonts.slice(0, SHELF_TILES).includes(picked)) return shelfFonts;
      return [picked, ...shelfFonts.filter(entry => entry !== picked)];
    }
    if (shelf === "pairings") return [];
    return rankFonts(families.filter(entry => entry.c === shelf));
  }, [families, shelf, query, expanded, currentFamily]);

  if (state.status === "loading") {
    return (
      <Shell>
        <p className="text-prism-label font-semibold text-prism-ink">Fonts</p>
        <div
          aria-busy="true"
          aria-label="Loading fonts"
          className="grid grid-cols-2 gap-[13px] md:grid-cols-4"
        >
          {Array.from({ length: SHELF_TILES }).map((_, i) => (
            <div key={i} className="h-[89px] animate-pulse rounded-prism-13 bg-prism-nav-tint" />
          ))}
        </div>
      </Shell>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="prism-notice flex items-start gap-2 rounded-prism-13 p-[13px]">
        <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-2">
          <p className="text-prism-meta font-semibold">The font list did not load.</p>
          <Button variant="secondary" onClick={state.retry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const catalog = state.catalog;
  const entry = findFont(catalog.families, current.family);

  const write = (next: FontPick) => update(fontPatch(role, next));
  const pickEntry = (target: FontCatalogEntry) =>
    write(
      clampFontPick(target, {
        weight: current.weight ?? (role === "name" ? 700 : 400),
        italic: current.italic,
      })
    );
  const previewEntry = (target: FontCatalogEntry) =>
    preview(
      fontPatch(
        role,
        clampFontPick(target, {
          weight: current.weight ?? (role === "name" ? 700 : 400),
          italic: current.italic,
        })
      )
    );
  const pairingPatch = (pairing: FontPairing): Partial<ThemeConfig> => {
    const nameEntry = findFont(catalog.families, pairing.name);
    const bodyEntry = findFont(catalog.families, pairing.body);
    if (!nameEntry || !bodyEntry) return {};
    return {
      ...fontPatch("name", clampFontPick(nameEntry, { weight: 700 })),
      ...fontPatch("body", clampFontPick(bodyEntry, { weight: 400 })),
    };
  };

  const searching = query.trim().length > 0;
  const showPairings = shelf === "pairings" && !searching;
  const shown = list.slice(0, limit);
  const familyCount = new Set([nameFont.family, bodyFont.family]).size;
  const seeAllCount = shelf === "popular" && !searching ? catalog.count : list.length;
  const seeAllLabel = searching
    ? `See all ${seeAllCount.toLocaleString("en-US")} results`
    : shelf === "popular"
      ? `See all ${seeAllCount.toLocaleString("en-US")} families`
      : `See all ${seeAllCount.toLocaleString("en-US")} ${FONT_CATEGORY_LABELS[shelf as FontCategory]} families`;

  return (
    <Shell>
      <Tabs value={role} onValueChange={value => setRole(value as Role)}>
        <TabsList aria-label="Font role">
          <TabsTrigger value="name">Name font</TabsTrigger>
          <TabsTrigger value="body">Body font</TabsTrigger>
        </TabsList>
      </Tabs>

      <SearchField value={query} onChange={setQuery} count={catalog.count} />

      <ChipGroup
        label="Font shelf"
        value={shelf}
        onChange={setShelf}
        className="-mx-1 flex-nowrap overflow-x-auto px-1 py-1.5"
        options={[
          { value: "popular", label: "Popular" },
          { value: "pairings", label: "Pairings" },
          ...FONT_CATEGORIES.map(category => ({
            value: category,
            label: FONT_CATEGORY_LABELS[category],
          })),
        ]}
      />

      {showPairings ? (
        <PairingTiles
          pairings={expanded ? FONT_PAIRINGS : FONT_PAIRINGS.slice(0, SHELF_TILES)}
          families={catalog.families}
          current={{ name: nameFont.family, body: bodyFont.family }}
          name={name}
          look={look}
          disabled={locked}
          onPick={pairing => update(pairingPatch(pairing))}
          onPreview={pairing => preview(pairingPatch(pairing))}
          onPreviewEnd={endPreview}
        />
      ) : null}
      {showPairings && !expanded && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setLimit(SHELF_TILES + PAGE_TILES)}
        >
          See all {FONT_PAIRINGS.length} pairings
        </Button>
      )}
      {showPairings ? null : list.length === 0 ? (
        <p className="text-prism-meta text-prism-ink-2" role="status">
          No family matches {query.trim() ? `"${query.trim()}"` : "this shelf"}. Try another
          spelling or another shelf.
        </p>
      ) : (
        <>
          {searching && (
            <p className="text-prism-meta text-prism-ink-2" role="status">
              {list.length.toLocaleString("en-US")} {list.length === 1 ? "family" : "families"}
            </p>
          )}
          <FontTiles
            entries={shown}
            role={role}
            current={current}
            name={name}
            look={look}
            disabled={locked}
            onPick={pickEntry}
            onPreview={previewEntry}
            onPreviewEnd={endPreview}
          />
          {expanded && limit < list.length && (
            <MoreSentinel onMore={() => setLimit(n => Math.min(list.length, n + PAGE_TILES))} />
          )}
          {!expanded && seeAllCount > SHELF_TILES && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setLimit(SHELF_TILES + PAGE_TILES)}
            >
              {seeAllLabel}
            </Button>
          )}
        </>
      )}

      {entry ? (
        <FaceControlsPanel
          entry={entry}
          pick={current}
          disabled={locked}
          autoOpsz={role === "name" ? 26 : parseInt(values.fontSize, 10) || 16}
          onChange={(next, mode) => {
            if (mode === "now") {
              write(next);
              return;
            }
            preview(fontPatch(role, next));
            later(fontPatch(role, next));
          }}
        />
      ) : (
        <p className="text-prism-meta text-prism-ink-2">
          {current.family} is not in the font catalog. Pick a family above to adjust its weight.
        </p>
      )}

      <p className="text-prism-meta text-prism-ink-2">
        Fonts on this page: {familyCount} {familyCount === 1 ? "family" : "families"}. The name font
        loads only its own letters.
      </p>
    </Shell>
  );
}
