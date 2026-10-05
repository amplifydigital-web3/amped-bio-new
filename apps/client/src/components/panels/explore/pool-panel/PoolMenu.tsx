import { ExternalLink, ImageUp, MoreHorizontal, Share2, UserRound } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@repo/ui";

// Screen Review 046 I03: every secondary pool action in one labeled menu.
// Rows with no target are not rendered (no explorer URL, not the creator).
export function PoolMenu({
  onShare,
  explorerUrl,
  creatorUrl,
  onChangeImage,
}: {
  onShare: () => void;
  explorerUrl?: string;
  creatorUrl?: string;
  // Only passed when the viewer is the pool creator
  onChangeImage?: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger className="prism-icon-btn prism-focus shrink-0" aria-label="More actions">
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={onShare}>
          <Share2 aria-hidden />
          Share pool
        </MenuItem>
        {explorerUrl && (
          <MenuItem asChild>
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              View on explorer
            </a>
          </MenuItem>
        )}
        {creatorUrl && (
          <MenuItem asChild>
            <a href={creatorUrl} target="_blank" rel="noopener noreferrer">
              <UserRound aria-hidden />
              View creator page
            </a>
          </MenuItem>
        )}
        {onChangeImage && (
          <MenuItem onSelect={onChangeImage}>
            <ImageUp aria-hidden />
            Change pool image
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}
