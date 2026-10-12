// The public reading card shared by blog posts and developer docs (Screen
// Review 072 I12, 090 I01, I09, I13; 090 D1 code slab). G1 clear r21, 720 wide
// with 55 padding (21 at 390) around a 610 reading column.
export const ARTICLE_CARD_CLASS =
  "prism-glass-clear mx-auto w-full max-w-[720px] px-[21px] py-[34px] sm:px-[55px] sm:py-[55px]";

// Every WordPress or Markdown element mapped to Prism type and tokens.
export const ARTICLE_PROSE_CLASS = [
  "font-prism text-prism-body text-prism-ink [overflow-wrap:anywhere]",
  "[&>*:first-child]:mt-0",
  // Paragraphs 16/26 with 21 between
  "[&_p]:my-[21px]",
  // Headings: h2 26/33, h3 20/23, h4 16/20, all 700
  "[&_h2]:mb-[13px] [&_h2]:mt-[34px] [&_h2]:text-prism-card-title [&_h2]:text-prism-ink",
  "[&_h3]:mb-[8px] [&_h3]:mt-[21px] [&_h3]:text-prism-panel-title [&_h3]:text-prism-ink",
  "[&_h4]:mb-[8px] [&_h4]:mt-[21px] [&_h4]:text-prism-label [&_h4]:font-bold [&_h4]:text-prism-ink",
  // Links #5650A2 underlined
  "[&_a]:font-semibold [&_a]:text-prism-nav [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-prism-nav-hover",
  // Lists: 21 indent, 8 between items
  "[&_ul]:my-[21px] [&_ul]:list-disc [&_ul]:pl-[21px] [&_ol]:my-[21px] [&_ol]:list-decimal [&_ol]:pl-[21px] [&_li]:my-[8px] [&_li]:pl-1",
  // Blockquote: 16/26 ink-2, 3 wide line-strong rule, 21 padding
  "[&_blockquote]:my-[21px] [&_blockquote]:border-l-[3px] [&_blockquote]:border-prism-line-strong [&_blockquote]:px-[21px] [&_blockquote]:text-prism-ink-2",
  // Inline code on the line token, r8, 3 5 padding, mono 13/16
  "[&_:not(pre)>code]:rounded-prism-8 [&_:not(pre)>code]:bg-prism-line [&_:not(pre)>code]:px-[5px] [&_:not(pre)>code]:py-[3px] [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-prism-meta [&_:not(pre)>code]:text-prism-ink",
  // Code block: the D1 code slab, mono 13/21, padding 13 21, scrolls inside
  "[&_pre]:my-[21px] [&_pre]:overflow-x-auto [&_pre]:rounded-prism-21 [&_pre]:px-[21px] [&_pre]:py-[13px] [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-[21px] [&_pre]:text-prism-ink [&_pre]:[overflow-wrap:normal]",
  // G2 slab values (section 5)
  "[&_pre]:bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(255,255,255,0.7))] [&_pre]:shadow-[inset_0_1px_0_#FFFFFF,inset_0_0_0_1px_rgba(22,21,43,0.08),3px_8px_21px_rgba(46,20,60,0.06)]",
  // Media r13, iframes 16:9
  "[&_img]:my-[21px] [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-prism-13",
  "[&_iframe]:my-[21px] [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-prism-13",
  "[&_figure]:my-[21px] [&_figcaption]:mt-[8px] [&_figcaption]:text-prism-meta [&_figcaption]:text-prism-ink-2",
  // Tables on a G2 slab, rows 44, line dividers
  "[&_table]:my-[21px] [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-prism-21",
  "[&_table]:bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(255,255,255,0.7))] [&_table]:shadow-[inset_0_1px_0_#FFFFFF,inset_0_0_0_1px_rgba(22,21,43,0.08),3px_8px_21px_rgba(46,20,60,0.06)]",
  "[&_th]:h-touch [&_th]:border-b [&_th]:border-prism-line [&_th]:px-4 [&_th]:text-left [&_th]:align-middle [&_th]:text-prism-eyebrow [&_th]:uppercase [&_th]:text-prism-ink-2",
  "[&_td]:h-touch [&_td]:border-b [&_td]:border-prism-line [&_td]:px-4 [&_td]:py-[9px] [&_td]:align-top [&_tr:last-child_td]:border-b-0",
  // Rule: 1px line with 34 above and below
  "[&_hr]:my-[34px] [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-prism-line",
].join(" ");
