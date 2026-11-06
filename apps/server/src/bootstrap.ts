import { instrumentCaptchaVerification } from "./utils/captcha-observability";
import { verifySmtpTransport } from "./utils/email/email";
import { startBroadcastSweeper } from "./services/broadcast";
import { startTelegramLoop } from "./services/telegram/loop";
import { startNotificationLoop } from "./services/notifications/jobs";
import { registerTelegramOutboxHandlers } from "./services/telegram/broadcast";
import { registerMessagingOutboxHandlers } from "./services/messaging/delivery";
import { registerGroupOutboxHandlers, startGroupChecks } from "./services/telegram/groups";
import { startUsdcIndexer } from "./services/usdc";
import { startPaymentsAdminIndexer } from "./services/payments/indexer";
import { startPaymentsWorker } from "./services/payments/paymentsWorker";
import { startMembershipRenewals } from "./services/memberships/renewals";
import { startContentSweeper } from "./services/content/state";
import { startEdgeSync } from "./services/content/edge";
import { startOnrampTokenPurge } from "./services/onramp/sessions";
import { startReservedHandlesSweeper } from "./services/handles/sweeper";
import { startRnsExpirySweeper } from "./services/rnsExpiry";
import { startSellerOverrideSweeper } from "./services/identity/sellerOverride";
import { startCheckoutIntentPurge } from "./services/checkout/intents";
import { getGeoIpReader } from "./services/analytics/geoipDatabase";
import { startFeatureFlagRefresh } from "./services/featureFlags";
import { startAccessNightly } from "./services/access/nightly";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

instrumentCaptchaVerification();

// Feature flags from site_settings: load the rows, then reload them every 15 seconds.
// Until the first load answers, every flag reads its environment variable as before.
void startFeatureFlagRefresh();

// Resume broadcasts left queued after a restart (Build Board #1)
startBroadcastSweeper();

// Messaging on Telegram (Build Board #2): drain the inbox and outbox tables. No-op until TELEGRAM_ENABLED.
registerTelegramOutboxHandlers();
registerMessagingOutboxHandlers();
registerGroupOutboxHandlers();
startTelegramLoop();
// Amped Messages (#2 r4, M4): push and email reminder jobs, one polling instance via a Redis lock.
startNotificationLoop();
// Phase 2: hourly group checks. No-op while the telegramGroups feature flag is off.
startGroupChecks();

// USDC in the wallet (Build Board #29): index USDC transfers on Base. Each tick is a no-op while the usdc flag is off.
startUsdcIndexer();
// AmpedPay admin (Build Board #50): mark Safe changes applied from the contract's events.
// No-op until AMPEDPAY_ADDRESS is set.
startPaymentsAdminIndexer();
startPaymentsWorker();
startMembershipRenewals();
// Content system (Build Board #20): fail uploads left unfinished for 24 hours and release their bytes.
startContentSweeper();
startEdgeSync();
// Buy USDC: delete expired Coinbase userAuthTokens after their 60 day life
startOnrampTokenPurge();
// Reserved handles (Build Board D2): renames on the notice deadline, ends holds and redirects.
startReservedHandlesSweeper();
// RNS name expiry emails: an hourly sweep, one email per name and stage
startRnsExpirySweeper();
// AB-6: seller override reminders and end notices (Build Board #66)
startSellerOverrideSweeper();
// Mobile checkout (Build Board #49): delete checkout intents 30 days after they end
startCheckoutIntentPurge();
// Access gating (Build Board #21, G6): nightly leak scan and the 25 month access event purge
startAccessNightly();

// Analytics location: open (or download) GeoLite2 City at boot so the first
// visits are located and a missing license key shows in the startup log.
void getGeoIpReader();

// Log whether the SMTP relay (SMTP2GO on staging and production) accepts our
// credentials, so a broken verification email shows at boot, not at sign up.
void verifySmtpTransport();
