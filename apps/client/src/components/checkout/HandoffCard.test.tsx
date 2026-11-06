import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { chromeIntentUrl, detectInAppBrowser } from "@repo/constants";
import { InAppBrowserGate, PayHandoffGate } from "./HandoffCard";
import { setFeatureFlagOverridesForTests } from "@/config/featureFlags";

const ID = "ab".repeat(16);
const LINK = `https://app.amped.bio/pay/${ID}`;

const UA = {
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.4.32.98 (iPhone15,2; iOS 17_5; en_US; en; scale=3.00; 1179x2556; 607588004)",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 Instagram 343.0.0.33.101 Android (34/14; 420dpi; 1080x2205; Google/google; Pixel 8; shiba; shiba; en_US; 627400398)",
  threadsIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 289.0.0.77.109 (iPhone14,2; iOS 17_3; en_US) Instagram",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/476.0.0.40.97;FBBV/636291163;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5]",
  tiktokIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_35.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US",
  linkedinIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1541",
  safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
};

afterEach(() => vi.restoreAllMocks());

describe("detectInAppBrowser (mobile checkout 7)", () => {
  it("names the app and the OS for each in app browser", () => {
    expect(detectInAppBrowser(UA.instagramIos)).toEqual({ app: "instagram", os: "ios" });
    expect(detectInAppBrowser(UA.instagramAndroid)).toEqual({ app: "instagram", os: "android" });
    expect(detectInAppBrowser(UA.threadsIos)).toEqual({ app: "threads", os: "ios" });
    expect(detectInAppBrowser(UA.facebookIos)).toEqual({ app: "facebook", os: "ios" });
    expect(detectInAppBrowser(UA.tiktokIos)).toEqual({ app: "tiktok", os: "ios" });
    expect(detectInAppBrowser(UA.linkedinIos)).toEqual({ app: "linkedin", os: "ios" });
  });

  it("leaves Safari, Chrome and an empty user agent alone", () => {
    expect(detectInAppBrowser(UA.safari)).toBeNull();
    expect(detectInAppBrowser(UA.chrome)).toBeNull();
    expect(detectInAppBrowser("")).toBeNull();
    expect(detectInAppBrowser(undefined)).toBeNull();
  });
});

describe("chromeIntentUrl", () => {
  it("opens the same https URL in Chrome, with the URL as the fallback", () => {
    expect(chromeIntentUrl(LINK)).toBe(
      `intent://app.amped.bio/pay/${ID}#Intent;scheme=https;package=com.android.chrome;` +
        `S.browser_fallback_url=${encodeURIComponent(LINK)};end`
    );
  });

  it("refuses anything but a plain https URL", () => {
    expect(() => chromeIntentUrl("http://app.amped.bio/pay/x")).toThrow();
    expect(() => chromeIntentUrl("javascript:alert(1)")).toThrow();
    expect(() => chromeIntentUrl(`${LINK}#frag`)).toThrow();
  });
});

describe("InAppBrowserGate (board c4)", () => {
  it("renders the route in Safari and Chrome", () => {
    render(
      <InAppBrowserGate link={LINK} userAgent={UA.safari}>
        <p>pay sheet</p>
      </InAppBrowserGate>
    );
    expect(screen.getByText("pay sheet")).toBeInTheDocument();
  });

  it("on iPhone in Instagram shows the two menu steps and Copy link, and no button that cannot work", () => {
    render(
      <InAppBrowserGate link={LINK} userAgent={UA.instagramIos}>
        <p>pay sheet</p>
      </InAppBrowserGate>
    );
    expect(screen.queryByText("pay sheet")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Open this in your browser to pay" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Instagram cannot finish a payment\. Sign in and pay in Safari\./)
    ).toBeInTheDocument();
    expect(screen.getByText("Tap ••• at the top right.")).toBeInTheDocument();
    expect(screen.getByText("Tap Open in external browser.")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map(b => b.textContent)).toEqual(["Copy link"]);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("Copy link copies the pay URL with the intent only", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(
      <InAppBrowserGate link={LINK} userAgent={UA.tiktokIos}>
        <p>pay sheet</p>
      </InAppBrowserGate>
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("button", { name: "Link copied" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(
      screen.getByText("The link opens this checkout. It does not sign anyone in.")
    ).toBeInTheDocument();
  });

  it("a blocked clipboard says how to copy by hand", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => Promise.reject(new Error("blocked"))) },
      configurable: true,
    });
    render(
      <InAppBrowserGate link={LINK} userAgent={UA.facebookIos}>
        <p>pay sheet</p>
      </InAppBrowserGate>
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByText(/Press and hold the link to copy it/)).toBeInTheDocument();
  });

  it("on Android leads with Open in Chrome, an intent link to the same URL", () => {
    render(
      <InAppBrowserGate link={LINK} userAgent={UA.instagramAndroid}>
        <p>pay sheet</p>
      </InAppBrowserGate>
    );
    const open = screen.getByRole("link", { name: "Open in Chrome" });
    expect(open.getAttribute("href")).toBe(chromeIntentUrl(LINK));
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.queryByText("Tap ••• at the top right.")).toBeNull();
  });

  it("on Android with a non https link falls back to Copy link instead of failing", () => {
    render(
      <InAppBrowserGate link={`http://localhost:5173/pay/${ID}`} userAgent={UA.instagramAndroid}>
        <p>pay sheet</p>
      </InAppBrowserGate>
    );
    expect(screen.queryByRole("link", { name: "Open in Chrome" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });
});

describe("PayHandoffGate", () => {
  beforeEach(() => setFeatureFlagOverridesForTests({ checkout: true }));
  afterEach(() => setFeatureFlagOverridesForTests({}));

  it("drops the query the page opened with, so the link carries the intent only", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(UA.instagramIos);
    render(
      <MemoryRouter initialEntries={[`/pay/${ID}?mock=paid&utm_source=ig`]}>
        <Routes>
          <Route path="/pay/:intentId" element={<PayHandoffGate>pay sheet</PayHandoffGate>} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await screen.findByRole("button", { name: "Link copied" });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/pay/${ID}`);
  });

  it("renders the page as is while the checkout flag is off", () => {
    setFeatureFlagOverridesForTests({ checkout: false });
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(UA.instagramIos);
    render(
      <MemoryRouter initialEntries={[`/pay/${ID}`]}>
        <Routes>
          <Route path="/pay/:intentId" element={<PayHandoffGate>pay sheet</PayHandoffGate>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("pay sheet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  });
});
