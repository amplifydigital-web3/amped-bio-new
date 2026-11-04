"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { themeFileV2 } from "@repo/constants";
import { Button, CreatorButton, CreatorPage, themeFileName, usePausedChoice } from "@repo/ui";
import { Eyebrow } from "@/components/layout/PublicPage";
import { authClient } from "@/lib/auth-client";
import { getPanelEditUrl, getPanelLookUrl } from "@/lib/panel";
import { trpcClient } from "@/lib/trpc";
import type { SharedLook } from "@/lib/sharedLook";

/**
 * Theme Engine v2 TE-4b, the share link page (spec 3.9, boards 06, 06m, 13).
 * The look on placeholder content with Pause motion, its layers and cost,
 * then Use this look, Save to My looks and Download when the author allows it.
 * Signed out, the actions go through sign up and come back here to finish.
 */

export const LAYER_NAMES: Record<string, string> = {
  scene: "Scene",
  container: "Container",
  button: "Buttons",
  buttonHover: "Button hover",
  buttonPress: "Button press",
  name: "Name",
  cursor: "Cursor",
};

export const CARRY_LINE =
  "Your photo, name, bio and links stay yours. The look carries effects, fonts and colors, never code. You can change any layer after you apply it.";

export const LIMIT_LINE =
  "You have 10 looks, the most you can keep. Delete one in Design, then save this one.";

const UNDO_MS = 8000;

type Mode = "apply" | "save";
type Done = {
  mode: Mode;
  themeId: number;
  undoVersionId: string | null;
  backgroundKept: boolean;
};

/** The cost line under the layers (spec 3.7 words). */
export function costLine(cost: SharedLook["cost"]): string {
  if (cost.level === "still" || cost.count === 0) return "Still. Nothing on the page moves.";
  const effects = `${cost.count} ${cost.count === 1 ? "effect" : "effects"}`;
  return cost.level === "heavy"
    ? `Heavy, ${effects}. Slower phones show the still version.`
    : `Light, ${effects}.`;
}

/** "Used 3 times", or nothing before the first use. */
export function usesLine(uses: number): string | null {
  if (uses <= 0) return null;
  return uses === 1 ? "Used once" : `Used ${uses.toLocaleString("en-US")} times`;
}

/** The sign up path that comes back here and finishes the action. */
export function signUpHref(slug: string, mode: Mode): string {
  return `/register?returnTo=${encodeURIComponent(`/t/${slug}?use=${mode}`)}`;
}

function errorLine(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? "";
  if (message.includes("THEME_LIMIT")) return LIMIT_LINE;
  if (message.includes("Too many")) return "Too many tries. Wait a minute, then try again.";
  return "That didn't work. Try again.";
}

function download(look: SharedLook) {
  const file = themeFileV2(look.name, look.author, look.createdAt, look.config);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${themeFileName(look.name)}.ampedtheme`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function SharedLookView({ look }: { look: SharedLook }) {
  const { data: session, isPending } = authClient.useSession();
  const handle = (session?.user as { handle?: string | null } | undefined)?.handle ?? null;
  const signedIn = Boolean(session?.user);
  const [paused, setPaused] = usePausedChoice();
  const [working, setWorking] = useState<Mode | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef(false);
  const status = useRef<HTMLParagraphElement>(null);

  const run = useCallback(
    async (mode: Mode) => {
      setWorking(mode);
      setError(null);
      try {
        const out = await trpcClient.theme.applyShared.mutate({ slug: look.slug, mode });
        setDone(out);
        setUndoOpen(out.mode === "apply" && out.undoVersionId !== null);
      } catch (cause) {
        setError(errorLine(cause));
      } finally {
        setWorking(null);
        requestAnimationFrame(() => status.current?.focus());
      }
    },
    [look.slug]
  );

  // Back from sign up with ?use=apply or ?use=save: finish the action once
  useEffect(() => {
    if (autoRan.current || isPending || !signedIn) return;
    const params = new URLSearchParams(window.location.search);
    const use = params.get("use");
    if (use !== "apply" && use !== "save") return;
    autoRan.current = true;
    params.delete("use");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    void run(use);
  }, [isPending, signedIn, run]);

  // Undo stays for 8 seconds, as in the editor
  useEffect(() => {
    if (!undoOpen) return;
    const timer = window.setTimeout(() => setUndoOpen(false), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undoOpen]);

  const undo = async () => {
    if (!done?.undoVersionId) return;
    setUndoOpen(false);
    try {
      await trpcClient.theme.restore.mutate({ id: done.themeId, versionId: done.undoVersionId });
      setDone(null);
      setError("Your page has its previous look again.");
    } catch {
      setError("Could not undo. Open Design to pick your look again.");
    }
  };

  const colors = [
    { label: "Buttons", value: look.config.buttonColor },
    { label: "Card", value: look.config.containerColor },
    { label: "Text", value: look.config.fontColor },
  ].filter((c): c is { label: string; value: string } => typeof c.value === "string");
  const uses = usesLine(look.uses);
  const editorUrl = handle ? getPanelEditUrl(handle) : null;

  const action = (mode: Mode, label: string, variant: "default" | "secondary") =>
    signedIn ? (
      <Button
        variant={variant}
        className="w-full sm:w-auto"
        disabled={working !== null || isPending}
        aria-busy={working === mode}
        onClick={() => void run(mode)}
      >
        {label}
      </Button>
    ) : (
      <Button asChild variant={variant} className="w-full sm:w-auto">
        <Link href={signUpHref(look.slug, mode)}>{label}</Link>
      </Button>
    );

  return (
    <div className="mx-auto grid w-full max-w-[987px] gap-[21px] md:grid-cols-[minmax(0,377px)_minmax(0,1fr)] md:gap-[34px]">
      {/* Board 06m: the preview comes first on a phone */}
      <section aria-label="Preview" className="relative">
        <div className="relative h-[610px] overflow-hidden rounded-prism-21 shadow-[5px_13px_34px_rgba(48,47,93,0.14)]">
          <CreatorPage
            theme={look.config}
            mode="preview"
            size="phone"
            paused={paused}
            profile={{ name: "Your name", bio: "Your bio goes here" }}
            blocks={
              <div className="flex flex-col gap-[13px]">
                {[1, 2, 3].map(n => (
                  <CreatorButton key={n} theme={look.config} label="Your link" />
                ))}
              </div>
            }
          />
          <button
            type="button"
            aria-pressed={paused}
            aria-label={paused ? "Play motion" : "Pause motion"}
            onClick={() => setPaused(!paused)}
            className="prism-icon-btn prism-focus absolute right-[13px] top-[13px] z-10 bg-white/80"
          >
            {paused ? (
              <Play aria-hidden className="h-5 w-5" />
            ) : (
              <Pause aria-hidden className="h-5 w-5" />
            )}
          </button>
        </div>
      </section>

      <section className="prism-glass-clear !rounded-prism-21 p-[21px] sm:p-[34px]">
        <Eyebrow>Shared look</Eyebrow>
        <h1 className="mt-[13px] text-balance text-prism-panel-title text-prism-ink">
          {look.name}
        </h1>
        {(look.author || uses) && (
          <p className="mt-2 text-prism-meta text-prism-ink-2">
            {look.author && (
              <>
                Made by{" "}
                <Link href={`/${look.author}`} className="text-prism-nav underline">
                  @{look.author}
                </Link>
              </>
            )}
            {look.author && uses ? " · " : null}
            {uses}
          </p>
        )}

        <h2 className="mt-[21px] text-prism-label font-semibold text-prism-ink">Layers</h2>
        <ul className="mt-2 divide-y divide-prism-line">
          {look.cost.parts.map(part => (
            <li
              key={`${part.layer}-${part.label}`}
              className="flex min-h-touch items-center justify-between gap-3"
            >
              <span className="text-prism-ink-2">{LAYER_NAMES[part.layer] ?? part.layer}</span>
              <span className="text-right text-prism-ink">
                {part.label}{" "}
                <span className="text-prism-meta text-prism-ink-2">
                  {part.cost === "heavy" ? "Heavy" : "Light"}
                </span>
              </span>
            </li>
          ))}
          {colors.length > 0 && (
            <li className="flex min-h-touch items-center justify-between gap-3">
              <span className="text-prism-ink-2">Colors</span>
              <span className="flex items-center gap-2">
                {colors.map(color => (
                  <span
                    key={color.label}
                    title={`${color.label} ${color.value}`}
                    className="h-[21px] w-[21px] rounded-full border border-prism-line"
                    style={{ background: color.value }}
                  >
                    <span className="sr-only">
                      {color.label} {color.value}
                    </span>
                  </span>
                ))}
              </span>
            </li>
          )}
        </ul>
        <p className="mt-2 text-prism-meta text-prism-ink-2">{costLine(look.cost)}</p>

        <div className="mt-[21px] flex flex-col gap-[13px] sm:flex-row sm:flex-wrap">
          {action("apply", "Use this look", "default")}
          {action("save", "Save to My looks", "secondary")}
          {signedIn && (
            <Button asChild variant="ghost" className="w-full sm:w-auto">
              <a href={getPanelLookUrl(look.slug)}>Try it in your editor</a>
            </Button>
          )}
          {look.download && (
            <Button variant="ghost" className="w-full sm:w-auto" onClick={() => download(look)}>
              Download .ampedtheme
            </Button>
          )}
        </div>

        <p
          ref={status}
          tabIndex={-1}
          role="status"
          className="mt-[13px] min-h-[21px] text-prism-label text-prism-ink outline-none"
        >
          {done && (
            <>
              {done.mode === "apply" ? "Applied to your page." : "Saved to My looks."}{" "}
              {done.backgroundKept &&
                "Your background stays: a shared look never carries the author's uploads. "}
              {undoOpen && (
                <button
                  type="button"
                  className="prism-focus font-semibold text-prism-nav underline"
                  onClick={() => void undo()}
                >
                  Undo
                </button>
              )}
              {undoOpen && editorUrl ? " · " : null}
              {editorUrl && (
                <a href={editorUrl} className="font-semibold text-prism-nav underline">
                  Open editor
                </a>
              )}
            </>
          )}
          {error}
        </p>

        <p className="mt-[13px] text-prism-meta text-prism-ink-2">{CARRY_LINE}</p>
        {!signedIn && !isPending && (
          <p className="mt-2 text-prism-meta text-prism-ink-2">
            New to Amped.Bio? You make your page first, then this look applies to it.
          </p>
        )}
      </section>
    </div>
  );
}
