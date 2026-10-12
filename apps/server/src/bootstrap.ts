import { instrumentCaptchaVerification } from "./utils/captcha-observability";
import { verifySmtpTransport } from "./utils/email/email";
import { startBroadcastSweeper } from "./services/broadcast";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

instrumentCaptchaVerification();

// Resume broadcasts left queued after a restart (Build Board #1)
startBroadcastSweeper();

// Log whether the SMTP relay (SMTP2GO on staging and production) accepts our
// credentials, so a broken verification email shows at boot, not at sign up.
void verifySmtpTransport();
