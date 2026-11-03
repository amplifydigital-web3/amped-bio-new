import { instrumentCaptchaVerification } from "./utils/captcha-observability";
import { verifySmtpTransport } from "./utils/email/email";
import { startBroadcastSweeper } from "./services/broadcast";
import { startNotificationLoop } from "./services/notifications/jobs";
import { startUsdcIndexer } from "./services/usdc";
import { startPaymentsAdminIndexer } from "./services/payments/indexer";
import { startContentSweeper } from "./services/content/state";
import { startOnrampTokenPurge } from "./services/onramp/sessions";
import { startRnsExpirySweeper } from "./services/rnsExpiry";
import { startCheckoutIntentPurge } from "./services/checkout/intents";
import { getGeoIpReader } from "./services/analytics/geoipDatabase";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

instrumentCaptchaVerification();

// Resume broadcasts left queued after a restart (Build Board #1)
startBroadcastSweeper();

// Amped Messages (#2 r4, M4): push and email reminder jobs, one polling instance via a Redis lock.
startNotificationLoop();

// USDC in the wallet (Build Board #29): index USDC transfers on Base. No-op until USDC_ENABLED.
startUsdcIndexer();
// AmpedPay admin (Build Board #50): mark Safe changes applied from the contract's events.
// No-op until AMPEDPAY_ADDRESS is set.
startPaymentsAdminIndexer();
// Content system (Build Board #20): fail uploads left unfinished for 24 hours and release their bytes.
startContentSweeper();
// Buy USDC: delete expired Coinbase userAuthTokens after their 60 day life
startOnrampTokenPurge();
// RNS name expiry emails: an hourly sweep, one email per name and stage
startRnsExpirySweeper();
// Mobile checkout (Build Board #49): delete checkout intents 30 days after they end
startCheckoutIntentPurge();

// Analytics location: open (or download) GeoLite2 City at boot so the first
// visits are located and a missing license key shows in the startup log.
void getGeoIpReader();

// Log whether the SMTP relay (SMTP2GO on staging and production) accepts our
// credentials, so a broken verification email shows at boot, not at sign up.
void verifySmtpTransport();
