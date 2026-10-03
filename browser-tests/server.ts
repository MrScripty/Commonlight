import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
export class TestServer {
  private child?: ChildProcess;
  private exit?: Promise<void>;
  private directory?: string;
  private logs = "";
  private ready = false;
  constructor(private port = 0) {}
  get url() {
    if (!this.child || !this.ready) throw new Error("Test server is not ready");
    return `http://127.0.0.1:${this.port}`;
  }
  async start() {
    if (this.child) throw new Error("Test server already started");
    this.directory ??= await mkdtemp(
      path.join(tmpdir(), "commonlight-browser-"),
    );
    this.logs = "";
    this.ready = false;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "browser-tests/server-child.ts", String(this.port)],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          COMMONLIGHT_DATA_DIR: path.join(this.directory, "data"),
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    this.child = child;
    child.stdout?.on("data", (chunk) => {
      this.logs = (this.logs + String(chunk)).slice(-10000);
    });
    child.stderr?.on("data", (chunk) => {
      this.logs = (this.logs + String(chunk)).slice(-10000);
    });
    this.exit = new Promise((resolve) =>
      child.once("close", () => {
        this.ready = false;
        resolve();
      }),
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            finish(new Error(`Test server did not become ready: ${this.logs}`)),
          20_000,
        );
        const finish = (error?: Error) => {
          clearTimeout(timer);
          child.off("error", onError);
          child.off("exit", onExit);
          child.off("message", onMessage);
          if (error) reject(error);
          else resolve();
        };
        const onError = (error: Error) => finish(error);
        const onExit = () =>
          finish(new Error(`Test server exited: ${this.logs}`));
        const onMessage = (message: unknown) => {
          if (
            typeof message !== "object" ||
            message === null ||
            !("port" in message) ||
            !("ready" in message) ||
            message.ready !== true
          )
            return;
          const port = message.port;
          if (
            typeof port !== "number" ||
            !Number.isInteger(port) ||
            port < 1 ||
            port > 65535 ||
            (this.port !== 0 && port !== this.port)
          ) {
            finish(new Error("Invalid owned-server readiness"));
            return;
          }
          this.port = port;
          this.ready = true;
          finish();
        };
        child.once("error", onError);
        child.once("exit", onExit);
        child.on("message", onMessage);
      });
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  async stop() {
    this.ready = false;
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
