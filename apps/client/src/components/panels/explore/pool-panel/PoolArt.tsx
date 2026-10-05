import { useState } from "react";
import { Coins } from "lucide-react";

// 55 art tile content (Screen Review 046 I04 and I22): the pool image with
// object-fit cover; with no image, or when the image fails, a lavender tile
// with a 21 coins icon. Never prints alt text in the tile.
export function PoolArt({ url }: { url?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-prism-value-panel-2">
      <Coins className="h-[21px] w-[21px] text-prism-value-ink" aria-hidden />
    </div>
  );
}
