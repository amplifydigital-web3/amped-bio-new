import { useState } from "react";
import { Info } from "lucide-react";
import { BottomSheet, BottomSheetContent, BottomSheetTrigger } from "@repo/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";

/**
 * Screen Review 093 I16: a definition opens on click, tap, Enter or Space,
 * never on hover alone. Desktop: G1 clear raised popover, r13, padding 13, max
 * 377. At 390: the bottom sheet. Escape or an outside tap closes it and focus
 * returns to the 44 info button.
 */
export function InfoTip({
  label,
  text,
  source,
}: {
  // The metric or card name, as the button reads it: "{label} definition"
  label: string;
  text: string;
  source?: string;
}) {
  const mobile = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      aria-label={`${label} definition`}
      className="prism-focus -mx-[11px] inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2 hover:bg-white/50"
    >
      <Info aria-hidden className="h-[21px] w-[21px]" />
    </button>
  );

  const body = (
    <>
      <p className="text-[16px] leading-[24px] text-prism-ink">{text}</p>
      {source && <p className="mt-2 text-prism-meta text-prism-ink-2">Source: {source}</p>}
    </>
  );

  if (mobile) {
    return (
      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetTrigger asChild>{trigger}</BottomSheetTrigger>
        <BottomSheetContent title={label}>
          <div className="pb-2">{body}</div>
        </BottomSheetContent>
      </BottomSheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-auto max-w-[377px] p-[13px]">
        {body}
      </PopoverContent>
    </Popover>
  );
}
