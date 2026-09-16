import { env } from "../env";

// Better Auth's captcha plugin silently returns a 403 ("Captcha verification failed")
// whenever Google rejects the token, so the reason (invalid secret, expired/duplicate
// token, low score, ...) never reaches the server logs. This instruments the
// siteverify call to surface Google's verdict.

const CAPTCHA_VERIFY_URL_PATTERNS = [
  "/recaptcha/api/siteverify",
  "recaptchaenterprise.googleapis.com",
];

// Mirrors the plugin default (`minScore` in the google-recaptcha handler).
const MIN_SCORE = 0.5;

type CaptchaVerdict = {
  success?: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
  challenge_ts?: string;
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
  let verdict: CaptchaVerdict;
  try {
    verdict = (await response.clone().json()) as CaptchaVerdict;
  } catch {
    console.error("[captcha] siteverify returned a non-JSON response", JSON.stringify(request));
    return;
  }

  const score = typeof verdict.score === "number" ? verdict.score : undefined;
  const failed = verdict.success !== true || (score !== undefined && score < MIN_SCORE);

  const details = {
    ...request,
    success: verdict.success,
    score,
    action: verdict.action,
    hostname: verdict.hostname,
    errorCodes: verdict["error-codes"],
    challengeTs: verdict.challenge_ts,
  };

  if (failed) {
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

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (!CAPTCHA_VERIFY_URL_PATTERNS.some(pattern => url.includes(pattern))) {
      return originalFetch(input, init);
    }

    const request = { ...describeRequest(init?.body), siteVerifyUrl: url };

    return originalFetch(input, init).then(response => {
      void logCaptchaVerdict(response, request);
      return response;
    });
  }) as typeof globalThis.fetch;
}
