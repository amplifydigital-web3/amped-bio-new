"use client";

import { useId, useRef } from "react";
import { cn } from "../../utils";
import { MOTION, drawStroke, useIsomorphicLayoutEffect } from "../motion";

/**
 * Prism success moment (Build Board #26, section 3.4). The rim draws a full
 * circle in 377 ms, then the check draws in 233 ms. Plays once on mount. It
 * rests drawn, so reduced motion, a hidden tab and no script show the end
 * state. SVG and Web Animations, no library.
 *
 * Trust rule (Prism section 15): result steps only, never Review or Commit.
 */
export function SuccessMoment({
  label,
  size = 89,
  className,
}: {
  /** What succeeded, for screen readers ("Pool created") */
  label: string;
  size?: number;
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const rim = useRef<SVGCircleElement>(null);
  const check = useRef<SVGPathElement>(null);

  useIsomorphicLayoutEffect(() => {
    drawStroke(rim.current, { duration: MOTION.panel });
    drawStroke(check.current, { duration: MOTION.control, delay: MOTION.panel });
  }, []);

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={cn("shrink-0", className)}
    >
      <defs>
        {/* The Prism rim: create, navigate, value */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#27AAE1" />
          <stop offset="0.5" stopColor="#5650A2" />
          <stop offset="1" stopColor="#884D9E" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="50" fill="#FFFFFF" fillOpacity="0.62" />
      <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(22,21,43,0.10)" strokeWidth="5" />
      <circle
        ref={rim}
        cx="60"
        cy="60"
        r="50"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="5"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset="0"
        transform="rotate(-90 60 60)"
      />
      <path
        ref={check}
        d="M40 62 L54 76 L82 46"
        fill="none"
        stroke="#17693F"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset="0"
      />
    </svg>
  );
}

/**
 * A 21 check that draws in 233 ms when `play` turns true (a checklist row that
 * just completed). It rests drawn otherwise.
 */
export function DrawnCheck({ play, className }: { play: boolean; className?: string }) {
  const path = useRef<SVGPathElement>(null);
  useIsomorphicLayoutEffect(() => {
    if (play) drawStroke(path.current, { duration: MOTION.control });
  }, [play]);
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-[21px] w-[21px] shrink-0", className)}>
      <path
        ref={path}
        d="M20 6 9 17l-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset="0"
      />
    </svg>
  );
}
