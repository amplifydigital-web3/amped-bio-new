import { useState } from "react";
import { useSearchParams } from "react-router";
import { useOpenParam } from "@/hooks/useOpenParam";
import { DisclosureGroup, DisclosureRowSkeleton } from "./kit/DisclosureRow";
import { LockedThemeNotice } from "./kit/Notices";
import { useDesign } from "./kit/useDesign";
import { BackgroundRow } from "./rows/BackgroundRow";
import { ContainerRow } from "./rows/ContainerRow";
import { ButtonsRow } from "./rows/ButtonsRow";
import { TextRow } from "./rows/TextRow";
import { ButtonHoverRow, NameEffectRow, ParticlesRow } from "./rows/MotionRows";

// Screen Review 027. Style holds Background, Container, Buttons and Text;
// Motion holds Button hover, Particles and Name effect. One row open at a time.

function Loading({ rows }: { rows: number }) {
  return (
    <div aria-busy="true" aria-label="Loading your design">
      {Array.from({ length: rows }).map((_, i) => (
        <DisclosureRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function StyleTab() {
  const { profile, locked } = useDesign();
  // 053 I06: ?open=background (Testnet faucet Set background) opens that row
  const [params] = useSearchParams();
  const [openBackground] = useState(() => params.get("open") === "background");
  useOpenParam("background", () => undefined);
  if (!profile.id) return <Loading rows={4} />;
  return (
    <>
      {locked && <LockedThemeNotice />}
      <DisclosureGroup
        storageKey="amped:design-style-open"
        defaultOpen="background"
        initialOpen={openBackground ? "background" : null}
        readOnly={locked}
      >
        <BackgroundRow />
        <ContainerRow />
        <ButtonsRow />
        <TextRow />
      </DisclosureGroup>
    </>
  );
}

export function MotionTab() {
  const { profile, locked } = useDesign();
  if (!profile.id) return <Loading rows={3} />;
  return (
    <>
      {locked && <LockedThemeNotice />}
      <DisclosureGroup
        storageKey="amped:design-motion-open"
        defaultOpen="button-hover"
        readOnly={locked}
      >
        <ButtonHoverRow />
        <ParticlesRow />
        <NameEffectRow />
      </DisclosureGroup>
    </>
  );
}
