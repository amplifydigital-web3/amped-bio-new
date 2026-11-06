import { describe, expect, it } from "vitest";
import { ATTENTION_INTERVAL_MS, ATTENTION_PLAYS } from "@repo/constants";
import {
  ATTENTION_START,
  attentionDone,
  attentionStep,
  parseStoredPlays,
} from "../src/blocks/attention-schedule";

// Block settings BS3: on view, then every 8 seconds, 3 plays per visit. A play
// due while the block is out of view waits until it is back in view.

describe("attentionStep", () => {
  it("does nothing before the block is in view", () => {
    const step = attentionStep(ATTENTION_START, 1000, false);
    expect(step).toEqual({ clock: ATTENTION_START, play: false, wait: null });
  });

  it("plays at once on the first view, then every 8 seconds", () => {
    const first = attentionStep(ATTENTION_START, 1000, true);
    expect(first.play).toBe(true);
    expect(first.clock.plays).toBe(1);
    expect(first.wait).toBe(ATTENTION_INTERVAL_MS);

    const early = attentionStep(first.clock, 1000 + 5000, true);
    expect(early.play).toBe(false);
    expect(early.wait).toBe(3000);

    const second = attentionStep(first.clock, 1000 + ATTENTION_INTERVAL_MS, true);
    expect(second.play).toBe(true);
    expect(second.clock.plays).toBe(2);
  });

  it("waits for the entrance when given a first delay", () => {
    const step = attentionStep(ATTENTION_START, 1000, true, 377);
    expect(step.play).toBe(false);
    expect(step.wait).toBe(377);
    expect(attentionStep(step.clock, 1377, true).play).toBe(true);
  });

  it("stops after 3 plays", () => {
    let clock = ATTENTION_START;
    let now = 0;
    let plays = 0;
    for (let i = 0; i < 10; i++) {
      const step = attentionStep(clock, now, true);
      if (step.play) plays++;
      clock = step.clock;
      if (step.wait === null) break;
      now += step.wait;
    }
    expect(plays).toBe(ATTENTION_PLAYS);
    expect(attentionDone(clock)).toBe(true);
    expect(attentionStep(clock, now + 60_000, true)).toMatchObject({ play: false, wait: null });
  });

  it("holds a play due out of view until the block is back", () => {
    const first = attentionStep(ATTENTION_START, 0, true);
    const away = attentionStep(first.clock, 9000, false);
    expect(away.play).toBe(false);
    expect(away.wait).toBeNull();
    expect(away.clock).toEqual(first.clock);

    const back = attentionStep(away.clock, 30_000, true);
    expect(back.play).toBe(true);
    expect(back.clock.plays).toBe(2);
    // The next play counts from the late play, not from the missed time
    expect(back.clock.dueAt).toBe(30_000 + ATTENTION_INTERVAL_MS);
  });
});

describe("parseStoredPlays", () => {
  it("reads a stored count and clamps it", () => {
    expect(parseStoredPlays(null)).toBe(0);
    expect(parseStoredPlays("x")).toBe(0);
    expect(parseStoredPlays("-2")).toBe(0);
    expect(parseStoredPlays("2")).toBe(2);
    expect(parseStoredPlays("9")).toBe(ATTENTION_PLAYS);
  });
});
