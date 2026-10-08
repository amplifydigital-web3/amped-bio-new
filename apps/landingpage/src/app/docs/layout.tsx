import type { Metadata } from "next";
import { PublicPage } from "@/components/layout/PublicPage";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { DocsMobileMenu } from "@/components/docs/DocsMobileMenu";
import { getDocsNavigation } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Developers | Amped.Bio",
  description: "Add Sign in with Amped.Bio to your application using OAuth 2.1 and OpenID Connect.",
};

// Screen Review 090 I01, I02: the D20 public shell. At 1024 and wider the
// sidebar card sits left of the page; below it a Docs menu row opens a sheet.
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const groups = getDocsNavigation();
  return (
    <PublicPage mainClassName="pt-[13px] sm:pt-[34px]">
      <div className="mx-auto w-full max-w-[1254px]">
        <DocsMobileMenu groups={groups} />
        <div className="mt-[13px] flex items-start gap-[34px] lg:mt-0">
          <DocsSidebar groups={groups} />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </PublicPage>
  );
}
