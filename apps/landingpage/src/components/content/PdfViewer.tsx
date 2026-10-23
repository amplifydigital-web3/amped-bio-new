"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchPlayback } from "@/lib/content";
import { SITE_CONTENT_COPY as copy } from "./copy";

type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number; height: number };
    render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): {
      promise: Promise<void>;
    };
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
function PdfPage({ doc, number, width }: { doc: PdfDoc; number: number; width: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(number === 1);
  const [ratio, setRatio] = useState(1.294);

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
      className="w-full overflow-hidden rounded-[8px] bg-white shadow"
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
        loaded = (await pdfjs.getDocument({ url: src, withCredentials: false })
          .promise) as unknown as PdfDoc;
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
      {doc ? (
        Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage key={i + 1} doc={doc} number={i + 1} width={width} />
        ))
      ) : failed ? (
        <>
          <p className="text-[14px] opacity-80" role="status">
            {copy.documentError}
          </p>
          {pages.map((page, index) => (
            // eslint-disable-next-line @next/next/no-img-element
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
