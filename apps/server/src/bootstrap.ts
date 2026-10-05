import { instrumentCaptchaVerification } from "./utils/captcha-observability";
import { startBroadcastSweeper } from "./services/broadcast";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

instrumentCaptchaVerification();

// Resume broadcasts left queued after a restart (Build Board #1)
startBroadcastSweeper();
