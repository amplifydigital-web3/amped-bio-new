// Example creator page in the commitment field (Screen Review 007 I09). It is
// creator content, so it uses the Graphite demo theme only and no Prism color.
// Decorative: hidden from assistive tech, no pointer events, no motion.
const LINKS = ["Latest episode", "Listen on Spotify", "Studio notes", "Support the show"];

export function DemoPage() {
  return (
    <figure className="flex flex-col items-center gap-[13px]">
      <div
        aria-hidden
        className="pointer-events-none w-full max-w-[390px] select-none overflow-hidden rounded-[21px] bg-[#14161C] px-6 pb-8 pt-10 text-center"
      >
        <div className="mx-auto h-[89px] w-[89px] rounded-full bg-[linear-gradient(135deg,#3A3F4C,#6B7180)] ring-4 ring-[#C9CDD6]/30" />
        <p className="mt-4 text-[22px] font-bold leading-7 text-[#F4F5F7]">Night Shift</p>
        <p className="text-[14px] text-[#B9BDC9]">amped.bio/nightshift</p>
        <p className="mx-auto mt-3 max-w-[280px] text-[15px] leading-6 text-[#B9BDC9]">
          Late night conversations with working artists. New episodes every Thursday.
        </p>
        <div className="mt-6 space-y-3">
          {LINKS.map(label => (
            <div
              key={label}
              className="rounded-[13px] bg-[#3A3F4C] py-3 text-[15px] font-semibold text-[#F4F5F7]"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-[13px] border border-[#6B7180] p-4 text-left">
          <p className="text-[13px] uppercase tracking-[0.08em] text-[#B9BDC9]">Creator pool</p>
          <p className="mt-1 text-[16px] font-semibold text-[#F4F5F7]">Night Shift Backers</p>
          <p className="mt-1 text-[13px] text-[#B9BDC9]">128 fans · 48,210 tREVO staked</p>
        </div>
      </div>
      <figcaption className="font-prism text-prism-meta text-prism-ink-2">Example page</figcaption>
    </figure>
  );
}
