"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@repo/ui";
import { authClient } from "@/lib/auth-client";
import { cleanHandleInput } from "@/lib/handle";
import { getPanelHomeUrl } from "@/lib/panel";
import { useHandleAvailability } from "@/hooks/useHandleAvailability";
import { HandleStatusLine } from "@/components/auth/HandleStatusLine";

// Hero claim bar (Screen Review 007 I07, I08, I15). Signed out: a G2 well that
// reads amped.bio/ plus the handle, with a live status line, next to one 55
// primary that carries the handle into /register. Signed in: Open editor and
// View my page.
export function ClaimBar() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [handle, setHandle] = useState("");
  const { urlStatus, recheck } = useHandleAvailability(handle);
  const user = session?.user as { handle?: string | null } | undefined;

  if (user) {
    return (
      <div className="flex flex-col gap-[13px] sm:flex-row sm:items-center">
        <Button size="lg" asChild>
          <a href={getPanelHomeUrl()}>Open editor</a>
        </Button>
        {user.handle && (
          <Button variant="secondary" asChild>
            <a href={`/${user.handle}`} target="_blank" rel="noopener noreferrer">
              View my page
            </a>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-[13px]">
      <form
        className="flex flex-col gap-[13px] sm:flex-row sm:items-start sm:gap-2"
        onSubmit={event => {
          event.preventDefault();
          router.push(handle ? `/register?handle=${encodeURIComponent(handle)}` : "/register");
        }}
      >
        <div className="sm:w-[377px]">
          <label htmlFor="claim-handle" className="sr-only">
            Choose your page URL
          </label>
          <Input
            id="claim-handle"
            prefix="amped.bio/"
            value={handle}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-describedby="claim-status"
            onChange={event => setHandle(cleanHandleInput(event.target.value))}
          />
        </div>
        <Button type="submit" size="lg" className="w-full sm:w-auto">
          Claim your page
        </Button>
      </form>
      <HandleStatusLine
        id="claim-status"
        status={urlStatus}
        handle={handle}
        onRetry={recheck}
        onBareRoom
      />
      <p className="flex flex-wrap items-center gap-2 font-prism text-prism-body text-prism-ink-2">
        Already have a page?
        <Button variant="secondary" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </p>
    </div>
  );
}
