import Link from "next/link";
import { Button } from "@repo/ui";

// Screen Review 090 I17: the docs not found state in the article slot
export default function DocsNotFound() {
  return (
    <section className="prism-glass-clear w-full max-w-[508px] !rounded-prism-21 p-[21px] sm:p-[34px]">
      <h1 className="text-prism-panel-title text-prism-ink">This page is not in the docs</h1>
      <p className="mt-2 text-prism-body text-prism-ink-2">
        It may have moved. Start from the Developers home.
      </p>
      <Button variant="secondary" asChild className="mt-[21px]">
        <Link href="/docs">Developers home</Link>
      </Button>
    </section>
  );
}
