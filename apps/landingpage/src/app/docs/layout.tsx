import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { getDocsNavigation } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Developers | Amped.bio",
  description: "Add Sign in with Amped.bio to your application using OAuth 2.1 and OpenID Connect.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const navigation = getDocsNavigation();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PublicHeader />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-6 py-10 lg:flex-row">
        <nav aria-label="Documentation" className="lg:w-64 lg:flex-shrink-0">
          <Link href="/docs" className="text-sm font-semibold uppercase tracking-wide text-gray-900">
            Documentation
          </Link>
          <div className="mt-4 space-y-6">
            {navigation.map(section => (
              <div key={section.group}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{section.group}</p>
                <ul className="mt-2 space-y-1">
                  {section.pages.map(page => (
                    <li key={page.slug}>
                      <Link
                        href={`/docs/${page.slug}`}
                        className="block rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      >
                        {page.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
