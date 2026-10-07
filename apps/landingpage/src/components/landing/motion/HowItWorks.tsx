"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Blend, Check, LockOpen, UserCheck, UserPlus, Wallet } from "lucide-react";
import { cn } from "@repo/ui";
import { useMotionOff } from "./motionState";

// How it works (Build Board #26, section 3.3). Four steps. On a wide screen
// with motion on, the steps scroll on the left while one stage stays in view
// on the right and plays the step in view. On a phone, with reduced motion,
// with Pause motion or with no script, the steps stack and each shows its
// scene at rest. Every step is plain text in the DOM, in order.
//
// No library: sticky positioning, IntersectionObserver and Prism CSS. The pool
// step shows mechanics only (no amounts, rates or outcomes). Counsel reviews
// it before NEXT_PUBLIC_SHOW_MOTION turns on in production.

const STEPS = [
  { title: "Claim your page", body: "Pick a URL. Amped.Bio checks it as you type." },
  { title: "Design it", body: "Pick a theme. Your page is yours, in your colors." },
  { title: "Fans follow", body: "One tap, free. You see who follows you in People." },
  {
    title: "Members join your pool",
    body: "A fan stakes testnet tREVO into your pool contract and shows as a member of your pool.",
  },
];

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "prism-slab flex w-full max-w-[320px] flex-col gap-[13px] overflow-hidden p-[21px] font-prism",
        className
      )}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-prism-eyebrow uppercase text-prism-ink-2">{children}</span>;
}

function MiniPage({ dark, links }: { dark: boolean; links: string[] }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-prism-21 px-[13px] py-[21px]",
        dark ? "bg-[#14161C] text-[#F4F5F7]" : "bg-[#F1F0F9] text-prism-ink"
      )}
    >
      <span className="h-[55px] w-[55px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#C9CDD6,#6B7180_55%,#3A3F4C)]" />
      <span className="font-bold">Maya Lin</span>
      {links.map(label => (
        <span
          key={label}
          className={cn(
            "flex min-h-touch w-full items-center justify-center rounded-prism-13 text-prism-meta font-semibold",
            dark ? "bg-[#232733]" : "bg-white shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)]"
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function SceneClaim() {
  return (
    <Frame>
      <Label>Public URL</Label>
      <div className="prism-well flex min-h-commit items-center overflow-hidden whitespace-nowrap px-[13px] text-prism-label text-prism-ink-2">
        amped.bio/<b className="motion-type font-semibold text-prism-ink">maya.lin</b>
      </div>
      <span className="motion-after flex items-center gap-2 text-prism-meta font-semibold text-prism-success">
        <Check aria-hidden className="h-4 w-4" />
        Available
      </span>
      <MiniPage dark={false} links={["Add your first link"]} />
    </Frame>
  );
}

function SceneDesign() {
  return (
    <Frame>
      <Label>Design</Label>
      <div className="flex gap-2">
        {["#F1F0F9", "#14161C", "#245A43", "#232846"].map((color, index) => (
          <span
            key={color}
            className={cn(
              "h-11 w-11 rounded-prism-13 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)]",
              index === 1 && "motion-pick"
            )}
            style={{ background: color }}
          />
        ))}
      </div>
      {/* The theme lands: the plain page crossfades to Graphite */}
      <div className="grid">
        <div className="[grid-area:1/1]">
          <MiniPage dark={false} links={["Listen to Low Tide EP", "Tide prints and cassettes"]} />
        </div>
        <div className="motion-theme-in [grid-area:1/1]">
          <MiniPage dark links={["Listen to Low Tide EP", "Tide prints and cassettes"]} />
        </div>
      </div>
    </Frame>
  );
}

function SceneFollow() {
  return (
    <Frame>
      <Label>Your page</Label>
      <MiniPage dark links={["Listen to Low Tide EP"]} />
      <div className="prism-glass-clear mx-auto flex items-center gap-2 !rounded-full py-[5px] pl-[13px] pr-[5px]">
        <span className="whitespace-nowrap text-prism-meta font-semibold text-prism-ink">
          1,240 followers
        </span>
        <span className="relative inline-grid">
          <span className="motion-follow-a prism-btn-primary inline-flex h-touch items-center gap-2 rounded-prism-13 px-4 text-prism-label font-bold [grid-area:1/1]">
            <UserPlus aria-hidden className="h-5 w-5" />
            Follow
          </span>
          <span className="motion-follow-b prism-btn-secondary inline-flex h-touch items-center gap-2 rounded-prism-13 px-4 text-prism-label font-semibold [grid-area:1/1]">
            <UserCheck aria-hidden className="h-5 w-5 text-prism-success" />
            Following
          </span>
        </span>
      </div>
    </Frame>
  );
}

function FlowNode({
  icon: Icon,
  tint,
  children,
  className,
}: {
  icon: typeof Wallet;
  tint: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-commit w-full items-center gap-[13px] rounded-prism-13 bg-white px-[13px] font-semibold text-prism-ink shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)]",
        className
      )}
    >
      <span
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-prism-8 text-white"
        style={{ background: tint }}
      >
        <Icon aria-hidden className="h-5 w-5" />
      </span>
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <span className="relative mx-auto block h-[34px] w-[2px] bg-[linear-gradient(#5650A2,#884D9E)]">
      <span className="absolute -bottom-[4px] -left-[4px] border-[5px] border-transparent border-t-[6px] border-t-prism-value" />
    </span>
  );
}

function ScenePool() {
  return (
    <Frame>
      <Label>Joining a pool</Label>
      <div className="relative flex flex-col gap-2">
        <FlowNode icon={Wallet} tint="#5650A2">
          Fan&apos;s wallet
        </FlowNode>
        <Arrow />
        <FlowNode icon={Blend} tint="#884D9E">
          Pool contract
        </FlowNode>
        <Arrow />
        <FlowNode icon={LockOpen} tint="#17693F" className="motion-member">
          Member of your pool
        </FlowNode>
        <span aria-hidden className="motion-token" />
      </div>
      <span className="text-prism-meta text-prism-ink-2">
        Revolution Network testnet. tREVO has no cash value.
      </span>
    </Frame>
  );
}

const SCENES = [SceneClaim, SceneDesign, SceneFollow, ScenePool];

export function HowItWorks() {
  const motionOff = useMotionOff();
  const [wide, setWide] = useState(false);
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const pinned = wide && !motionOff;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // The step crossing the middle of the viewport is the one the stage plays
  useEffect(() => {
    if (!pinned) return;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const index = stepRefs.current.indexOf(entry.target as HTMLLIElement);
          if (index >= 0) setActive(index);
        });
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    stepRefs.current.forEach(step => step && observer.observe(step));
    return () => observer.disconnect();
  }, [pinned]);

  return (
    <section aria-labelledby="how-title" className="mt-[89px]">
      <div className="max-w-[856px] space-y-[13px]">
        <p className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
          <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
          How it works
        </p>
        <h2
          id="how-title"
          className="font-prism-display text-prism-display-42 text-prism-ink lg:text-prism-display-68"
        >
          From a page to a community in four steps.
        </h2>
      </div>

      <div
        className={cn(
          "mt-[55px] grid gap-[34px]",
          pinned && "grid-cols-[minmax(0,1fr)_508px] items-start gap-[21px]"
        )}
      >
        <ol className="flex flex-col gap-[13px]">
          {STEPS.map((step, index) => {
            const Scene = SCENES[index];
            const on = !pinned || index === active;
            return (
              <li
                key={step.title}
                ref={node => {
                  stepRefs.current[index] = node;
                }}
                className={cn(
                  "prism-glass-clear grid grid-cols-[44px_minmax(0,1fr)] items-start gap-[13px] p-[21px] font-prism",
                  "transition-opacity duration-prism-panel ease-prism",
                  pinned && "min-h-[55vh] content-center",
                  !on && "opacity-[0.42]"
                )}
              >
                <span
                  aria-hidden
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white font-bold text-prism-ink-2 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)]"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-prism-panel-title text-prism-ink">{step.title}</h3>
                  <p className="mt-1 text-prism-body text-prism-ink-2">{step.body}</p>
                  {!pinned && (
                    // Stacked: each step shows its scene at rest
                    <div className="mt-[13px]" data-scene-state="rest">
                      <Scene />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {pinned && (
          <div
            aria-hidden
            className="prism-glass-clear sticky top-[89px] flex h-[min(560px,calc(100dvh-144px))] items-center justify-center !rounded-prism-34 p-[21px]"
          >
            {SCENES.map((Scene, index) => (
              <div
                key={index}
                data-scene-state={index === active ? "play" : "off"}
                className="motion-scene absolute inset-0 flex items-center justify-center p-[21px]"
              >
                <Scene />
              </div>
            ))}
            <span className="absolute inset-x-[34px] bottom-[21px] h-[3px] overflow-hidden rounded-full bg-prism-line">
              <span
                className="block h-full origin-left bg-[linear-gradient(90deg,#27AAE1,#5650A2,#884D9E)] transition-transform duration-prism-panel ease-prism"
                style={{ transform: `scaleX(${(active + 1) / STEPS.length})` }}
              />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
