import { cn } from "@repo/ui";

// Screen Review 081 I01, I12 and 082: the editor shell skeleton in real shell
// geometry. Bars use the line token; the pulse stops under reduced motion.
const BAR = "rounded-prism-13 bg-prism-line motion-safe:animate-pulse";

function Bar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={cn("block", BAR, className)} style={style} />;
}

/** The rail capsule at x 21 with destination shapes 61 x 64, r27 (desktop only). */
function RailSkeleton() {
  return (
    <div
      aria-hidden
      className="prism-dock fixed bottom-[21px] left-[21px] top-[21px] z-30 hidden w-[89px] flex-col items-center gap-2 rounded-prism-34 p-[13px] md:flex"
    >
      <Bar className="h-[55px] w-[55px] !rounded-prism-13" />
      {[0, 1].map(index => (
        <Bar key={`a${index}`} className="h-16 w-[61px] !rounded-[27px]" />
      ))}
      <span className="mx-[13px] my-2 h-px w-[34px] bg-prism-line" />
      {[0, 1, 2].map(index => (
        <Bar key={`b${index}`} className="h-16 w-[61px] !rounded-[27px]" />
      ))}
      <span className="mx-[13px] my-2 h-px w-[34px] bg-prism-line" />
      {[0, 1].map(index => (
        <Bar key={`c${index}`} className="h-16 w-[61px] !rounded-[27px]" />
      ))}
    </div>
  );
}

/** The 55 top bar: a 20 x 144 title bar and a 44 circle. */
function TopBarSkeleton() {
  return (
    <div
      aria-hidden
      className="prism-glass-nav flex h-commit items-center gap-2 rounded-none pl-[21px] pr-[5px] md:rounded-prism-34"
    >
      <Bar className="h-5 w-[144px]" />
      <span className="flex-1" />
      <Bar className="h-touch w-touch !rounded-full" />
    </div>
  );
}

/** The destination's own content shape: a header card, a section row, a list card. */
function ContentSkeleton() {
  return (
    <div aria-hidden className="space-y-[21px]">
      <div className="prism-glass-clear flex gap-[21px] !rounded-prism-21 p-[21px]">
        <Bar className="h-[89px] w-[89px] shrink-0 !rounded-full" />
        <div className="min-w-0 flex-1 space-y-[13px]">
          <Bar className="h-3 w-[110px]" />
          <Bar className="h-[44px] w-full" />
          <Bar className="h-3 w-[55px]" />
          <Bar className="h-[44px] w-full" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Bar className="h-3 w-[89px]" />
        <Bar className="h-commit w-[144px]" />
      </div>
      <div className="prism-glass-clear !rounded-prism-21 px-[21px] py-2">
        {[60, 40, 52, 40].map((width, index) => (
          <div
            key={index}
            className="flex h-commit items-center gap-[13px] border-b border-prism-line last:border-b-0"
          >
            <Bar className="h-[21px] w-[21px] shrink-0 !rounded-full" />
            <div className="flex-1 space-y-2">
              <Bar className="h-3" style={{ width: `${width}%` }} />
              <Bar className="h-2 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The commitment field frame on Page and Design (lg and up). */
function PreviewSkeleton() {
  return (
    <div
      aria-hidden
      className="prism-glass-clear sticky top-[21px] hidden h-[calc(100dvh-42px)] w-[508px] shrink-0 flex-col gap-[13px] !rounded-prism-34 p-[21px] lg:flex"
    >
      <Bar className="h-commit w-full !rounded-full" />
      <div className="flex flex-1 flex-col items-center gap-[13px] rounded-prism-21 bg-white/40 p-[34px]">
        <Bar className="h-[89px] w-[89px] !rounded-full" />
        <Bar className="h-4 w-[144px]" />
        <Bar className="h-3 w-[89px]" />
        <Bar className="mt-[21px] h-commit w-full" />
        <Bar className="h-commit w-full" />
        <Bar className="h-commit w-full" />
      </div>
    </div>
  );
}

/**
 * The editor shell while auth and the profile load (081 I01, I03). The status
 * line is visually hidden; the container is aria-busy until content arrives.
 */
export function ShellSkeleton({ preview = false }: { preview?: boolean }) {
  return (
    <div aria-busy="true" className="prism-room prism-font min-h-dvh text-prism-ink">
      <p role="status" className="sr-only">
        Loading your editor
      </p>
      <RailSkeleton />
      <div className="flex gap-[21px] px-[13px] pt-[13px] md:pl-[131px] md:pr-[21px] md:pt-[21px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[13px]">
          <TopBarSkeleton />
          <ContentSkeleton />
        </div>
        {preview && <PreviewSkeleton />}
      </div>
    </div>
  );
}
