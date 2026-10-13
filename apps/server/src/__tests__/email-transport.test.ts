/**
 * Email delivery through SMTP2GO: the API transport, the SMTP fallback, the
 * boot check and the deployment guard. fetch and nodemailer are mocked, so no
 * network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  sendMail: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("../env", () => ({ env: state.env }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail: state.sendMail, verify: state.verify }),
  },
}));

const baseEnv = {
  APP_ENV: "staging",
  EMAIL_TRANSPORT: "auto",
  SMTP2GO_API_KEY: "",
  SMTP2GO_API_URL: "https://api.smtp2go.com/v3/",
  SMTP_FROM_NAME: "Amped.Bio",
  SMTP_FROM_EMAIL: "noreply@amped.bio",
  SMTP_HOST: "mail.smtp2go.com",
  SMTP_PORT: 2525,
  SMTP_SECURE: false,
  SMTP_USER: "amped",
  SMTP_PASSWORD: "secret",
};

const email = { to: ["fan@example.com"], subject: "Verify", html: "<p>hi</p>" };

function reply(status: number, body: unknown) {
  return { status, json: async () => body } as Response;
}

async function load() {
  vi.resetModules();
  return import("../utils/email/transport");
}

beforeEach(() => {
  for (const key of Object.keys(state.env)) delete state.env[key];
  Object.assign(state.env, baseEnv);
  state.sendMail.mockReset();
  state.verify.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transport choice", () => {
  it("uses the API when a key is set and SMTP otherwise", async () => {
    let t = await load();
    expect(t.activeTransport()).toBe("smtp");
    state.env.SMTP2GO_API_KEY = "api-123";
    t = await load();
    expect(t.activeTransport()).toBe("smtp2go-api");
    state.env.EMAIL_TRANSPORT = "smtp";
    t = await load();
    expect(t.activeTransport()).toBe("smtp");
  });

  it("formats the sender with the display name", async () => {
    const t = await load();
    expect(t.senderAddress()).toBe("Amped.Bio <noreply@amped.bio>");
  });
});

describe("SMTP2GO API", () => {
  beforeEach(() => {
    state.env.SMTP2GO_API_KEY = "api-123";
  });

  it("posts to /email/send with the key header and returns the email id", async () => {
    const fetchMock = vi.fn(async () =>
      reply(200, {
        request_id: "r1",
        data: { succeeded: 1, failed: 0, failures: [], email_id: "e1" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = await load();
    const result = await t.deliverEmail(email);
    expect(result).toEqual({ transport: "smtp2go-api", id: "e1", detail: "r1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.smtp2go.com/v3/email/send");
    expect((init.headers as Record<string, string>)["X-Smtp2go-Api-Key"]).toBe("api-123");
    expect(JSON.parse(init.body as string)).toEqual({
      sender: "Amped.Bio <noreply@amped.bio>",
      to: ["fan@example.com"],
      subject: "Verify",
      html_body: "<p>hi</p>",
    });
  });

  it("throws with SMTP2GO's reason when the sender is not verified", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(400, {
          data: {
            error: "The sender noreply@amped.bio is not a verified sender",
            error_code: "E_ApiResponseCodes.NON_VALIDATING_IN_PAYLOAD",
          },
        })
      )
    );
    const t = await load();
    await expect(t.deliverEmail(email)).rejects.toThrow(/not a verified sender/);
  });

  it("treats a 200 with failures as a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(200, { data: { succeeded: 0, failed: 1, failures: ["fan@example.com"] } })
      )
    );
    const t = await load();
    await expect(t.deliverEmail(email)).rejects.toThrow(/SMTP2GO refused/);
  });

  it("reports a rejected key at the boot check", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(401, {}))
    );
    const t = await load();
    const check = await t.checkTransport();
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/401/);
  });

  it("passes the boot check when the key lacks only the stats permission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(403, {}))
    );
    const t = await load();
    expect((await t.checkTransport()).ok).toBe(true);
  });
});

describe("SMTP relay", () => {
  it("sends through nodemailer with the formatted sender", async () => {
    state.sendMail.mockResolvedValue({ messageId: "<m1>", response: "250 OK" });
    const t = await load();
    const result = await t.deliverEmail(email);
    expect(result).toEqual({ transport: "smtp", id: "<m1>", detail: "250 OK" });
    expect(state.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Amped.Bio <noreply@amped.bio>", to: "fan@example.com" })
    );
  });
});

describe("deployment guard", () => {
  it("flags the MailDev default on staging and production", async () => {
    state.env.SMTP_HOST = "localhost";
    const t = await load();
    expect(t.misconfiguredForDeployment()).toMatch(/SMTP_HOST is "localhost" on staging/);
  });

  it("flags a missing SMTP user", async () => {
    state.env.SMTP_USER = "";
    const t = await load();
    expect(t.misconfiguredForDeployment()).toMatch(/SMTP_USER is empty/);
  });

  it("is quiet with an API key, and in development", async () => {
    state.env.SMTP_HOST = "localhost";
    state.env.SMTP2GO_API_KEY = "api-123";
    let t = await load();
    expect(t.misconfiguredForDeployment()).toBeNull();
    state.env.SMTP2GO_API_KEY = "";
    state.env.APP_ENV = "development";
    t = await load();
    expect(t.misconfiguredForDeployment()).toBeNull();
  });
});
