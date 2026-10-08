import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button, cn } from "@repo/ui";
import { DISPLAY_TITLE_CLASS, Eyebrow } from "@/components/layout/PublicPage";
import { getDocsNavigation } from "@/lib/docs";

const REGISTER_URL = `${process.env.NEXT_PUBLIC_PANEL_URL || "https://app.amped.bio"}/account?tab=developers`;

/** 090 I04, I23: the Developers home: hero on the room, then grouped cards. */
export function DocsIndex() {
  const groups = getDocsNavigation();
  return (
    <div>
      <header className="pt-[21px]">
        <Eyebrow>Developers</Eyebrow>
        <h1 className={cn("mt-[13px] uppercase", DISPLAY_TITLE_CLASS)}>Sign in with Amped.Bio</h1>
        <p className="mt-[21px] max-w-[610px] text-prism-body text-prism-ink-2">
          Amped.Bio is an OAuth 2.1 and OpenID Connect provider. Applications can let their users
          sign in with their Amped.Bio account, read the profile and email they consent to share,
          and call the protected resource they were granted.
        </p>
        <div className="mt-[34px] flex flex-wrap items-center gap-[13px]">
          <Button size="lg" asChild>
            <Link href="/docs/quickstart">Start the quickstart</Link>
          </Button>
          <Button variant="secondary" asChild>
            <a href={REGISTER_URL}>Register an app</a>
          </Button>
        </div>
      </header>

      <div className="mt-[55px] space-y-[34px]">
        {groups.map(group => (
          <section key={group.group} aria-labelledby={`docs-group-${group.group}`}>
            <h2 id={`docs-group-${group.group}`}>
              <Eyebrow>{group.group}</Eyebrow>
            </h2>
            <div className="mt-[21px] grid gap-[21px] sm:grid-cols-2 sm:gap-[34px]">
              {group.pages.map(page => {
                const featured = page.slug === "quickstart";
                return (
                  <Link
                    key={page.slug}
                    href={`/docs/${page.slug}`}
                    className={cn(
                      "prism-focus relative block !rounded-prism-21 p-[21px] transition-[background-color,box-shadow] duration-prism-hover ease-prism",
                      featured ? "prism-lens" : "prism-glass-clear hover:bg-white/70"
                    )}
                  >
                    {featured && <span aria-hidden className="prism-rim" />}
                    <span className="flex items-start gap-[13px]">
                      <span className="min-w-0 flex-1">
                        <span className="block text-prism-panel-title text-prism-ink">
                          {page.title}
                        </span>
                        {page.description && (
                          <span className="mt-2 line-clamp-2 block text-prism-body text-prism-ink-2">
                            {page.description}
                          </span>
                        )}
                      </span>
                      <ArrowRight
                        aria-hidden
                        className="h-[21px] w-[21px] shrink-0 text-prism-nav"
                      />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
