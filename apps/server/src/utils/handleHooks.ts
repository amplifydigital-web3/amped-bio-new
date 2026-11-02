import { APIError } from "better-auth";
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH, HANDLE_REGEX, handleKey } from "@repo/constants";
import { matchReserved } from "../services/reservedHandles";

/**
 * Reserved handles (Build Board D2, docs/features/reserved-handles.md, 4.4 and
 * 4.8). Better Auth runs in both apps/server and apps/auth-server; both call
 * these hooks so the two cannot drift.
 */

// The register form maps "reserved" to its Reserved line and anything else
// with "handle" to its taken line
const RESERVED_MESSAGE = "This handle is reserved";
const INVALID_MESSAGE = "This handle is not valid";

/**
 * Sign up: a handle the person sent is checked for format, length and the
 * reserved list before the account is made. A direct API call can no longer
 * set any string. Returns the stored form (lowercase), or undefined when no
 * handle was sent.
 */
export async function checkSignUpHandle(raw: unknown): Promise<string | undefined> {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") {
    throw new APIError("BAD_REQUEST", { code: "INVALID_HANDLE", message: INVALID_MESSAGE });
  }
  const handle = handleKey(raw);
  if (
    handle.length < HANDLE_MIN_LENGTH ||
    handle.length > HANDLE_MAX_LENGTH ||
    !HANDLE_REGEX.test(handle)
  ) {
    throw new APIError("BAD_REQUEST", { code: "INVALID_HANDLE", message: INVALID_MESSAGE });
  }
  if ((await matchReserved(handle)).reserved) {
    throw new APIError("BAD_REQUEST", { code: "INVALID_HANDLE", message: RESERVED_MESSAGE });
  }
  return handle;
}

/**
 * Update user: Better Auth's /update-user accepts additional fields that allow
 * input, and `handle` must allow input for sign up. A handle change goes
 * through handle.redeem only, so any update that carries a handle is refused.
 */
export function refuseHandleUpdate(data: unknown): void {
  if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "handle")) {
    throw new APIError("BAD_REQUEST", {
      code: "INVALID_HANDLE",
      message: "Change your handle from Public URL in the editor",
    });
  }
}
