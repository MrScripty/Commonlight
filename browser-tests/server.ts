import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
export class TestServer {
  private child?: ChildProcess;
  private exit?: Promise<void>;
  private directory?: string;
  private logs = "";
  async start() {
    this.directory ??= await mkdtemp(
      path.join(tmpdir(), "commonlight-browser-"),
    );
    this.child = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3100",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          COMMONLIGHT_DATA_DIR: path.join(this.directory, "data"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    this.child.stdout?.on("data", (chunk) => {
      this.logs = (this.logs + String(chunk)).slice(-10000);
    });
    this.child.stderr?.on("data", (chunk) => {
      this.logs = (this.logs + String(chunk)).slice(-10000);
    });
    this.exit = new Promise((resolve) => {
      this.child!.once("exit", () => resolve());
    });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (this.child.exitCode !== null)
        throw new Error(`Test server exited: ${this.logs}`);
      try {
        if (
          (
            await fetch("http://127.0.0.1:3100", {
              signal: AbortSignal.timeout(1000),
            })
          ).ok
        )
          return;
      } catch {
        /* Wait for this owned server to become ready. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Test server did not become ready: ${this.logs}`);
  }
  async stop() {
    if (!this.child || !this.exit) return;
    this.child.kill("SIGTERM");
    const timer = setTimeout(() => this.child?.kill("SIGKILL"), 10_000);
    try {
      await this.exit;
    } finally {
      clearTimeout(timer);
      this.child = undefined;
      this.exit = undefined;
    }
  }
  async restart() {
    await this.stop();
    await this.start();
  }
  async dispose() {
    await this.stop();
    if (this.directory)
      await rm(this.directory, { recursive: true, force: true });
  }
}
