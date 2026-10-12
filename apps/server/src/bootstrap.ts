import { instrumentCaptchaVerification } from "./utils/captcha-observability";
import { verifySmtpTransport } from "./utils/email/email";
import { startBroadcastSweeper } from "./services/broadcast";
import { startTelegramLoop } from "./services/telegram/loop";
import { startUsdcIndexer } from "./services/usdc";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

instrumentCaptchaVerification();

// Resume broadcasts left queued after a restart (Build Board #1)
startBroadcastSweeper();

// Messaging on Telegram (Build Board #2): drain the inbox and outbox tables. No-op until TELEGRAM_ENABLED.
startTelegramLoop();

// USDC in the wallet (Build Board #29): index USDC transfers on Base. No-op until USDC_ENABLED.
startUsdcIndexer();

// Log whether the SMTP relay (SMTP2GO on staging and production) accepts our
// credentials, so a broken verification email shows at boot, not at sign up.
void verifySmtpTransport();
