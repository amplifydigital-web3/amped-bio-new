import { DurableObject } from "cloudflare:workers";

/**
 * Single use downloads (spec 3.6). One object per token id (`j`). The first claim
 * wins and later claims are refused. KV is eventually consistent, so it cannot do
 * this; a Durable Object runs one request at a time per id.
 *
 * The record is deleted by an alarm a minute after the token expires. After that
 * the token is refused for being expired, so nothing else needs to remember it.
 */
export class DownloadClaims extends DurableObject<Env> {
  /** True the first time, false after. `expiresAt` is the token's exp, unix seconds. */
  async claim(expiresAt: number): Promise<boolean> {
    if (await this.ctx.storage.get<number>("claimedAt")) return false;
    await this.ctx.storage.put("claimedAt", Date.now());
    await this.ctx.storage.setAlarm(expiresAt * 1000 + 60_000);
    return true;
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
