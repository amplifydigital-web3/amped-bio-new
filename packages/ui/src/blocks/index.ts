// Block Review v2 B0 (Build Board #54): the shared pieces every block uses
export {
  BlockFrame,
  type AttentionPlayEvent,
  type BlockFrameMode,
  type BlockFrameProps,
} from "./block-frame";
export { CountdownRow, type CountdownRowProps } from "./countdown-row";
export { OPENS_NOW_LINE, countdownRowLine } from "./countdown-line";
export {
  ATTENTION_START,
  attentionDone,
  attentionStep,
  parseStoredPlays,
  type AttentionClock,
  type AttentionStep,
} from "./attention-schedule";
export {
  ATTENTION_MS,
  ENTRANCE_SHORT_MS,
  attentionTarget,
  entranceKeyframes,
  motionOf,
  playAttention,
  playEntrance,
  resolveEntrance,
  withAlpha,
} from "./block-motion";
