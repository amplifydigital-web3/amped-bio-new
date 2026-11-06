import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ADULT_SETUP_COPY as copy } from "@repo/constants";
import { Button, Input, queryClient, trpc } from "@repo/ui";

/**
 * The item editor 18+ section (adult content review 5.3, board ar4, PR R4): who
 * appears (Ready people only, with recording dates), the AI label, the confirmation
 * and Submit for review. Shown with 18+ turned on for the creator and the label on.
 */
export function AdultItemSection({ publicId }: { publicId: string }) {
  const people = useQuery(trpc.adult.people.list.queryOptions());
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [aiLabel, setAiLabel] = useState<boolean | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const save = useMutation(trpc.adult.setItemPeople.mutationOptions());
  const submit = useMutation(trpc.adult.submitForReview.mutationOptions());

  const ready = (people.data ?? []).filter(person => person.valid);
  const entries = Object.entries(picked).map(([personId, dates]) => ({
    personId,
    productionDates: dates.split(/[\s,]+/).filter(Boolean),
  }));

  const send = async () => {
    setMessage(null);
    if (aiLabel === null) {
      setMessage("Answer Made or changed with AI.");
      return;
    }
    try {
      await save.mutateAsync({ publicId, people: entries, aiLabel, confirmed: true });
      await submit.mutateAsync({ publicId, confirmed });
      setMessage(copy.inReview);
      void queryClient.invalidateQueries({ queryKey: trpc.content.get.queryKey({ publicId }) });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That did not save. Try again.");
    }
  };

  return (
    <section aria-label="18+" className="space-y-[13px] px-[13px] py-[8px]">
      <fieldset className="space-y-1">
        <legend className="text-prism-label font-semibold text-prism-ink">Who appears</legend>
        <p className="text-prism-meta text-prism-ink-2">
          Only you, unless you tick people from your list.
        </p>
        {ready.map(person => (
          <div key={person.id} className="space-y-1">
            <label className="flex items-center gap-2 text-prism-body">
              <input
                type="checkbox"
                checked={person.id in picked}
                onChange={e =>
                  setPicked(current => {
                    const next = { ...current };
                    if (e.target.checked) next[person.id] = "";
                    else delete next[person.id];
                    return next;
                  })
                }
              />
              {person.displayName}
            </label>
            {person.id in picked && (
              <Input
                aria-label={`Recording dates with ${person.displayName}`}
                placeholder="Recording dates, YYYY-MM-DD, comma separated"
                value={picked[person.id]}
                onChange={e => setPicked(current => ({ ...current, [person.id]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="text-prism-label font-semibold text-prism-ink">{copy.aiLabel}</legend>
        {[true, false].map(value => (
          <label key={String(value)} className="mr-4 inline-flex items-center gap-2">
            <input
              type="radio"
              name={`ai-${publicId}`}
              checked={aiLabel === value}
              onChange={() => setAiLabel(value)}
            />
            {value ? "Yes" : "No"}
          </label>
        ))}
      </fieldset>
      <label className="flex items-start gap-2 text-prism-body">
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
        {copy.confirmation}
      </label>
      <Button
        type="button"
        disabled={!confirmed || save.isPending || submit.isPending}
        onClick={() => void send()}
      >
        {copy.submit}
      </Button>
      {message && (
        <p role="status" className="text-prism-meta text-prism-ink-2">
          {message}
        </p>
      )}
    </section>
  );
}
