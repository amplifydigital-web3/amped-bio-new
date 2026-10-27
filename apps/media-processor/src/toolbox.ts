/**
 * Calls into the media toolbox container (container/src/server.mjs). One JSON
 * request per step. Items are spread over a small pool of named instances; each
 * instance runs one job at a time and sleeps after 10 idle minutes.
 */

export type ToolboxPath = "/scan" | "/image" | "/audio" | "/document";

export interface ToolboxRequest {
  publicId: string;
  grant: string;
  source: string;
  ext?: string;
  mimeType?: string;
  derivedPrefix?: string;
  audioPrefix?: string;
  originalKey?: string;
  previewSeconds?: number | null;
  mode?: "item" | "poster";
}

/** `ok: false` means the file itself was refused. Never retried. */
export type ToolboxResult = { ok: false; reason: string } | ({ ok: true } & Record<string, any>);

export interface Toolbox {
  call(path: ToolboxPath, request: ToolboxRequest): Promise<ToolboxResult>;
}

/** Thrown on a container error, so the Queue retries the message. */
export class ToolboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolboxError";
  }
}

export function poolInstance(publicId: string, poolSize: number): string {
  let hash = 0;
  for (const char of publicId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `pool-${hash % Math.max(1, poolSize)}`;
}

export function createContainerToolbox(env: Env): Toolbox {
  const poolSize = Number.parseInt(env.CONTAINER_POOL_SIZE, 10) || 1;
  return {
    async call(path, request) {
      const stub = env.PROCESSOR.getByName(poolInstance(request.publicId, poolSize));
      const response = await stub.fetch(`http://toolbox${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (response.status !== 200) {
        throw new ToolboxError(`toolbox ${path} ${response.status}`);
      }
      return (await response.json()) as ToolboxResult;
    },
  };
}
