/**
 * A problem with the file itself: unreadable, unsupported, over a limit. The
 * Worker reports it as a failed step and does not retry. Every other error is
 * treated as transient and retried by the Queue.
 */
export class ContentError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "ContentError";
    this.reason = reason;
  }
}
