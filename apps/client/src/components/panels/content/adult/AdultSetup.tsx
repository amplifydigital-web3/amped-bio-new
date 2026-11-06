import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Copy, UserPlus } from "lucide-react";
import {
  ADULT_SETUP_COPY as copy,
  RELEASE_STATUS_LABELS,
  type ReleaseStatus,
} from "@repo/constants";
import { Button, ErrorCard, Input, Notice, Skeleton, Textarea, queryClient, trpc } from "@repo/ui";
import { normalizeApiError } from "../lib/browserDeps";
import { messageForApiError } from "../lib/uploadTask";

/**
 * Adult content (adult content review 5.1 and 5.2, boards ar3 and ar5, PR R4): the
 * checklist that turns 18+ on, and the People list with invites and countersigning.
 */

function Row({ ok, title, children }: { ok: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 border-t border-prism-line py-[13px] first:border-t-0">
      {ok ? (
        <CheckCircle2 aria-label="Done" className="mt-0.5 h-5 w-5 shrink-0 text-prism-success" />
      ) : (
        <Circle aria-label="To do" className="mt-0.5 h-5 w-5 shrink-0 text-prism-ink-2" />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-prism-body font-semibold text-prism-ink">{title}</p>
        {children}
      </div>
    </li>
  );
}

export function AdultSetup() {
  const setup = useQuery(trpc.adult.getSetup.queryOptions());
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.adult.getSetup.queryKey() });
  const fail = (failure: unknown) => setError(messageForApiError(normalizeApiError(failure)));
  const accept = useMutation(
    trpc.adult.acceptPolicy.mutationOptions({ onSuccess: refresh, onError: fail })
  );
  const custodian = useMutation(
    trpc.adult.setCustodian.mutationOptions({ onSuccess: refresh, onError: fail })
  );
  const enable = useMutation(
    trpc.adult.enable.mutationOptions({ onSuccess: refresh, onError: fail })
  );
  const disable = useMutation(
    trpc.adult.disable.mutationOptions({ onSuccess: refresh, onError: fail })
  );

  if (setup.isPending)
    return <Skeleton delayMs={400} className="h-[377px] w-full !rounded-prism-21" />;
  if (setup.isError) {
    return (
      <ErrorCard
        title="Adult content did not load"
        cause="Try again."
        retryLabel="Retry"
        onRetry={() => void setup.refetch()}
      />
    );
  }
  const s = setup.data;
  const ready = s.over18.pass && s.seller.pass && s.policy.ok && s.custodian.named;

  return (
    <div className="space-y-[21px]">
      <section className="prism-glass-clear space-y-[13px] !rounded-prism-21 p-[21px]">
        <h2 className="text-prism-panel-title text-prism-ink">{copy.title}</h2>
        <p className="text-prism-meta text-prism-ink-2">{copy.intro}</p>
        {s.disabledByAmped && (
          <Notice variant="warning" title="18+ turned off by Amped.Bio">
            {s.disabledReason ?? ""}
          </Notice>
        )}
        <ul>
          <Row ok={s.over18.pass} title={copy.over18}>
            {!s.over18.pass && (
              <p className="text-prism-meta text-prism-ink-2">
                Verify or share Over 18 in Authbase from Wallet, Identity.
              </p>
            )}
          </Row>
          <Row ok={s.seller.pass} title={copy.seller}>
            {!s.seller.pass && (
              <p className="text-prism-meta text-prism-ink-2">
                Finish Get paid: Authbase verified and an RNS name that points to your wallet.
              </p>
            )}
          </Row>
          <Row ok={s.policy.ok} title={copy.policy(s.policy.current)}>
            {!s.policy.ok && (
              <Button
                type="button"
                variant="outline"
                disabled={accept.isPending}
                onClick={() => accept.mutate()}
              >
                Read and accept
              </Button>
            )}
          </Row>
          <Row ok={s.custodian.named} title={copy.custodian}>
            {!s.custodian.named && (
              <form
                className="space-y-2"
                onSubmit={event => {
                  event.preventDefault();
                  custodian.mutate({ name, address });
                }}
              >
                <Input
                  aria-label="Custodian name"
                  placeholder="Full name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
                <Textarea
                  aria-label="Custodian address"
                  placeholder="Address"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={
                    custodian.isPending || name.trim().length < 2 || address.trim().length < 5
                  }
                >
                  Add custodian
                </Button>
              </form>
            )}
          </Row>
          <Row ok title={copy.people} />
        </ul>
        {error && (
          <p role="alert" className="text-prism-meta text-prism-danger">
            {error}
          </p>
        )}
        {s.enabled ? (
          <div className="space-y-1">
            <Button
              type="button"
              variant="outline"
              disabled={disable.isPending}
              onClick={() => disable.mutate()}
            >
              {copy.turnOff}
            </Button>
            <p className="text-prism-meta text-prism-ink-2">{copy.turnOffHelp}</p>
          </div>
        ) : (
          <Button
            type="button"
            disabled={!ready || enable.isPending || s.disabledByAmped}
            onClick={() => enable.mutate()}
          >
            {copy.turnOn}
          </Button>
        )}
      </section>
      {s.enabled && <People />}
    </div>
  );
}

function People() {
  const people = useQuery(trpc.adult.people.list.queryOptions());
  const [displayName, setDisplayName] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.adult.people.list.queryKey() });
  const invite = useMutation(
    trpc.adult.people.invite.mutationOptions({
      onSuccess: result => {
        setLink(result.link);
        setDisplayName("");
        void navigator.clipboard?.writeText(result.link).catch(() => undefined);
        void refresh();
      },
    })
  );
  const countersign = useMutation(
    trpc.adult.people.countersign.mutationOptions({ onSuccess: refresh })
  );

  return (
    <section className="prism-glass-clear space-y-[13px] !rounded-prism-21 p-[21px]">
      <h2 className="text-prism-panel-title text-prism-ink">People who appear</h2>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={event => {
          event.preventDefault();
          if (displayName.trim()) invite.mutate({ displayName });
        }}
      >
        <Input
          aria-label="Display name"
          placeholder="Display name"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          className="max-w-[260px]"
        />
        <Button type="submit" disabled={invite.isPending || !displayName.trim()}>
          <UserPlus aria-hidden />
          {copy.addPerson}
        </Button>
      </form>
      {link && (
        <p
          role="status"
          className="flex items-center gap-2 break-all text-prism-meta text-prism-ink"
        >
          <Copy aria-hidden className="h-4 w-4 shrink-0" />
          {copy.inviteCopied} {link}
        </p>
      )}
      <ul>
        {people.data?.map(person => (
          <li
            key={person.id}
            className="flex flex-wrap items-center gap-2 border-t border-prism-line py-[13px] first:border-t-0"
          >
            <span className="flex-1 font-semibold text-prism-ink">{person.displayName}</span>
            <span className="text-prism-meta text-prism-ink-2">
              {RELEASE_STATUS_LABELS[person.status as ReleaseStatus]}
            </span>
            {person.status === "waiting_for_you" && (
              <Button
                type="button"
                variant="outline"
                disabled={countersign.isPending}
                onClick={() => countersign.mutate({ id: person.id })}
              >
                {copy.countersign}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
