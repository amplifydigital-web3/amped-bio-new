import { instrumentCaptchaVerification } from "./utils/captcha-observability";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

instrumentCaptchaVerification();
