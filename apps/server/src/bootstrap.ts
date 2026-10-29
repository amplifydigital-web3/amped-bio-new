import { instrumentCaptchaVerification } from "./utils/captcha-observability";
import { verifySmtpTransport } from "./utils/email/email";
import { startBroadcastSweeper } from "./services/broadcast";
import { startTelegramLoop } from "./services/telegram/loop";
import { registerTelegramOutboxHandlers } from "./services/telegram/broadcast";
import { registerMessagingOutboxHandlers } from "./services/messaging/delivery";
import { registerGroupOutboxHandlers, startGroupChecks } from "./services/telegram/groups";
import { startUsdcIndexer } from "./services/usdc";
import { startContentSweeper } from "./services/content/state";
import { startOnrampTokenPurge } from "./services/onramp/sessions";
import { getGeoIpReader } from "./services/analytics/geoipDatabase";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

instrumentCaptchaVerification();

// Resume broadcasts left queued after a restart (Build Board #1)
startBroadcastSweeper();

// Messaging on Telegram (Build Board #2): drain the inbox and outbox tables. No-op until TELEGRAM_ENABLED.
registerTelegramOutboxHandlers();
registerMessagingOutboxHandlers();
registerGroupOutboxHandlers();
startTelegramLoop();
// Phase 2: hourly group checks. No-op until TELEGRAM_GROUPS.
startGroupChecks();

// USDC in the wallet (Build Board #29): index USDC transfers on Base. No-op until USDC_ENABLED.
startUsdcIndexer();
// Content system (Build Board #20): fail uploads left unfinished for 24 hours and release their bytes.
startContentSweeper();
// Buy USDC: delete expired Coinbase userAuthTokens after their 60 day life
startOnrampTokenPurge();

// Analytics location: open (or download) GeoLite2 City at boot so the first
// visits are located and a missing license key shows in the startup log.
void getGeoIpReader();

// Log whether the SMTP relay (SMTP2GO on staging and production) accepts our
// credentials, so a broken verification email shows at boot, not at sign up.
void verifySmtpTransport();
