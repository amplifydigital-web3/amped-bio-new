import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  MiniPlayer,
  PlayerProvider,
  trpcClient,
  useOptionalPlayer,
  type ProgressAdapter,
} from "@repo/ui";

/**
 * The editor's player (Fan Library #26 phase A). One PlayerProvider for the
 * shell, so a preview keeps playing while the creator moves between
 * destinations, and position saves to the account like any viewer's.
 */
export function EditorPlayerProvider({ children }: { children: ReactNode }) {
  const progress = useMemo<ProgressAdapter>(
    () => ({
      load: publicId => trpcClient.progress.get.query({ publicId }),
      save: (publicId, snapshot) => {
        void trpcClient.progress.set.mutate({ publicId, ...snapshot }).catch(() => {});
      },
    }),
    []
  );
  return <PlayerProvider progress={progress}>{children}</PlayerProvider>;
}

/**
 * The mini player in the shell: above the dock on phones (the dock's top sits
 * 101 above the bottom), and at the foot of the context field on desktop. A
 * spacer keeps the last row of a destination clear of it on phones.
 */
export function EditorMiniPlayer() {
  const player = useOptionalPlayer();
  const navigate = useNavigate();
  const visible = !!player?.item && player.state.started && !player.fullPlayerShowing;
  if (!visible) return null;
  return (
    <>
      <div aria-hidden className="h-[63px] md:hidden" />
      <div className="fixed inset-x-[13px] bottom-[calc(109px+env(safe-area-inset-bottom,0px))] z-40 md:sticky md:inset-x-auto md:bottom-[21px]">
        <MiniPlayer
          onExpand={item => navigate(`/content?tab=library&item=${encodeURIComponent(item.id)}`)}
        />
      </div>
    </>
  );
}
