/**
 * The app worker (public/sw.js), FL-5 parts: offline copies answer byte
 * ranges, the shell is kept only while offline is on, off drops both caches,
 * and nothing else is touched. Run in a sandbox with fake caches.
 */
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// jsdom's Blob is not the one the Response implementation accepts, so a body
// built from it reads back as "[object Blob]". Use Node's Blob throughout.
vi.stubGlobal("Blob", NodeBlob);

class FakeCache {
  entries = new Map<string, Response>();
  async put(key: string | Request, response: Response) {
    const url = typeof key === "string" ? key : new URL(key.url).pathname;
    // Copy as bytes: jsdom's Blob and the Response implementation do not always
    // agree, and a Blob that is not recognised reads back as "[object Blob]"
    this.entries.set(
      url,
      new Response(await response.arrayBuffer(), {
        headers: response.headers,
        status: response.status,
      })
    );
  }
  async match(key: string | Request) {
    const url = typeof key === "string" ? key : new URL(key.url).pathname;
    return this.entries.get(url)?.clone();
  }
  async delete(key: string | Request) {
    return this.entries.delete(typeof key === "string" ? key : new URL(key.url).pathname);
  }
  async keys() {
    return [...this.entries.keys()].map(path => new Request(`https://app.amped.bio${path}`));
  }
}

const ORIGIN = "https://app.amped.bio";
let stores: Map<string, FakeCache>;
let handlers: Record<string, (event: unknown) => void>;
let network: ReturnType<typeof vi.fn>;

function load() {
  stores = new Map();
  handlers = {};
  network = vi.fn(async (request: Request) => {
    if (new URL(request.url).pathname.startsWith("/assets/")) {
      return Object.assign(
        new Response("js", { headers: { "Content-Type": "text/javascript" } }),
        {}
      );
    }
    return new Response("<html>app</html>", { headers: { "Content-Type": "text/html" } });
  });
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return stores.get(name)!;
    },
    delete: async (name: string) => stores.delete(name),
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: unknown) => void) => (handlers[type] = fn),
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
  };
  const source = readFileSync(join(__dirname, "../../../../../public/sw.js"), "utf8");
  runInNewContext(source, {
    self,
    caches,
    fetch: (request: Request) => network(request),
    Response,
    Request,
    URL,
    Headers,
    Blob,
    JSON,
    Number,
    Math,
    String,
    console,
  });
}

/** Runs the fetch handler; null when the worker let the request through untouched. */
async function fetchVia(path: string, init: RequestInit & { mode?: RequestMode } = {}) {
  const held: { response: Promise<Response> | null } = { response: null };
  const { mode, ...rest } = init;
  const request = new Request(`${ORIGIN}${path}`, rest);
  const event = {
    request: Object.defineProperty(request, "mode", { value: mode ?? "cors" }),
    respondWith: (value: Promise<Response>) => (held.response = value),
  };
  handlers.fetch!(event);
  return held.response ? await held.response : null;
}

async function message(enabled: boolean) {
  let wait: Promise<unknown> = Promise.resolve();
  handlers.message!({
    data: { type: "amped-offline", enabled },
    waitUntil: (p: Promise<unknown>) => (wait = p),
  });
  await wait;
}

beforeEach(load);

describe("offline copies", () => {
  async function store(bytes: number) {
    if (!stores.has("amped-downloads-v1")) stores.set("amped-downloads-v1", new FakeCache());
    const cache = stores.get("amped-downloads-v1")!;
    await cache.put(
      "/downloads/abcd1234efgh5678",
      new Response(
        new Uint8Array(bytes).map((_, i) => i % 256),
        {
          headers: { "Content-Type": "video/mp4" },
        }
      )
    );
  }

  it("answers a byte range with 206 and the slice it names", async () => {
    await store(1000);
    const response = (await fetchVia("/downloads/abcd1234efgh5678", {
      headers: { Range: "bytes=10-19" },
    }))!;
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 10-19/1000");
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
  });

  it("answers open ended, suffix and whole file requests", async () => {
    await store(1000);
    const open = (await fetchVia("/downloads/abcd1234efgh5678", {
      headers: { Range: "bytes=990-" },
    }))!;
    expect(open.headers.get("Content-Range")).toBe("bytes 990-999/1000");
    const suffix = (await fetchVia("/downloads/abcd1234efgh5678", {
      headers: { Range: "bytes=-100" },
    }))!;
    expect(suffix.headers.get("Content-Range")).toBe("bytes 900-999/1000");
    const whole = (await fetchVia("/downloads/abcd1234efgh5678"))!;
    expect(whole.status).toBe(200);
    expect(whole.headers.get("Accept-Ranges")).toBe("bytes");
    const bad = (await fetchVia("/downloads/abcd1234efgh5678", {
      headers: { Range: "bytes=5000-" },
    }))!;
    expect(bad.status).toBe(416);
  });

  it("says a copy is not on this device", async () => {
    const response = (await fetchVia("/downloads/nope1234efgh5678"))!;
    expect(response.status).toBe(404);
  });
});

describe("the app shell", () => {
  it("stays out of the way while offline is off", async () => {
    await message(false);
    expect(await fetchVia("/library", { mode: "navigate" })).toBeNull();
    expect(await fetchVia("/assets/index-abc.js")).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });

  it("keeps index.html and built files while on, and serves them offline", async () => {
    await message(true);
    await fetchVia("/library", { mode: "navigate" });
    await fetchVia("/assets/index-abc.js");
    expect(stores.get("amped-shell-v1")!.entries.has("/__amped/shell")).toBe(true);
    expect(stores.get("amped-shell-v1")!.entries.has("/assets/index-abc.js")).toBe(true);

    network.mockRejectedValue(new TypeError("offline"));
    const page = (await fetchVia("/library/downloads", { mode: "navigate" }))!;
    expect(await page.text()).toBe("<html>app</html>");
    const asset = (await fetchVia("/assets/index-abc.js"))!;
    expect(await asset.text()).toBe("js");
  });

  it("never touches other origins or other same origin paths", async () => {
    await message(true);
    const handled = await fetchVia("/api/whatever");
    expect(handled).not.toBeNull();
    expect(stores.get("amped-shell-v1")?.entries.has("/api/whatever") ?? false).toBe(false);
    let responded = false;
    handlers.fetch!({
      request: new Request("https://api.amped.bio/trpc/library.newest"),
      respondWith: () => (responded = true),
    });
    expect(responded).toBe(false);
  });

  it("turning offline off deletes the shell and the downloads", async () => {
    await message(true);
    await fetchVia("/library", { mode: "navigate" });
    stores.set("amped-downloads-v1", new FakeCache());
    await message(false);
    expect(stores.has("amped-shell-v1")).toBe(false);
    expect(stores.has("amped-downloads-v1")).toBe(false);
  });

  it("keeps Web Push", () => {
    expect(typeof handlers.push).toBe("function");
    expect(typeof handlers.notificationclick).toBe("function");
  });
});
