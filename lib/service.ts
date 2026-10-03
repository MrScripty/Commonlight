import { LocalStore } from "./local-store";
import { randomBytes } from "node:crypto";
import {
  AppError,
  MAX_ACTIVE,
  MAX_RECORDS,
  RETENTION_MS,
  checkCancelled,
  decodeOptions,
} from "./contracts";
import { DeterministicProcessor, type PortraitProcessor } from "./processor";
import {
  MemoryStore,
  type PortraitStore,
  type SessionStore,
  type OwnerAuthority,
} from "./store";
export class PortraitService {
  private active = 0;
  constructor(
    readonly store: PortraitStore = new MemoryStore(),
    private processor: PortraitProcessor = new DeterministicProcessor(),
    private now = Date.now,
  ) {}
  async create(
    input: Buffer | (() => Promise<Buffer>),
    rawOptions: unknown,
    owner: OwnerAuthority,
    signal?: AbortSignal,
  ) {
    const options = decodeOptions(rawOptions);
    checkCancelled(signal);
    if (this.active >= MAX_ACTIVE)
      throw new AppError(
        503,
        "unavailable",
        "The studio is busy. Try again shortly.",
      );
    if (owner.expiresAt <= this.now())
      throw new AppError(
        401,
        "unavailable",
        "Your private session expired. Reload to start again.",
      );
    this.active++;
    try {
      if ((await this.store.count()) + this.active > MAX_RECORDS)
        throw new AppError(503, "unavailable", "The studio is full.");
      const bytes = typeof input === "function" ? await input() : input;
      checkCancelled(signal);
      const images = await this.processor.process(bytes, options, signal);
      checkCancelled(signal);
      const id = randomBytes(16).toString("hex");
      const expiresAt = Math.min(this.now() + RETENTION_MS, owner.expiresAt);
      if (expiresAt <= this.now())
        throw new AppError(
          401,
          "unavailable",
          "Your private session expired during processing.",
        );
      await this.store.put(
        { id, owner: owner.token, ...images, expiresAt },
        signal,
      );
      return { id, expiresAt: new Date(expiresAt).toISOString() };
    } finally {
      this.active--;
    }
  }
  async publish(id: string, owner: string, consent: unknown) {
    if (consent !== true)
      throw new AppError(
        400,
        "invalid",
        "The subject must explicitly consent to sharing this portrait by link.",
      );
    return { token: await this.store.publish(id, owner) };
  }
}
// Process-global lifetime survives route module loading in the local Next server.
// Admission remains single-server; storage mutations are separately filesystem-locked.
const globalState = globalThis as typeof globalThis & {
  commonlight?: { service: PortraitService; sessions: SessionStore };
};
function localState() {
  const store = new LocalStore(process.env.COMMONLIGHT_DATA_DIR);
  store.startMaintenance();
  return { service: new PortraitService(store), sessions: store };
}
export const state = (globalState.commonlight ??= localState());
