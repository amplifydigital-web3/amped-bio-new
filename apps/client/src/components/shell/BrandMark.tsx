import mark from "@/assets/amplify-mark.svg";

// The Amplify mark (four stripes, 2:1) as an image. Decorative on its own; the
// link around it carries the accessible name.
export function BrandMark({ className }: { className?: string }) {
  return <img src={mark} alt="" aria-hidden draggable={false} className={className} />;
}
