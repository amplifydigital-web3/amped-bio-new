import Link from "next/link";
import { getAllDocs } from "@/lib/docs";

export function DocsIndex() {
  const pages = getAllDocs();

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900">Sign in with Amped.bio</h1>
      <p className="mt-3 leading-7 text-gray-700">
        Amped.bio is an OAuth 2.1 and OpenID Connect provider. Applications can let their users sign in with
        their Amped.bio account, read the profile and email they consent to share, and call the protected
        resource they were granted.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {pages.map(page => (
          <Link
            key={page.slug}
            href={`/docs/${page.slug}`}
            className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
          >
            <p className="font-medium text-gray-900">{page.title}</p>
            {page.description ? <p className="mt-1 text-sm text-gray-600">{page.description}</p> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
