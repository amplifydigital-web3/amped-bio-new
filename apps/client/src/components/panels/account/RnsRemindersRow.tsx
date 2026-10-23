import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch, trpc } from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { DisclosureRow } from "../design/kit/DisclosureRow";

// RNS name expiry emails. A row of the Account card; the reminder email links
// here with ?open=reminders. On unless turned off.

export const RNS_REMINDERS_ROW = "reminders";

export function RnsRemindersRow() {
  const queryClient = useQueryClient();
  const setting = useQuery(trpc.notifications.rnsReminders.queryOptions());
  const save = useMutation(
    trpc.notifications.setRnsReminders.mutationOptions({
      onSuccess: next => queryClient.setQueryData(trpc.notifications.rnsReminders.queryKey(), next),
      onError: () => toast.add({ type: "error", title: "The setting did not save. Try again." }),
    })
  );
  // Still loading or did not load: no row, so nothing shows a guessed state
  if (!setting.data) return null;
  const enabled = save.isPending ? !!save.variables?.enabled : setting.data.enabled;

  return (
    <DisclosureRow id={RNS_REMINDERS_ROW} label="Name reminders" value={enabled ? "On" : "Off"}>
      <Switch
        checked={enabled}
        disabled={save.isPending}
        onChange={checked => save.mutate({ enabled: checked })}
        label="Email me before an RNS name expires"
        description="30, 7 and 1 day before a name expires, and when it enters the 1 day grace period. Sent to your verified email."
      />
    </DisclosureRow>
  );
}
