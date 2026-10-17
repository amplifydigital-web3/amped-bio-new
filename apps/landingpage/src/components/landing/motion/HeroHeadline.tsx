import type { CSSProperties } from "react";

/**
 * The landing headline with a word reveal (Build Board #26, section 3.3):
 * each word rises out of a mask, 377 ms, 55 ms apart. CSS only, so it renders
 * on the server, reads as plain text, and rests in place under reduced motion
 * or Pause motion.
 */
export function HeroHeadline({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <h1 className={className}>
      {words.map((word, index) => (
        <span key={index}>
          <span className="motion-word">
            <span style={{ "--motion-i": index } as CSSProperties}>{word}</span>
          </span>
          {index < words.length - 1 ? " " : null}
        </span>
      ))}
    </h1>
  );
}
