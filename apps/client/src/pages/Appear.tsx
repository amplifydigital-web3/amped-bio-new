import { useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  RELEASE_SURFACES,
  RELEASE_SURFACE_LABELS,
  type ReleaseOptions,
  type ReleaseSurfaceOption,
} from "@repo/constants";
import { Button, ErrorCard, Input, Skeleton, trpc } from "@repo/ui";

/**
 * app.amped.bio/appear/{token} (adult content review 5.2 steps 2 to 4, boards ar5 and
 * sp8, PR R4): the invited person passes Over 18, sets the release options, reads the
 * release to the end, confirms they gave the creator their ID and names, and signs
 * with their typed legal name. The creator countersigns in People.
 */
export function AppearPage() {
  const { token = "" } = useParams();
  const invite = useQuery({ ...trpc.adult.appear.get.queryOptions({ token }), retry: false });
  const sign = useMutation(trpc.adult.appear.sign.mutationOptions());
  const [surfaces, setSurfaces] = useState<ReleaseSurfaceOption[]>([]);
  const [also, setAlso] = useState("");
  const [faceShown, setFaceShown] = useState(true);
  const [tagAllowed, setTagAllowed] = useState(false);
  const [payment, setPayment] = useState<"none" | "fixed" | "share">("none");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [readToEnd, setReadToEnd] = useState(false);
  const [idGiven, setIdGiven] = useState(false);
  const [consent, setConsent] = useState(false);
  const [legalName, setLegalName] = useState("");

  if (invite.isPending)
    return <Skeleton delayMs={400} className="m-4 h-[377px] !rounded-prism-21" />;
  if (invite.isError) {
    return (
      <div className="prism-room min-h-dvh p-4">
        <ErrorCard
          title="This invite does not work"
          cause={invite.error.message}
          retryLabel="Retry"
          onRetry={() => void invite.refetch()}
        />
      </div>
    );
  }
  const data = invite.data;
  const options: ReleaseOptions = {
    surfaces,
    otherPlatforms: also.trim() ? { kind: "also", text: also.trim() } : { kind: "none" },
    faceShown,
    tagAllowed,
    payment:
      payment === "fixed"
        ? { kind: "fixed", amountUsd: Number(amount) || 0 }
        : payment === "share"
          ? { kind: "share", bps: Math.round((Number(percent) || 0) * 100) }
          : { kind: "none" },
  };
  const canSign =
    data.over18.pass && readToEnd && idGiven && consent && legalName.trim().length >= 2;

  return (
    <main className="prism-room min-h-dvh px-4 py-[21px]">
      <div className="mx-auto max-w-[508px] space-y-[21px] rounded-prism-21 bg-white p-[21px] text-prism-ink">
        <h1 className="text-prism-panel-title">
          Release for {data.creator.name ?? `@${data.creator.handle}`}
        </h1>
        {data.signed ? (
          <p role="status">You signed this release. The creator countersigns next.</p>
        ) : sign.isSuccess ? (
          <p role="status">Signed. You both get a copy. The creator countersigns next.</p>
        ) : !data.over18.pass ? (
          <p>
            Pass the Over 18 check first: open Wallet, Identity, and verify or share Over 18 with
            Authbase. Then come back to this link.
          </p>
        ) : (
          <form
            className="space-y-[13px]"
            onSubmit={event => {
              event.preventDefault();
              if (canSign) {
                sign.mutate({
                  token,
                  options,
                  legalName,
                  idGiven: true,
                  consent: true,
                  readToEnd: true,
                });
              }
            }}
          >
            <fieldset className="space-y-1">
              <legend className="font-semibold">Where the creator may sell</legend>
              {RELEASE_SURFACES.map(surface => (
                <label key={surface} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={surfaces.includes(surface)}
                    onChange={e =>
                      setSurfaces(current =>
                        e.target.checked
                          ? [...current, surface]
                          : current.filter(s => s !== surface)
                      )
                    }
                  />
                  {RELEASE_SURFACE_LABELS[surface]}
                </label>
              ))}
            </fieldset>
            <label className="block">
              Other platforms (leave empty for Nowhere else)
              <Input value={also} onChange={e => setAlso(e.target.value)} />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={faceShown}
                onChange={e => setFaceShown(e.target.checked)}
              />
              My face may be shown
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tagAllowed}
                onChange={e => setTagAllowed(e.target.checked)}
              />
              I may be tagged
            </label>
            <fieldset className="space-y-1">
              <legend className="font-semibold">Payment</legend>
              {(["none", "fixed", "share"] as const).map(kind => (
                <label key={kind} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="payment"
                    checked={payment === kind}
                    onChange={() => setPayment(kind)}
                  />
                  {kind === "none"
                    ? "No payment"
                    : kind === "fixed"
                      ? "A fixed fee"
                      : "A share of the creator's share"}
                </label>
              ))}
              {payment === "fixed" && (
                <Input
                  aria-label="Amount in USD"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              )}
              {payment === "share" && (
                <Input
                  aria-label="Percent"
                  inputMode="decimal"
                  value={percent}
                  onChange={e => setPercent(e.target.value)}
                />
              )}
            </fieldset>
            <div
              tabIndex={0}
              aria-label="Release text"
              className="max-h-[233px] overflow-y-auto rounded-prism-13 border border-prism-line p-[13px] text-prism-meta"
              onScroll={event => {
                const el = event.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadToEnd(true);
              }}
            >
              <p>
                Performer release, version {data.version}. This is the creator's document; Amped.Bio
                is neither party nor beneficiary.
              </p>
              <p className="mt-2">
                You agree that the creator may use content recorded with you on the surfaces you
                picked above, on every date the content was recorded, with the options above. You
                can withdraw consent at any time from Account, Appearing in.
              </p>
              <p className="mt-2">Both of you get a copy of the signed release.</p>
              <p className="mt-2 h-[144px]" aria-hidden />
              <p>End of the release.</p>
            </div>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={idGiven}
                onChange={e => setIdGiven(e.target.checked)}
              />
              I gave the creator a copy of my ID and every name I have used.
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={consent}
                onChange={e => setConsent(e.target.checked)}
              />
              I agree to this release.
            </label>
            <label className="block">
              Type your full legal name to sign
              <Input value={legalName} onChange={e => setLegalName(e.target.value)} />
            </label>
            {sign.isError && (
              <p role="alert" className="text-prism-danger">
                {sign.error.message}
              </p>
            )}
            <Button type="submit" disabled={!canSign || sign.isPending}>
              Sign
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
