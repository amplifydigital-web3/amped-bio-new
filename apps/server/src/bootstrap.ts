import { instrumentCaptchaVerification } from "./utils/captcha-observability";
import { startCronJobs } from "./services/cron";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

instrumentCaptchaVerification();
startCronJobs();
