// Name Fuzzy text (spec 3.5): the name drawn on a canvas, cut into one pixel
// rows that shift sideways with noise, so the edges shimmer. Strength sets
// the largest shift (0 to 8 px), Speed how fast it changes. The heading text
// stays in the page for screen readers and selection.

export interface FuzzyOptions {
  text: string;
  font: string;
  color: string;
  /** 0 to 100 */
  strength: number;
  /** 0 to 100, 50 is the shipped pace */
  speed: number;
  width: number;
  height: number;
  /** The text's left inset and baseline inside the canvas, in CSS px */
  x: number;
  baseline: number;
  align: CanvasTextAlign;
}

export function createFuzzy(options: FuzzyOptions, dpr: number) {
  const source = document.createElement("canvas");
  const pad = 12;
  source.width = Math.ceil((options.width + pad * 2) * dpr);
  source.height = Math.ceil(options.height * dpr);
  const sctx = source.getContext("2d");
  if (sctx) {
    sctx.scale(dpr, dpr);
    sctx.font = options.font;
    sctx.fillStyle = options.color;
    sctx.textAlign = options.align;
    sctx.textBaseline = "alphabetic";
    sctx.fillText(options.text, options.x + pad, options.baseline);
  }
  const amount = (Math.max(0, Math.min(100, options.strength)) / 100) * 8;
  const rate = Math.max(0, options.speed) / 50;
  let tick = 0;
  return {
    pad,
    draw(ctx: CanvasRenderingContext2D, time: number) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      // A new shift pattern about 30 times a second at Speed 50
      const step = Math.floor(time * 30 * rate);
      if (rate > 0) tick = step;
      const rows = source.height;
      for (let y = 0; y < rows; y++) {
        const noise = Math.sin(y * 12.9898 + tick * 78.233) * 43758.5453;
        const shift = (noise - Math.floor(noise) - 0.5) * 2 * amount * dpr;
        ctx.drawImage(source, 0, y, source.width, 1, shift, y, source.width, 1);
      }
    },
  };
}
