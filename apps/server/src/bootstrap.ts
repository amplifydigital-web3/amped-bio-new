import { instrumentCaptchaVerification } from "./utils/captcha-observability";
import { startCronJobs } from "./services/cron";
import { startBroadcastSweeper } from "./services/broadcast";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

instrumentCaptchaVerification();
startCronJobs();

// Resume broadcasts left queued after a restart (Build Board #1)
startBroadcastSweeper();
