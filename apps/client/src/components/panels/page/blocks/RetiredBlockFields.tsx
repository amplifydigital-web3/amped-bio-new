import { RETIRED_TELEGRAM_GROUP_NOTICE } from "@repo/constants";
import { Notice } from "@repo/ui";
import type { ConfigChange } from "./BlockFields";

/**
 * A Telegram group block left on a page after Telegram ended (Amped Messages, PR M8).
 * Visitors no longer see it and it has nothing to edit. The notice points to a
 * Community link; the row's own Delete removes it.
 */
export function RetiredBlockFields(_props: { onValid?: ConfigChange }) {
  return (
    <Notice variant="warning" className="rounded-prism-13">
      <p>{RETIRED_TELEGRAM_GROUP_NOTICE}</p>
    </Notice>
  );
}
