import { post } from "@toruslabs/http-helpers";
import { AUTH_CONNECTION, BUILD_ENV, storageAvailable } from "@web3auth/auth";
import { WalletInitializationError } from "@web3auth/no-modal";

import { version } from "../../config";
import { PASSWORDLESS_BUILD_ENV_MAP } from "../config";
import {
  CodeInitiateRequestBodyParams,
  CodeVerifyRequestBodyParams,
  IStartResponse,
  IVerifyResponse,
  PasswordlessHandlerParams,
  WhiteLabelParams,
} from "../interfaces";
import { getErrorMessages } from "../utils";

export abstract class PasswordlessHandler {
  authBaseApiUrl: string;

  passwordlessParams: PasswordlessHandlerParams;

  trackingIdentifier?: string;

  version: string = `web3auth-${version.split(".")[0]}`;

  constructor(params: PasswordlessHandlerParams) {
    if (!params.authConnection) throw WalletInitializationError.invalidParams("authConnection is required");
    if (!params.web3authClientId) throw WalletInitializationError.invalidParams("web3authClientId is required");
    if (!params.loginHint) throw WalletInitializationError.invalidParams("loginHint is required");
    if (!params.network) throw WalletInitializationError.invalidParams("network is required");
    if (!params.authBuildEnv) params.authBuildEnv = BUILD_ENV.PRODUCTION;
    this.authBaseApiUrl = `${PASSWORDLESS_BUILD_ENV_MAP[params.authBuildEnv]}/api/v3/auth`;
    this.passwordlessParams = params;
  }

  get name(): string {
    if (this.passwordlessParams.authConnection === AUTH_CONNECTION.EMAIL_PASSWORDLESS) return "Email";
    if (this.passwordlessParams.authConnection === AUTH_CONNECTION.SMS_PASSWORDLESS) return "Mobile";
    throw WalletInitializationError.invalidParams("Invalid authConnection");
  }

  get connection(): "email" | "sms" {
    if (this.passwordlessParams.authConnection === AUTH_CONNECTION.EMAIL_PASSWORDLESS) return "email";
    if (this.passwordlessParams.authConnection === AUTH_CONNECTION.SMS_PASSWORDLESS) return "sms";
    throw WalletInitializationError.invalidParams("Invalid authConnection");
  }

  get trackingId(): string | undefined {
    return this.trackingIdentifier;
  }

  get sessionStorageAvailable(): boolean {
    return storageAvailable("sessionStorage");
  }

  get whiteLabelParams(): WhiteLabelParams {
    const { uiConfig } = this.passwordlessParams;
    if (!uiConfig) return {};

    const { appName, appUrl, defaultLanguage, mode, logoLight, logoDark, theme } = uiConfig;
    const finalLogo = (mode === "dark" ? logoDark : logoLight) ?? "";
    return {
      mode: mode ?? "light",
      name: appName ?? "",
      url: appUrl ?? "",
      language: defaultLanguage ?? "en",
      logo: finalLogo.includes(".svg") ? "" : finalLogo,
      theme: theme ?? {},
    };
  }

  set trackingId(value: string | undefined) {
    this.trackingIdentifier = value;
  }

  protected async start(params: CodeInitiateRequestBodyParams): Promise<IStartResponse> {
    try {
      const result = await post<IStartResponse>(`${this.authBaseApiUrl}/passwordless/start`, params);
      if (result && result.success) {
        this.trackingId = result.data?.trackingId;
        if (this.sessionStorageAvailable) window.sessionStorage.setItem("trackingId", this.trackingId as string);
      }
      return result;
    } catch (e: unknown) {
      return this.handleError(e);
    }
  }

  protected async verify(params: CodeVerifyRequestBodyParams): Promise<IVerifyResponse> {
    try {
      const result = await post<{ success: boolean; id_token?: string; message: string }>(`${this.authBaseApiUrl}/passwordless/verify`, params);
      if (result.success) {
        if (this.sessionStorageAvailable) window.sessionStorage.removeItem("trackingId");
        return {
          success: true,
          data: { id_token: result.id_token as string },
        };
      }
      return {
        success: false,
        error: result.message,
      };
    } catch (e: unknown) {
      return this.handleError(e);
    }
  }

  private async handleError(e: unknown): Promise<{ success: boolean; error: string }> {
    let error: string;
    if ((e as Response).status === 429) {
      error = "passwordless.error-too-many-requests";
    } else {
      try {
        const err: { error_code: string; message: string } = await (e as Response).json();
        error = err.error_code ? getErrorMessages(err.error_code) : err.message;
      } catch {
        error = "passwordless.something-wrong-error";
      }
    }
    return {
      success: false,
      error: error,
    };
  }

  abstract sendVerificationCode(params: { captchaToken: string }): Promise<IStartResponse>;

  abstract verifyCode(code: string): Promise<IVerifyResponse>;
}
