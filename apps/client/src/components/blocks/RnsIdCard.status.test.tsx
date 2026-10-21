/**
 * Build Board #33: the RNS ID card for each verification status, in all four
 * styles. The badge and tier show only on a Verified chip; a hidden badge on a
 * current check never reads Not verified (112 D8); a card without a linked
 * name never claims the name points here (112 D9).
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DEFAULT_RNSID_CONFIG, type RnsIdBlockConfig } from "@repo/constants";
import { RnsIdCard } from "@repo/ui/creator/rns-id-card";
import { RnsIdentityDialog, type RnsIdentity } from "@repo/ui/prism/rns-identity";

const STYLES: RnsIdBlockConfig["style"][] = ["nameplate", "idcard", "proofstrip", "seal"];

const config = (style: RnsIdBlockConfig["style"]): RnsIdBlockConfig => ({
  ...DEFAULT_RNSID_CONFIG,
  style,
  tap: style === "idcard" || style === "proofstrip" ? "inline" : "sheet",
  show: { ...DEFAULT_RNSID_CONFIG.show, nameOnId: true, country: true },
});

const check = {
  verifiedAt: "2026-08-12T00:00:00Z",
  validUntil: "2027-08-12T00:00:00Z",
  tier: "enhanced" as const,
};

const IDENTITIES: Record<string, NonNullable<RnsIdentity>> = {
  badge: {
    chip: "verified",
    linked: true,
    name: "mayalin.revo",
    label: "mayalin",
    check,
    badge: { tier: "enhanced", mintedAt: "2026-08-13T00:00:00Z" },
  },
  verified: { chip: "verified", linked: true, name: "mayalin.revo", label: "mayalin", check },
  linked: { chip: "name", linked: true, name: "mayalin.revo", label: "mayalin" },
  hidden: {
    chip: "name",
    linked: true,
    checkHidden: true,
    name: "mayalin.revo",
    label: "mayalin",
    attributes: { name: "Maya Lin" },
  },
  nameless: { chip: "verified", linked: false, check },
  shared: { chip: "none", linked: false, checkHidden: true, attributes: { country: "US" } },
};

const card = (key: string, style: RnsIdBlockConfig["style"]) =>
  render(
    <RnsIdCard
      config={config(style)}
      theme={undefined}
      identity={IDENTITIES[key]}
      displayName="Maya"
      since="2026-03"
      expanded
      onTap={() => undefined}
    />
  ).container.textContent ?? "";

describe("RNS ID card status", () => {
  it("shows the badge and the check level on a badged Verified card", () => {
    for (const style of ["idcard", "proofstrip"] as const) {
      const text = card("badge", style);
      expect(text).toContain("Enhanced");
      expect(text).toMatch(/Badge/);
      expect(text).toContain("13 Aug 2026");
    }
    expect(card("badge", "nameplate")).toContain("Enhanced ID check · Badge on chain");
    expect(card("badge", "seal")).toContain("Badge minted 13 Aug 2026");
  });

  it("shows no badge without one, and reads Not verified only when nothing is hidden", () => {
    for (const style of STYLES) {
      expect(card("verified", style)).not.toMatch(/Badge/);
      expect(card("hidden", style)).not.toContain("Not verified");
      expect(card("shared", style)).not.toContain("Not verified");
      expect(card("hidden", style)).not.toContain("Verified");
    }
    expect(card("linked", "idcard")).toContain("Not verified");
  });

  it("renders every status in every style with no stray values", () => {
    for (const key of Object.keys(IDENTITIES)) {
      for (const style of STYLES) {
        const text = card(key, style);
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(/undefined|NaN|null/);
      }
    }
  });

  it("D8: shared details stay on a hidden badge, under a neutral line", () => {
    const text = card("hidden", "idcard");
    expect(text).toContain("Maya Lin");
    expect(text).toContain("Check the address with the owner before you send");
  });

  it("D9: no linked name never claims the name points here", () => {
    for (const key of ["nameless", "shared"]) {
      for (const style of STYLES) {
        const text = card(key, style);
        expect(text).not.toContain("points");
        expect(text).not.toContain("Points to");
        expect(text).not.toContain(".revo");
      }
    }
    expect(card("nameless", "seal")).toContain("Identity verified");
    expect(card("shared", "seal")).toContain("Shared details");
    expect(card("shared", "proofstrip")).toContain("United States");
  });

  it("the sheet shows the badge fact, and no pay row without a linked name", () => {
    // Each sheet portals into the body, so read it and unmount it alone
    const sheet = (key: string) => {
      const view = render(
        <RnsIdentityDialog
          identity={IDENTITIES[key]}
          open
          onOpenChange={() => undefined}
          displayName="Maya"
          sendHref="/wallet?send=1&to=mayalin"
        />
      );
      const text = view.baseElement.textContent ?? "";
      view.unmount();
      return text;
    };
    expect(sheet("badge")).toContain("Verification badge");
    expect(sheet("badge")).toContain("Minted on chain on 13 Aug 2026.");
    expect(sheet("verified")).not.toContain("Verification badge");
    expect(sheet("hidden")).not.toContain("Not verified");
    expect(sheet("shared")).toContain("Shared details");
    expect(sheet("nameless")).not.toContain("Send tREVO");
    expect(sheet("shared")).not.toContain("Send tREVO");
    expect(sheet("linked")).toContain("Send tREVO");
  });
});
