/**
 * Runs a command line tool with a hard timeout. Output is capped so a noisy tool
 * cannot exhaust memory. Never runs through a shell: arguments are passed as is.
 */
import { spawn } from "node:child_process";

const OUTPUT_CAP = 1024 * 1024;

export class ToolError extends Error {
  constructor(tool, code, stderr) {
    super(`${tool} exited ${code}: ${stderr.slice(0, 500)}`);
    this.name = "ToolError";
    this.tool = tool;
    this.code = code;
    this.stderr = stderr;
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ timeoutMs?: number, okCodes?: number[], onStdout?: (chunk: Buffer) => void }} [options]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function run(command, args, options = {}) {
  const { timeoutMs = 120_000, okCodes = [0], onStdout } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", chunk => {
      if (onStdout) onStdout(chunk);
      else if (stdout.length < OUTPUT_CAP) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", chunk => {
      if (stderr.length < OUTPUT_CAP) stderr += chunk.toString("utf8");
    });
    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const exit = code ?? (signal ? 137 : 1);
      if (okCodes.includes(exit)) resolve({ code: exit, stdout, stderr });
      else reject(new ToolError(command, exit, stderr || (signal ? `killed by ${signal}` : "")));
    });
  });
}
