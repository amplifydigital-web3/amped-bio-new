import { useState } from "react";
import { Check, ExternalLink, Fingerprint, Lock, Send, ShieldCheck, UserX } from "lucide-react";
import { Button, ChipGroup, TESTNET_NOTICE } from "@repo/ui";
import { formatRnsName } from "@repo/web3";
import { RNS_COPY } from "@/config/rns/copy";
import { NameTile, VerifiedChip } from "../shared";
import { AUTHBASE_URL } from "./catalog";
import { IdEyebrow, SoonPill } from "./parts";
import { NOT_VERIFIED_SHARING_LINE } from "./SharedAttributes";

/**
 * 103 I08: benefit tiles render only when the surface they promise ships.
 * A badge on your page waits for 108 and 109 (12d); Trusted pools and agents
 * have no code. Prove facts is the approved teaser (105 D1).
 */
const TILES = [
  {
    title: "Senders see a verified owner",
    body: (name: string) =>
      `When someone sends tREVO to ${name}, Send shows Verified owner before they confirm.`,
    icon: Send,
  },
  {
    title: "Harder to impersonate",
    body: () =>
      "Your badge is tied to your wallet. A look alike name on another wallet cannot show it.",
    icon: UserX,
  },
  {
    title: "Prove facts, keep data private",
    body: () =>
      "Verification is the first step to facets, like Over 18, without sharing your birthdate.",
    icon: Fingerprint,
    soon: true,
  },
];

const PLANS = [
  {
    key: "standard",
    name: "Standard",
    sub: "ID document and selfie",
    includes: ["Verified badge", "Senders see Verified owner"],
  },
  {
    key: "enhanced",
    name: "Enhanced",
    sub: "ID document, selfie and address check",
    includes: ["Everything in Standard", "Ready for attributes like residence and age"],
    badge: "Most complete",
  },
] as const;

type Currency = "usd" | "trevo";

function AuthbaseLink({ children, size }: { children: React.ReactNode; size?: "lg" }) {
  if (!AUTHBASE_URL) return null;
  return (
    <Button asChild size={size} className="max-sm:w-full">
      <a href={AUTHBASE_URL} target="_blank" rel="noopener noreferrer">
        <ShieldCheck aria-hidden />
        {children}
        <ExternalLink aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </Button>
  );
}

/**
 * Screen Review 103: Identity, not verified (owner view). One focused promise
 * and one action. Linked to Authbase but not verified reads Finish verifying
 * (I16). The paid check runs on Authbase until the checkout API exists
 * (103 D1, blocked): prices show as placeholders and Verify opens Authbase.
 */
export function IdentityPromo({
  label,
  chainId,
  avatar,
  linked,
  attributes,
}: {
  label: string;
  chainId: number;
  avatar?: string | null;
  /** Wallet linked on Authbase, check not passed (or lapsed) */
  linked: boolean;
  attributes: Record<string, string>;
}) {
  const fullName = formatRnsName(label, chainId);
  const [currency, setCurrency] = useState<Currency>("usd");
  const privacyHref = `${import.meta.env.VITE_LANDINGPAGE_URL ?? ""}/privacy`;
  const showShared = Object.keys(attributes).length > 0;

  return (
    <div className="space-y-[21px] font-prism">
      {/* P04 hero and P05 preview */}
      <section
        aria-labelledby="rns-identity-title"
        className="prism-glass-clear grid grid-cols-[minmax(0,1fr)] gap-[21px] p-[21px] sm:p-[34px] lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center"
      >
        <div className="space-y-3">
          <IdEyebrow>Identity</IdEyebrow>
          <h2
            id="rns-identity-title"
            className="break-words text-[26px] font-bold leading-[33px] text-prism-ink"
          >
            {linked ? `Finish verifying ${fullName}` : `Verify the person behind ${fullName}`}
          </h2>
          <p className="max-w-[600px] text-prism-body text-prism-ink-2">
            {linked
              ? "Your wallet is linked to Authbase. Finish the ID check to get your badge."
              : `Verification links your ${RNS_COPY.firstMention} name to a real, checked identity. People who send to your RNS name can see that the owner is verified.`}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <AuthbaseLink size="lg">
              {linked ? "Continue on Authbase" : "Verify with Authbase"}
            </AuthbaseLink>
            <Button asChild variant="ghost">
              <a href="#rns-how-it-works">How verification works</a>
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-prism-meta text-prism-ink-2">
            <Lock aria-hidden className="h-4 w-4 shrink-0" />
            Authbase runs the check. Amped.Bio never sees your ID document.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-prism-meta text-prism-ink-2">After you verify</p>
          <ul className="prism-slab divide-y divide-prism-line !rounded-prism-13">
            <li className="flex min-h-touch items-center gap-3 px-4 py-2">
              <NameTile src={avatar} />
              <span className="min-w-0 flex-1 truncate text-prism-label font-semibold text-prism-ink">
                {fullName}
              </span>
              <VerifiedChip />
            </li>
            <li className="flex min-h-touch items-center gap-3 px-4 py-2">
              <span
                aria-hidden
                className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-prism-8 bg-prism-nav-tint"
              >
                <Send className="h-[21px] w-[21px] text-prism-nav-pressed" />
              </span>
              <span className="min-w-0">
                <span className="block text-prism-label font-semibold text-prism-ink">
                  Verified owner
                </span>
                <span className="block text-prism-meta text-prism-ink-2">
                  Shown to people who send to you
                </span>
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* P06 why verify */}
      <section aria-labelledby="rns-why-verify" className="space-y-[13px]">
        <div id="rns-why-verify">
          <IdEyebrow as="h3">Why verify</IdEyebrow>
        </div>
        <ul className="grid gap-[13px] md:grid-cols-3">
          {TILES.map(tile => {
            const Icon = tile.icon;
            return (
              <li key={tile.title} className="prism-glass-clear space-y-3 p-[21px]">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 bg-prism-nav-tint"
                  >
                    <Icon className="h-[21px] w-[21px] text-prism-nav-pressed" />
                  </span>
                  {tile.soon && <SoonPill>Coming soon</SoonPill>}
                </div>
                <p className="text-prism-label font-semibold text-prism-ink">{tile.title}</p>
                <p className="text-prism-meta text-prism-ink-2">{tile.body(fullName)}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* P07 to P09 choose a check */}
      <section aria-labelledby="rns-choose-check" className="space-y-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div id="rns-choose-check">
            <IdEyebrow as="h3">Choose a check</IdEyebrow>
          </div>
          <ChipGroup<Currency>
            label="Show prices in"
            value={currency}
            onChange={setCurrency}
            options={[
              { value: "trevo", label: "tREVO" },
              { value: "usd", label: "USD" },
            ]}
          />
        </div>
        <ul className="grid gap-[13px] md:grid-cols-2">
          {PLANS.map(plan => (
            <li key={plan.key} className="prism-glass-clear flex flex-col p-[21px]">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-[20px] font-bold leading-[23px] text-prism-ink">{plan.name}</h4>
                {"badge" in plan && (
                  <span className="inline-flex h-[26px] items-center rounded-prism-8 bg-white/90 px-2 text-prism-meta font-semibold text-prism-ink shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]">
                    {plan.badge}
                  </span>
                )}
              </div>
              <p className="mt-1 text-prism-label text-prism-ink-2">{plan.sub}</p>
              <ul className="mt-3 flex-1 space-y-1">
                {plan.includes.map(item => (
                  <li key={item} className="flex items-start gap-2 text-prism-body text-prism-ink">
                    <Check
                      aria-hidden
                      className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-success"
                    />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-[21px] border-t border-prism-line pt-3">
                <span className="inline-flex h-[26px] items-center rounded-prism-8 border-[1.5px] border-dashed border-prism-ink-2 px-2 text-prism-meta font-semibold text-prism-ink-2">
                  {currency === "usd" ? "USD price from Authbase" : "tREVO price from Authbase"}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-prism-meta text-prism-ink-2">
          You choose the check and see the price on Authbase before you pay. USD is charged by card
          through Authbase checkout (Stripe). tREVO payment opens on mainnet.{" "}
          <span className="font-semibold text-prism-ink">{TESTNET_NOTICE}</span>
        </p>
      </section>

      {/* P10 and P11 */}
      <div className="grid gap-[13px] lg:grid-cols-2">
        <section
          id="rns-how-it-works"
          aria-labelledby="rns-how-title"
          className="prism-glass-clear scroll-mt-[21px] space-y-[13px] p-[21px]"
        >
          <div id="rns-how-title">
            <IdEyebrow as="h3">How it works</IdEyebrow>
          </div>
          <ol className="space-y-3">
            {[
              ["Link this wallet on Authbase.", "No funds move."],
              [
                "Verify on Authbase.",
                "Take a photo of your ID and a selfie. Authbase checks them.",
              ],
              [
                "Get your badge.",
                `Your badge appears with ${fullName}. It stays valid until the date Authbase sets.`,
              ],
            ].map(([title, body], index) => (
              <li key={title} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-prism-nav-tint text-prism-label font-bold text-prism-nav-pressed"
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-prism-label font-semibold text-prism-ink">
                    {title}
                  </span>
                  <span className="block text-prism-meta text-prism-ink-2">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section
          aria-labelledby="rns-receives-title"
          className="prism-glass-clear space-y-[13px] p-[21px]"
        >
          <div id="rns-receives-title">
            <IdEyebrow as="h3">What Amped.Bio receives</IdEyebrow>
          </div>
          <p className="text-prism-body text-prism-ink-2">
            Your verification status, tier and dates. Only the details you choose to share with
            Amped.Bio, which stay private to you. Never your ID document.
          </p>
          <a
            href={privacyHref}
            target="_blank"
            rel="noopener noreferrer"
            className="prism-focus inline-flex min-h-touch items-center text-prism-label font-semibold text-prism-nav underline-offset-4 hover:underline"
          >
            Privacy Policy
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </section>
      </div>

      {/* 079 D2: attributes show only for a Verified status. The owner sees where they will appear. */}
      {showShared && (
        <p className="prism-glass-clear !rounded-prism-13 p-[21px] text-prism-body text-prism-ink-2">
          {NOT_VERIFIED_SHARING_LINE}
        </p>
      )}
    </div>
  );
}
