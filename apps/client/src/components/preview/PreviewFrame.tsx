import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { Button, Tabs, TabsList, TabsTrigger, cn } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { Preview } from "@/components/Preview";
import { publicPageUrl } from "@/components/shell/pageLink";
import { PUBLISH_FIRST, usePageUnpublished } from "@/components/shell/pageVisibility";
import { requestAddBlock } from "./addBlockRequest";
import { usePreviewBlockSelect, usePreviewTheme } from "./previewHooks";

// Screen Review 006. The live preview: the commitment field frame on desktop
// (Phone and Desktop modes, View page footer) and the full width Preview tab
// on smaller screens. Everything inside the render belongs to the creator.

type Mode = "phone" | "desktop";
const MODE_KEY = "amped:preview-mode";
const DEVICES: Record<Mode, { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "desktop" ? "desktop" : "phone";
  } catch {
    return "phone";
  }
}

function Render({ width }: { width: number }) {
  const { profile, blocks } = useEditor();
  const theme = usePreviewTheme();
  const onBlockSelect = usePreviewBlockSelect();
  return (
    <div style={{ width }} className="h-full">
      <Preview
        isEditing={true}
        profile={profile}
        blocks={blocks}
        theme={theme}
        userId={profile.id}
        onBlockSelect={onBlockSelect}
      />
    </div>
  );
}

/**
 * One device in the frame (006 I02, I03; QA-024, Rob 6 Oct: scale to fit).
 * The page renders at the device size, Phone 390 x 844 or Desktop 1440 x
 * 900, and the whole device scales down to fit the frame, top aligned. The
 * page scrolls inside the device, as it would on a real screen.
 */
function DeviceRender({ width, height }: { width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setBox({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const scale = box.width && box.height ? Math.min(box.width / width, box.height / height, 1) : 0;
  return (
    <div ref={ref} className="absolute inset-0 flex justify-center">
      {scale > 0 && (
        <div
          data-testid="preview-device"
          className="relative shrink-0 overflow-hidden rounded-prism-13 [transform:translateZ(0)]"
          style={{ width: width * scale, height: height * scale }}
        >
          <div
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <Render width={width} />
          </div>
        </div>
      )}
    </div>
  );
}

function OverrideLabel() {
  const { previewOverride } = useEditor();
  if (!previewOverride?.label) return null;
  return (
    <p
      role="status"
      className="prism-raised absolute inset-x-[13px] bottom-[13px] z-10 rounded-prism-13 px-3 py-2 text-prism-meta text-prism-ink-2"
    >
      {previewOverride.label}
    </p>
  );
}

/** QA-008: while the page is unpublished, nobody else can see it. */
function PrivatePreviewLabel() {
  const unpublished = usePageUnpublished();
  if (!unpublished) return null;
  return (
    <p className="prism-raised absolute left-[13px] top-[13px] z-10 rounded-prism-13 px-3 py-1 font-prism text-prism-meta text-prism-ink-2">
      Only you can see this preview.
    </p>
  );
}

function EmptyHint() {
  const { blocks, activePanel, setActivePanelAndNavigate } = useEditor();
  if (blocks.length > 0) return null;
  return (
    <div className="flex items-center gap-3 px-1 font-prism">
      <p className="flex-1 text-prism-body text-prism-ink-2">Your page has no blocks yet</p>
      <Button
        variant="secondary"
        onClick={() => {
          if (activePanel !== "page") setActivePanelAndNavigate("page");
          setTimeout(requestAddBlock, 0);
        }}
      >
        <Plus aria-hidden />
        Add block
      </Button>
    </div>
  );
}

/** The commitment field frame at x 911 on Page and Design (006 I02). */
export function PreviewFrame() {
  const { profile } = useEditor();
  const unpublished = usePageUnpublished();
  const [mode, setMode] = useState<Mode>(readMode);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Storage can be blocked; Phone is the default next time
    }
  }, [mode]);

  return (
    <aside
      aria-label="Live preview"
      className="prism-glass-clear sticky top-[21px] hidden h-[calc(100dvh-42px)] w-[min(508px,40vw)] shrink-0 flex-col gap-[13px] !rounded-prism-34 p-[21px] lg:flex"
    >
      <Tabs value={mode} onValueChange={value => setMode(value as Mode)}>
        <TabsList aria-label="Preview size" className="w-full">
          <TabsTrigger value="phone" className="flex-1">
            Phone
          </TabsTrigger>
          <TabsTrigger value="desktop" className="flex-1">
            Desktop
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* The render viewport is the only clipped layer; translateZ keeps the
          creator's fixed background inside it (006 I04) */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-prism-21 [transform:translateZ(0)]">
        <DeviceRender key={mode} {...DEVICES[mode]} />
        <PrivatePreviewLabel />
        <OverrideLabel />
      </div>

      <EmptyHint />

      <div className="flex items-center justify-end gap-3">
        {unpublished ? (
          <>
            <p id="preview-publish-first" className="text-prism-meta text-prism-ink-2">
              {PUBLISH_FIRST}
            </p>
            <Button variant="secondary" disabled aria-describedby="preview-publish-first">
              View page
              <ExternalLink aria-hidden />
            </Button>
          </>
        ) : (
          <Button variant="secondary" asChild>
            <a href={publicPageUrl(profile.handle)} target="_blank" rel="noopener noreferrer">
              View page
              <ExternalLink aria-hidden />
            </a>
          </Button>
        )}
      </div>
    </aside>
  );
}

/** Edit | Preview tabs below 1024 on Page and Design (006 I01, D10). */
export function PreviewSwitch({
  view,
  onChange,
}: {
  view: "edit" | "preview";
  onChange: (view: "edit" | "preview") => void;
}) {
  return (
    <Tabs value={view} onValueChange={value => onChange(value as "edit" | "preview")}>
      <TabsList aria-label="Edit or preview" className="w-full lg:hidden">
        <TabsTrigger value="edit" className="flex-1">
          Edit
        </TabsTrigger>
        <TabsTrigger value="preview" className="flex-1">
          Preview
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/** The full width preview for the Preview tab. */
export function InlinePreview({ onSelected }: { onSelected: () => void }) {
  const { profile, blocks } = useEditor();
  const theme = usePreviewTheme();
  const onBlockSelect = usePreviewBlockSelect(onSelected);
  return (
    <div className="space-y-[13px] lg:hidden">
      <div
        className={cn(
          "relative h-[calc(100dvh-230px)] min-h-[377px] overflow-hidden rounded-prism-21 [transform:translateZ(0)]"
        )}
      >
        <Preview
          isEditing={true}
          profile={profile}
          blocks={blocks}
          theme={theme}
          userId={profile.id}
          onBlockSelect={onBlockSelect}
        />
        <PrivatePreviewLabel />
        <OverrideLabel />
      </div>
      <EmptyHint />
    </div>
  );
}
