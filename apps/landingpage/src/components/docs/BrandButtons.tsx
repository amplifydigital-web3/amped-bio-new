import { Download } from "lucide-react";
import { Button } from "@repo/ui";

// The Amped.Bio mark (the four bars of the logo), drawn from public/brand
const MARK_POINTS = [
  {
    fill: "#3881C3",
    points: "107.95 424.62 216.63 272.37 257.55 272.37 147.55 424.62 107.95 424.62",
  },
  {
    fill: "#6C6CB2",
    points: "253.21 424.62 361.89 272.37 402.81 272.37 292.81 424.62 253.21 424.62",
  },
  {
    fill: "#5650A2",
    points: "163.39 424.62 257.28 293.82 273.45 313.63 192.43 424.62 163.39 424.62",
  },
  {
    fill: "#884D9E",
    points: "208.27 424.62 282.03 325.67 297.04 344.15 237.31 424.62 208.27 424.62",
  },
];

function Mark({ white = false }: { white?: boolean }) {
  return (
    <svg aria-hidden viewBox="107 271 297 154" className="h-[21px] w-[41px] shrink-0">
      {MARK_POINTS.map(polygon => (
        <polygon
          key={polygon.points}
          points={polygon.points}
          fill={white ? "#FFFFFF" : polygon.fill}
        />
      ))}
    </svg>
  );
}

const DOWNLOADS = [
  { href: "/brand/sign-in-with-amped-bio-filled.svg", label: "Filled button" },
  { href: "/brand/sign-in-with-amped-bio-outline.svg", label: "Outline button" },
  { href: "/brand/amped-bio-mark.svg", label: "Mark" },
  { href: "/brand/amped-bio-mark-white.svg", label: "White mark" },
];

/** 090 D2, I21: the two official buttons, rendered live, and their SVG downloads. */
export function BrandButtons() {
  return (
    <div className="not-prose my-[21px] space-y-[21px]">
      <div className="flex flex-wrap items-center gap-[13px] rounded-prism-21 bg-prism-line p-[21px]">
        <span className="inline-flex min-h-touch items-center gap-[10px] rounded-prism-13 bg-[#5650A2] px-4 text-[16px] font-bold leading-[20px] text-white">
          <Mark white />
          Sign in with Amped.Bio
        </span>
        <span className="inline-flex min-h-touch items-center gap-[10px] rounded-prism-13 bg-white px-4 text-[16px] font-bold leading-[20px] text-[#16152B] shadow-[inset_0_0_0_1.5px_rgba(22,21,43,0.18)]">
          <Mark />
          Sign in with Amped.Bio
        </span>
      </div>
      <ul className="flex flex-wrap gap-2 !p-0 ![list-style:none]">
        {DOWNLOADS.map(file => (
          <li key={file.href} className="!my-0 !pl-0">
            <Button variant="ghost" asChild>
              <a href={file.href} download className="!no-underline">
                <Download aria-hidden />
                {file.label} SVG
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
