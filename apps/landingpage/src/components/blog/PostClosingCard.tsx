"use client";

import Link from "next/link";
import { ArrowRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui";
import { authClient } from "@/lib/auth-client";
import { getPanelHomeUrl } from "@/lib/panel";

// Screen Review 072 I15: where reading stops, one primary next step. Signed
// out it goes to /register; signed in it opens the editor. Copy link copies
// the post URL and raises the toast Link copied.
export function PostClosingCard() {
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session?.user);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split("#")[0]);
      toast.success("Link copied");
    } catch {
      toast.error("Link not copied");
    }
  };

  return (
    <section className="prism-glass-clear mx-auto w-full max-w-[610px] p-[21px] sm:p-[34px]">
      <h2 className="text-prism-panel-title text-prism-ink">Build your own page</h2>
      <p className="mt-2 text-prism-body text-prism-ink-2">
        Your links, content and pool on one page.
      </p>
      <div className="mt-[21px] flex flex-col gap-[13px] sm:flex-row sm:items-center">
        <Button asChild size="lg" className="w-full sm:w-auto">
          {signedIn ? (
            <a href={getPanelHomeUrl()}>
              Open editor
              <ArrowRight aria-hidden />
            </a>
          ) : (
            <Link href="/register">
              Create your page
              <ArrowRight aria-hidden />
            </Link>
          )}
        </Button>
        <Button variant="secondary" className="w-full sm:w-auto" onClick={() => void copyLink()}>
          <Copy aria-hidden />
          Copy link
        </Button>
      </div>
    </section>
  );
}
