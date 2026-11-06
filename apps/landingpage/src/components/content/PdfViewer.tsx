"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { fetchPlayback } from "@/lib/content";
import { matchingPages } from "@/lib/pdfSearch";
import { SITE_CONTENT_COPY as copy } from "./copy";

type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number; height: number };
    render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): {
      promise: Promise<void>;
    };
    getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  }>;
  destroy(): Promise<void>;
};

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }
  return pdfjs;
}

/** One page, drawn when it scrolls near the viewport. */
function PdfPage({
  doc,
  number,
  width,
  anchorId,
  onSeen,
}: {
  doc: PdfDoc;
  number: number;
  width: number;
  anchorId: string;
  onSeen: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(number === 1);
  const [ratio, setRatio] = useState(1.294);

  // The page indicator follows the page that fills most of the screen
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      entries => entries.some(entry => entry.isIntersecting) && onSeen(number),
      { threshold: 0.5 }
    );
    observer.observe(holder);
    return () => observer.disconnect();
  }, [number, onSeen]);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || visible) return;
    const observer = new IntersectionObserver(
      entries => entries.some(entry => entry.isIntersecting) && setVisible(true),
      { rootMargin: "600px 0px" }
    );
    observer.observe(holder);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !width) return;
    let live = true;
    void doc.getPage(number).then(async page => {
      const base = page.getViewport({ scale: 1 });
      const scale = (width * (window.devicePixelRatio || 1)) / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!live || !canvas) return;
      setRatio(base.height / base.width);
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (context) await page.render({ canvasContext: context, viewport }).promise;
    });
    return () => {
      live = false;
    };
  }, [doc, number, visible, width]);

  return (
    <div
      ref={holderRef}
      id={anchorId}
      className="w-full scroll-mt-[89px] overflow-hidden rounded-[8px] bg-white shadow"
      style={{ aspectRatio: `1 / ${ratio}` }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={copy.pageOf(number, doc.numPages)}
        className="h-full w-full"
      />
    </div>
  );
}

/**
 * The in app PDF viewer (spec 3.6): pdf.js draws each page from the gateway URL
 * as it scrolls into view. The file never opens as a browser page, so the
 * gateway's sandbox headers stay strict. When pdf.js can not load, the page
 * images the processor made are shown instead.
 */
export function PdfViewer({
  publicId,
  fallbackPages,
  title,
}: {
  publicId: string;
  fallbackPages: string[];
  title: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [failed, setFailed] = useState(false);
  const [pages, setPages] = useState<string[]>(fallbackPages);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<number[] | null>(null);
  const [searching, setSearching] = useState(false);
  const textsRef = useRef<string[] | null>(null);
  const baseId = useId();
  const anchor = (n: number) => `${baseId}-page-${n}`;
  const onSeen = useCallback((n: number) => setPage(n), []);

  const runSearch = async () => {
    if (!doc || !query.trim()) return;
    setSearching(true);
    try {
      if (!textsRef.current) {
        const texts: string[] = [];
        for (let n = 1; n <= doc.numPages; n += 1) {
          const content = await (await doc.getPage(n)).getTextContent();
          texts.push(content.items.map(part => part.str ?? "").join(" "));
        }
        textsRef.current = texts;
      }
      setResults(matchingPages(textsRef.current, query));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const goTo = (n: number) => {
    document.getElementById(anchor(n))?.scrollIntoView({ block: "start" });
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry!.contentRect.width))
    );
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    let loaded: PdfDoc | null = null;
    void (async () => {
      try {
        const playback = await fetchPlayback(publicId);
        if (!live) return;
        if (playback?.document?.pages.length) setPages(playback.document.pages);
        const src = playback?.document?.src;
        if (!src) throw new Error("no document");
        const pdfjs = await loadPdfJs();
        // isEvalSupported false keeps pdf.js off the eval path for PostScript
        // functions: the reader does not need them.
        loaded = (await pdfjs.getDocument({
          url: src,
          withCredentials: false,
          isEvalSupported: false,
        }).promise) as unknown as PdfDoc;
        if (live) setDoc(loaded);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
      void loaded?.destroy();
    };
  }, [publicId]);

  return (
    <div
      ref={wrapRef}
      aria-label={title}
      role="document"
      className="flex w-full flex-col gap-[13px]"
    >
      {doc && (
        <div className="sticky top-[8px] z-10 rounded-[13px] bg-black/80 px-[13px] py-[4px] text-white">
          <div className="flex min-h-[44px] items-center justify-between gap-[13px]">
            <p className="text-[15px] tabular-nums" aria-live="polite">
              {copy.pageOf(page, doc.numPages)}
            </p>
            <button
              type="button"
              aria-label={searchOpen ? copy.searchClose : copy.searchDocument}
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen(open => !open);
                setResults(null);
              }}
              className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-full outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
            >
              {searchOpen ? (
                <X className="h-5 w-5" aria-hidden />
              ) : (
                <Search className="h-5 w-5" aria-hidden />
              )}
            </button>
          </div>
          {searchOpen && (
            <form
              role="search"
              className="pb-[8px]"
              onSubmit={event => {
                event.preventDefault();
                void runSearch();
              }}
            >
              <div className="flex gap-[8px]">
                <label className="sr-only" htmlFor={`${baseId}-q`}>
                  {copy.searchLabel}
                </label>
                <input
                  id={`${baseId}-q`}
                  type="search"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  className="min-h-[44px] min-w-0 flex-1 rounded-[8px] border border-white/40 bg-transparent px-[13px] text-[16px] text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
                />
                <button
                  type="submit"
                  disabled={searching || !query.trim()}
                  className="min-h-[44px] rounded-full bg-white px-[18px] text-[16px] font-semibold text-[#16152B] outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                >
                  {copy.searchGo}
                </button>
              </div>
              <div role="status" className="mt-[8px] text-[15px]">
                {searching
                  ? copy.searching
                  : results === null
                    ? ""
                    : results.length
                      ? copy.searchMatches(results.length)
                      : copy.searchNone}
              </div>
              {!searching && results && results.length > 0 && (
                <ul className="mt-[4px] flex flex-wrap gap-[8px]">
                  {results.slice(0, 50).map(n => (
                    <li key={n}>
                      <button
                        type="button"
                        onClick={() => goTo(n)}
                        className="min-h-[44px] rounded-full border border-white/60 px-[13px] text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        {copy.searchGoTo(n)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          )}
        </div>
      )}
      {doc ? (
        Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage
            key={i + 1}
            doc={doc}
            number={i + 1}
            width={width}
            anchorId={anchor(i + 1)}
            onSeen={onSeen}
          />
        ))
      ) : failed ? (
        <>
          <p className="text-[14px] opacity-80" role="status">
            {copy.documentError}
          </p>
          {pages.map((page, index) => (
            <img
              key={page}
              src={page}
              alt={copy.pageAlt(index + 1)}
              className="w-full rounded-[8px] bg-white shadow"
            />
          ))}
        </>
      ) : (
        <div
          className="flex min-h-[233px] items-center justify-center gap-2 rounded-[13px] bg-black/10"
          role="status"
        >
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
          <span>{copy.documentLoading}</span>
        </div>
      )}
    </div>
  );
}
