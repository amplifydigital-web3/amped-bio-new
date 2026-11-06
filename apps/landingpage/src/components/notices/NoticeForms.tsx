"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TAKEDOWN_COPY as copy, type TakedownStatus } from "@repo/constants";
import { trpcClient } from "@/lib/trpc";

/**
 * Public notice forms (adult content review 7.2 and 7.5, boards ar7 to ar9, PR R3):
 * Take It Down at /takedown, copyright notices at /copyright, the counter notice at
 * /copyright/{number}/counter (signed in, the item's owner), and the status pages.
 * No account is needed except for the counter notice.
 */

const FIELD = "flex flex-col gap-1 text-[15px] font-semibold";
const INPUT = "min-h-[44px] rounded-[8px] border border-black/25 px-3 font-normal";
const BUTTON =
  "min-h-[44px] rounded-full bg-[#16152B] px-[21px] font-semibold text-white disabled:opacity-60";

const MISSING_LABEL: Record<string, string> = {
  where: "Where it is",
  link: "An Amped.Bio link to the item",
  statement: "The good faith statement",
  relationship: "Your relationship to the person shown",
  signature: "Your typed signature",
  work: "What was copied",
  name: "Your full name",
  postal_address: "Your postal address",
  good_faith: "The good faith statement",
  accuracy: "The accuracy statement",
};

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : "That did not send. Try again.";
}

function Sent({ number, missing }: { number: string; missing: string[] }) {
  return (
    <div role="status" className="space-y-[8px] rounded-[13px] border border-black/15 p-[21px]">
      <p className="text-[18px] font-semibold">{copy.sent(number)}</p>
      {missing.length > 0 && (
        <>
          <p className="font-semibold">{copy.needsMore}</p>
          <ul className="list-disc pl-5">
            {missing.map(field => (
              <li key={field}>{MISSING_LABEL[field] ?? field}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function TakedownForm() {
  const params = useSearchParams();
  const [links, setLinks] = useState(params.get("link") ?? "");
  const [handle, setHandle] = useState("");
  const [description, setDescription] = useState("");
  const [goodFaith, setGoodFaith] = useState(false);
  const [detail, setDetail] = useState("");
  const [relationship, setRelationship] = useState<"self" | "agent">("self");
  const [agentDetail, setAgentDetail] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; missing: string[] } | null>(null);

  if (done) return <Sent number={done.number} missing={done.missing} />;

  return (
    <form
      className="flex flex-col gap-[21px]"
      onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const result = await trpcClient.takedown.submit.mutate({
            links: links
              .split(/\s+/)
              .map(l => l.trim())
              .filter(Boolean),
            handle: handle || undefined,
            description: description || undefined,
            goodFaith,
            detail: detail || undefined,
            relationship,
            agentDetail: agentDetail || undefined,
            email,
            phone: phone || undefined,
            signature,
          });
          setDone({ number: result.number, missing: result.missing });
        } catch (failure) {
          setError(errorText(failure));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset className="flex flex-col gap-[13px]">
        <legend className="text-[18px] font-bold">{copy.where}</legend>
        <label className={FIELD}>
          {copy.linksHelp}
          <textarea
            className={INPUT}
            rows={3}
            value={links}
            onChange={e => setLinks(e.target.value)}
          />
        </label>
        <label className={FIELD}>
          {copy.handleHelp}
          <input
            className={INPUT}
            value={handle}
            onChange={e => setHandle(e.target.value)}
            placeholder="@handle"
          />
        </label>
        <textarea
          className={INPUT}
          rows={2}
          value={description}
          onChange={e => setDescription(e.target.value)}
          aria-label="Describe the item"
        />
      </fieldset>
      <label className="flex items-start gap-2 text-[15px]">
        <input
          type="checkbox"
          required
          checked={goodFaith}
          onChange={e => setGoodFaith(e.target.checked)}
        />
        {copy.statement}
      </label>
      <label className={FIELD}>
        {copy.detail}
        <textarea
          className={INPUT}
          rows={3}
          value={detail}
          onChange={e => setDetail(e.target.value)}
        />
      </label>
      <fieldset className="flex flex-col gap-[8px]">
        <legend className="text-[18px] font-bold">{copy.who}</legend>
        {(["self", "agent"] as const).map(value => (
          <label key={value} className="flex items-center gap-2 text-[15px]">
            <input
              type="radio"
              name="relationship"
              checked={relationship === value}
              onChange={() => setRelationship(value)}
            />
            {value === "self" ? copy.self : copy.agent}
          </label>
        ))}
        {relationship === "agent" && (
          <label className={FIELD}>
            {copy.agentDetail}
            <input
              className={INPUT}
              required
              value={agentDetail}
              onChange={e => setAgentDetail(e.target.value)}
            />
          </label>
        )}
      </fieldset>
      <fieldset className="flex flex-col gap-[13px]">
        <legend className="text-[18px] font-bold">{copy.contact}</legend>
        <label className={FIELD}>
          {copy.email}
          <input
            className={INPUT}
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </label>
        <label className={FIELD}>
          {copy.phone}
          <input
            className={INPUT}
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </label>
      </fieldset>
      <label className={FIELD}>
        {copy.signature}
        <input
          className={INPUT}
          required
          value={signature}
          onChange={e => setSignature(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={BUTTON}>
        {copy.submit}
      </button>
    </form>
  );
}

export function CopyrightForm() {
  const params = useSearchParams();
  const [work, setWork] = useState("");
  const [workLink, setWorkLink] = useState("");
  const [links, setLinks] = useState(params.get("link") ?? "");
  const [name, setName] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [goodFaith, setGoodFaith] = useState(false);
  const [accurate, setAccurate] = useState(false);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; missing: string[] } | null>(null);

  if (done) return <Sent number={done.number} missing={done.missing} />;

  return (
    <form
      className="flex flex-col gap-[21px]"
      onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const result = await trpcClient.copyright.submit.mutate({
            work,
            workLink: workLink || undefined,
            links: links
              .split(/\s+/)
              .map(l => l.trim())
              .filter(Boolean),
            name,
            postalAddress,
            email,
            phone: phone || undefined,
            goodFaith,
            accurate,
            signature,
          });
          setDone({ number: result.number, missing: result.missing });
        } catch (failure) {
          setError(errorText(failure));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className={FIELD}>
        {copy.work}
        <textarea
          className={INPUT}
          rows={3}
          required
          value={work}
          onChange={e => setWork(e.target.value)}
        />
      </label>
      <label className={FIELD}>
        {copy.workLink}
        <input
          className={INPUT}
          type="url"
          value={workLink}
          onChange={e => setWorkLink(e.target.value)}
        />
      </label>
      <label className={FIELD}>
        {copy.linksHelp}
        <textarea
          className={INPUT}
          rows={3}
          required
          value={links}
          onChange={e => setLinks(e.target.value)}
        />
      </label>
      <label className={FIELD}>
        {copy.name}
        <input className={INPUT} required value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label className={FIELD}>
        {copy.postalAddress}
        <textarea
          className={INPUT}
          rows={2}
          required
          value={postalAddress}
          onChange={e => setPostalAddress(e.target.value)}
        />
      </label>
      <label className={FIELD}>
        {copy.email}
        <input
          className={INPUT}
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </label>
      <label className={FIELD}>
        {copy.phone}
        <input
          className={INPUT}
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
        />
      </label>
      <label className="flex items-start gap-2 text-[15px]">
        <input
          type="checkbox"
          required
          checked={goodFaith}
          onChange={e => setGoodFaith(e.target.checked)}
        />
        {copy.goodFaithCopyright}
      </label>
      <label className="flex items-start gap-2 text-[15px]">
        <input
          type="checkbox"
          required
          checked={accurate}
          onChange={e => setAccurate(e.target.checked)}
        />
        {copy.accurate}
      </label>
      <label className={FIELD}>
        {copy.signature}
        <input
          className={INPUT}
          required
          value={signature}
          onChange={e => setSignature(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={BUTTON}>
        {copy.submit}
      </button>
    </form>
  );
}

export function CounterForm({ number }: { number: string }) {
  const [mistake, setMistake] = useState(false);
  const [jurisdiction, setJurisdiction] = useState(false);
  const [acceptService, setAcceptService] = useState(false);
  const [name, setName] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; restoreFrom: string | Date; restoreBy: string | Date } | null>(
    null
  );

  if (done) {
    return (
      <p
        role="status"
        className="rounded-[13px] border border-black/15 p-[21px] text-[16px] font-semibold"
      >
        Counter notice {done.number} received. We send a copy to the sender. Unless they tell us
        they filed an action, the item comes back between{" "}
        {new Date(done.restoreFrom).toDateString()} and {new Date(done.restoreBy).toDateString()}.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-[21px]"
      onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          setDone(
            await trpcClient.copyright.counter.mutate({
              number,
              mistake,
              name,
              postalAddress,
              phone,
              jurisdiction,
              acceptService,
              signature,
            })
          );
        } catch (failure) {
          const code = (failure as { data?: { code?: string } } | null)?.data?.code;
          setError(
            code === "UNAUTHORIZED"
              ? "Sign in with the account that owns the item."
              : errorText(failure)
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="flex items-start gap-2 text-[15px]">
        <input
          type="checkbox"
          required
          checked={mistake}
          onChange={e => setMistake(e.target.checked)}
        />
        {copy.counterMistake}
      </label>
      <label className={FIELD}>
        {copy.name}
        <input className={INPUT} required value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label className={FIELD}>
        {copy.postalAddress}
        <textarea
          className={INPUT}
          rows={2}
          required
          value={postalAddress}
          onChange={e => setPostalAddress(e.target.value)}
        />
      </label>
      <label className={FIELD}>
        Phone
        <input
          className={INPUT}
          type="tel"
          required
          value={phone}
          onChange={e => setPhone(e.target.value)}
        />
      </label>
      <label className="flex items-start gap-2 text-[15px]">
        <input
          type="checkbox"
          required
          checked={jurisdiction}
          onChange={e => setJurisdiction(e.target.checked)}
        />
        {copy.counterJurisdiction}
      </label>
      <label className="flex items-start gap-2 text-[15px]">
        <input
          type="checkbox"
          required
          checked={acceptService}
          onChange={e => setAcceptService(e.target.checked)}
        />
        {copy.counterService}
      </label>
      <label className={FIELD}>
        {copy.signature}
        <input
          className={INPUT}
          required
          value={signature}
          onChange={e => setSignature(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={BUTTON}>
        {copy.submit}
      </button>
    </form>
  );
}

export function NoticeStatus({ kind, number }: { kind: "takedown" | "copyright"; number: string }) {
  const params = useSearchParams();
  const key = params.get("k") ?? "";
  const [status, setStatus] = useState<TakedownStatus | null | "missing">(null);
  useEffect(() => {
    const call = kind === "takedown" ? trpcClient.takedown.status : trpcClient.copyright.status;
    call
      .query({ number, key })
      .then(setStatus)
      .catch(() => setStatus("missing"));
  }, [kind, number, key]);
  if (status === null) return <p role="status">Checking</p>;
  if (status === "missing")
    return <p role="alert">We could not find that request. Check the link in your email.</p>;
  return (
    <div className="space-y-[8px]">
      <p className="text-[18px] font-semibold">{copy.states[status.state]}</p>
      {status.outcome && <p>Outcome: {copy.outcomes[status.outcome]}</p>}
      <p>Received {new Date(status.receivedAt).toDateString()}</p>
      {status.missing.length > 0 && (
        <ul className="list-disc pl-5">
          {status.missing.map(field => (
            <li key={field}>{MISSING_LABEL[field] ?? field}</li>
          ))}
        </ul>
      )}
      {status.restoreFrom && status.restoreBy && (
        <p>
          Restore window: {new Date(status.restoreFrom).toDateString()} to{" "}
          {new Date(status.restoreBy).toDateString()}
        </p>
      )}
    </div>
  );
}
