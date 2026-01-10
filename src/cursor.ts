import { spawn } from "child_process";
import type { CursorResponse } from "./types.js";

function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [cursor] ${message}`);
}

/**
 * Create a new Cursor chat for a workspace
 */
export async function createChat(workspace: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["agent", "create-chat", "--workspace", workspace];
    log(`Creating chat: cursor ${args.join(" ")}`);

    const proc = spawn("cursor", args);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => (stdout += data.toString()));
    proc.stderr.on("data", (data) => (stderr += data.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to create chat: ${stderr || "Unknown error"}`));
        return;
      }
      const chatId = stdout.trim();
      if (!chatId) {
        reject(new Error("Cursor returned empty chat ID"));
        return;
      }
      log(`Chat created: ${chatId}`);
      resolve(chatId);
    });

    proc.on("error", (err) => reject(new Error(`Spawn failed: ${err.message}`)));
  });
}

const RETRYABLE_PATTERNS = [
  /resource_exhausted/i,
  /rate.?limit/i,
  /too many requests/i,
  /service unavailable/i,
  /timeout/i,
];

function isRetryable(text: string): boolean {
  return RETRYABLE_PATTERNS.some((p) => p.test(text));
}

/**
 * Send a prompt to Cursor and get response
 */
function sendPromptOnce(chatId: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["agent", "--resume", chatId, "-p", "--output-format", "json", `"${prompt}"`];
    
    log(`Sending prompt to ${chatId.substring(0, 8)}...`);
    const startTime = Date.now();

    const proc = spawn("cursor", args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    const TIMEOUT_MS = 5 * 60 * 1000;
    const timeout = setTimeout(() => {
      log(`Timeout after ${TIMEOUT_MS / 1000}s`);
      proc.kill("SIGTERM");
    }, TIMEOUT_MS);

    proc.stdout.on("data", (data) => (stdout += data.toString()));
    proc.stderr.on("data", (data) => (stderr += data.toString()));

    proc.on("close", (code) => {
      clearTimeout(timeout);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log(`Completed in ${elapsed}s (exit: ${code})`);

      const output = stdout.trim();

      // Check for errors in output
      if (output.toLowerCase().includes("error") && !output.startsWith("{")) {
        const err = new Error(output);
        (err as any).retryable = isRetryable(output + stderr);
        reject(err);
        return;
      }

      if (code !== 0) {
        const msg = stderr || stdout || "Unknown error";
        const err = new Error(msg);
        (err as any).retryable = isRetryable(msg);
        reject(err);
        return;
      }

      try {
        const response = JSON.parse(output) as CursorResponse;
        if (response.is_error) {
          reject(new Error(response.result));
          return;
        }
        resolve(response.result);
      } catch {
        if (output) {
          resolve(output);
        } else {
          reject(new Error("Empty response from Cursor"));
        }
      }
    });

    proc.on("error", (err) => reject(new Error(`Spawn failed: ${err.message}`)));
  });
}

/**
 * Send a prompt with retry logic for transient errors
 */
export async function sendPrompt(
  chatId: string,
  _workspace: string,
  prompt: string,
  maxRetries = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      log(`Retry ${attempt}/${maxRetries} after ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      return await sendPromptOnce(chatId, prompt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const retryable = (lastError as any).retryable === true;

      if (!retryable || attempt >= maxRetries) {
        throw lastError;
      }
      log(`Retryable error: ${lastError.message}`);
    }
  }

  throw lastError || new Error("Failed after retries");
}
