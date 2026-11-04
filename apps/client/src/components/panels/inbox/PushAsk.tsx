import { useState } from "react";
import { MESSAGE_UI } from "@repo/constants";
import { Button, Notice } from "@repo/ui";
import { enablePush, markPushAsked } from "./push";

const S = MESSAGE_UI.push;

/** The in Inbox push ask after the first message sent (spec 9, board m8). Shown once. */
export function PushAsk({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const close = () => {
    markPushAsked();
    onDone();
  };
  if (result) {
    return (
      <Notice>
        <p>{result}</p>
      </Notice>
    );
  }
  return (
    <Notice title={S.ask}>
      <p>{S.askBody}</p>
      <div className="mt-[13px] flex flex-wrap gap-[13px]">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const state = await enablePush().catch(() => "off" as const);
            setBusy(false);
            markPushAsked();
            if (state === "on") return onDone();
            setResult(
              state === "blocked" ? S.blocked : state === "unsupported" ? S.unsupported : S.off
            );
          }}
        >
          {S.turnOn}
        </Button>
        <Button variant="ghost" onClick={close}>
          {S.notNow}
        </Button>
      </div>
    </Notice>
  );
}
