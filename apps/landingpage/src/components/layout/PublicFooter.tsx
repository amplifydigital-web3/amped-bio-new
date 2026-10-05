import Image from "next/image";
import Link from "next/link";
import { TELEGRAM_LINK } from "@repo/constants";

export const PRIVACY_POLICY_URL = "/privacy";

const linkClass =
  "prism-focus inline-flex h-touch items-center rounded-prism-8 px-1 text-prism-label font-semibold text-prism-ink";

// Public footer on G0 (Screen Review 007 I13, D20): a line rule above, the
// logo, the site links with 44 hit areas, then the network line. Developers
// lives here at every width (the header drops it at 390).
export function PublicFooter() {
  return (
    <footer className="mx-auto w-full max-w-[1372px] border-t border-prism-line px-[13px] py-[34px] font-prism sm:px-0">
      <div className="flex flex-col gap-[13px] sm:flex-row sm:items-center sm:gap-[21px]">
        <Link
          href="/"
          className="prism-focus inline-flex h-touch w-fit items-center rounded-prism-8"
        >
          <Image
            src="/logo.svg"
            alt="Amped.Bio home"
            width={18}
            height={21}
            className="h-[21px] w-auto"
          />
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-[13px]">
          <Link href="/i/pools" className={linkClass}>
            Pools
          </Link>
          <Link href="/i/blog" className={linkClass}>
            Blog
          </Link>
          <Link href="/docs" className={linkClass}>
            Developers
          </Link>
          <a
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Privacy Policy
          </a>
          <a href={TELEGRAM_LINK} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Community on Telegram
          </a>
        </nav>
      </div>
      <p className="mt-[13px] text-prism-meta text-prism-ink-2">
        Built on the{" "}
        <a
          href="https://www.revolutionnetwork.io"
          target="_blank"
          rel="noopener noreferrer"
          className="prism-focus font-semibold text-prism-ink underline underline-offset-2"
        >
          Revolution Network
        </a>
      </p>
    </footer>
  );
}
