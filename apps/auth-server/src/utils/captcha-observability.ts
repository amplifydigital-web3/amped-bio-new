import { env } from "../env";

// Better Auth's captcha plugin silently returns a 403 ("Captcha verification failed")
// whenever the provider rejects the token, so the reason (invalid secret, expired or
// already redeemed token, ...) never reaches the server logs. This instruments the
// Cap siteverify call to surface the provider's verdict.

function verifyUrlPatterns(): string[] {
  const patterns = ["/siteverify"];

  if (env.CAPTCHA_SERVER_URL) {
    try {
      patterns.push(new URL(env.CAPTCHA_SERVER_URL).host);
    } catch {
      // Ignore malformed URLs; the path pattern still matches.
    }
  }

  return patterns;
}

type CaptchaVerdict = {
  success?: boolean;
  error?: string;
};

let installed = false;

function describeRequest(body: unknown) {
  if (typeof body !== "string") return {};

  const params = new URLSearchParams(body);
  const secret = params.get("secret") ?? "";
  const token = params.get("response") ?? "";

  return {
    secretConfigured: secret.length > 0,
    secretSuffix: secret ? secret.slice(-4) : null,
    tokenLength: token.length,
    remoteIp: params.get("remoteip"),
  };
}

async function logCaptchaVerdict(response: Response, request: Record<string, unknown>) {
  const body = await response.clone().text();

  let verdict: CaptchaVerdict | null;
  try {
    verdict = JSON.parse(body) as CaptchaVerdict;
  } catch {
    verdict = null;
  }

  const details = {
    ...request,
    status: response.status,
    success: verdict?.success,
    error: verdict?.error,
    body: body.slice(0, 300),
  };

  if (verdict?.success !== true) {
    console.error("[captcha] verification failed", JSON.stringify(details));
    return;
  }

  if (env.APP_ENV !== "production") {
    console.info("[captcha] verification succeeded", JSON.stringify(details));
  }
}

export function instrumentCaptchaVerification(): void {
  if (installed) return;
  installed = true;

  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function") return;

  const patterns = verifyUrlPatterns();

  console.info(
    "[captcha] siteverify instrumentation active",
    JSON.stringify({
      patterns,
      siteVerifyURL: `${env.CAPTCHA_SERVER_URL}/${env.CAPTCHA_SITE_KEY}/siteverify`,
      serverUrlConfigured: env.CAPTCHA_SERVER_URL.length > 0,
      siteKeyConfigured: env.CAPTCHA_SITE_KEY.length > 0,
      secretConfigured: env.CAPTCHA_SECRET_KEY.length > 0,
    })
  );

  globalThis.fetch = ((input: globalThis.RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (!patterns.some(pattern => url.includes(pattern))) {
      return originalFetch(input, init);
    }

    const request = { ...describeRequest(init?.body), siteVerifyUrl: url };

    return originalFetch(input, init).then(response => {
      void logCaptchaVerdict(response, request);
      return response;
    });
  }) as typeof globalThis.fetch;
}