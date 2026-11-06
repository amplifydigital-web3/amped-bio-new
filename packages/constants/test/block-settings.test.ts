import { describe, expect, it } from "vitest";
import {
  attentionCount,
  blockConfigSchemaFor,
  blockVisibility,
  countdownLine,
  editBlocksSchema,
  formatScheduleDay,
  motionSummary,
  scheduleState,
  scheduleSummary,
  scheduledBlockDto,
  stripBlockSettings,
  telegramMessageConfigSchema,
} from "../src";

const NOW = new Date("2026-10-26T12:00:00Z");
const LISBON = "Europe/Lisbon";

const settings = {
  schedule: {
    start: "2026-11-06T20:00:00.000Z",
    end: "2026-11-08T23:59:00.000Z",
    zone: LISBON,
    showCountdown: true,
  },
  attention: { preset: "shimmer" },
  motion: { entrance: true, style: "rise" },
};

describe("Block settings on every config schema", () => {
  const configs: Record<string, Record<string, unknown>> = {
    link: { platform: "custom", url: "https://maravale.shop/kiln", label: "Kiln sale" },
    media: { platform: "youtube", url: "https://youtube.com/watch?v=abc", label: "" },
    text: { content: "<p>Hello</p>", platform: "text" },
    pool: { address: "0xabc", label: "Pool" },
    referral: {},
    follow: { label: "Follow" },
    rnsid: {},
    telegram_message: { label: "Message me on Telegram" },
    telegram_group: { label: "Join my Telegram group" },
    message: { label: "Message me" },
    content: { label: "Latest", layout: "featured", publicIds: [] },
    store: { label: "" },
  };

  for (const [type, config] of Object.entries(configs)) {
    it(`keeps the settings on a ${type} block`, () => {
      const parsed = blockConfigSchemaFor(type).parse({ ...config, ...settings });
      expect(parsed.schedule).toEqual(settings.schedule);
      expect(parsed.attention).toEqual(settings.attention);
      expect(parsed.motion).toEqual(settings.motion);
    });
  }

  it("keeps settings through the page save", () => {
    const parsed = editBlocksSchema.parse({
      blocks: [{ id: 1, type: "message", order: 0, config: { label: "Hi", ...settings } }],
    });
    expect(parsed.blocks[0]!.config).toMatchObject({ attention: { preset: "shimmer" } });
  });

  it("refuses an expire before go live", () => {
    const result = telegramMessageConfigSchema.safeParse({
      label: "Hi",
      schedule: { start: "2026-11-08T10:00:00Z", end: "2026-11-06T10:00:00Z", zone: LISBON },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Expire must be after Go live");
  });

  it("refuses an unknown time zone and an unknown preset", () => {
    expect(
      blockConfigSchemaFor("follow").safeParse({
        label: "Follow",
        schedule: { start: "2026-11-06T20:00:00Z", zone: "Mars/Olympus" },
      }).success
    ).toBe(false);
    expect(
      blockConfigSchemaFor("follow").safeParse({ label: "Follow", attention: { preset: "spin" } })
        .success
    ).toBe(false);
  });

  it("strips the settings when the flag is off", () => {
    expect(stripBlockSettings({ label: "Hi", hidden: true, ...settings })).toEqual({
      label: "Hi",
      hidden: true,
    });
  });
});

describe("scheduleState and blockVisibility (BS1)", () => {
  it("reads live, upcoming and expired", () => {
    expect(scheduleState(undefined, NOW)).toBe("live");
    expect(scheduleState(settings.schedule, NOW)).toBe("upcoming");
    expect(scheduleState(settings.schedule, new Date("2026-11-07T00:00:00Z"))).toBe("live");
    expect(scheduleState(settings.schedule, new Date("2026-11-09T00:00:00Z"))).toBe("expired");
  });

  it("drops hidden and expired blocks, and upcoming ones without a countdown", () => {
    expect(blockVisibility({ config: { label: "A", hidden: true } }, NOW)).toBe("drop");
    expect(
      blockVisibility({ config: { label: "A", schedule: { ...settings.schedule, showCountdown: false } } }, NOW)
    ).toBe("drop");
    expect(
      blockVisibility({ config: { label: "A", schedule: settings.schedule } }, new Date("2026-11-10T00:00:00Z"))
    ).toBe("drop");
    expect(blockVisibility({ config: { label: "A" } }, NOW)).toBe("show");
  });

  it("sends a countdown row with the label and start only", () => {
    const block = {
      id: 7,
      type: "link",
      order: 2,
      config: { label: "Kiln sale preview", url: "https://maravale.shop/preview", ...settings },
    };
    expect(blockVisibility(block, NOW)).toBe("countdown");
    const dto = scheduledBlockDto(block);
    expect(dto).toEqual({
      id: 7,
      type: "link",
      order: 2,
      config: { label: "Kiln sale preview" },
      scheduled: { start: settings.schedule.start },
    });
    expect(JSON.stringify(dto)).not.toContain("maravale.shop");
  });

  it("drops an upcoming block with no label instead of a blank countdown", () => {
    expect(blockVisibility({ config: { content: "<p>x</p>", schedule: settings.schedule } }, NOW)).toBe(
      "drop"
    );
  });
});

describe("schedule copy", () => {
  it("uses the real weekday in the zone", () => {
    // 6 Nov 2026 is a Friday; 9 Nov 2026 is a Monday
    expect(formatScheduleDay("2026-11-06T20:00:00Z", LISBON, NOW)).toBe("Fri 6 Nov");
    expect(formatScheduleDay("2026-11-09T10:00:00Z", LISBON, NOW)).toBe("Mon 9 Nov");
    expect(formatScheduleDay("2027-01-04T10:00:00Z", LISBON, NOW)).toBe("Mon 4 Jan 2027");
  });

  it("summarises the row value", () => {
    expect(scheduleSummary(undefined, NOW)).toBe("Always on");
    expect(scheduleSummary(settings.schedule, NOW)).toBe("Fri 6 Nov to Sun 8 Nov");
    expect(scheduleSummary({ zone: LISBON, start: settings.schedule.start }, NOW)).toBe(
      "From Fri 6 Nov"
    );
    expect(scheduleSummary(settings.schedule, new Date("2026-11-10T00:00:00Z"))).toBe("Expired");
  });

  it("counts days, then hours, then minutes, never seconds", () => {
    expect(countdownLine("2026-11-06T20:00:00Z", NOW, LISBON)).toBe(
      "Opens in 11 days · Fri 6 Nov, 8:00 PM your time"
    );
    expect(countdownLine("2026-10-26T17:30:00Z", NOW, LISBON)).toMatch(/^Opens in 5 hours/);
    expect(countdownLine("2026-10-26T12:30:00Z", NOW, LISBON)).toMatch(/^Opens in 30 minutes/);
    expect(countdownLine("2026-10-26T12:00:20Z", NOW, LISBON)).toMatch(/^Opens in 1 minute ·/);
  });

  it("names the motion row value", () => {
    expect(motionSummary(undefined)).toBe("Entrance on");
    expect(motionSummary({ entrance: true, style: "rise" })).toBe("Rise");
    expect(motionSummary({ entrance: false, style: "rise" })).toBe("Off");
  });

  it("counts attention blocks", () => {
    expect(
      attentionCount([
        { config: { attention: { preset: "glow" } } },
        { config: { attention: { preset: "off" } } },
        { config: {} },
      ])
    ).toBe(1);
  });
});
