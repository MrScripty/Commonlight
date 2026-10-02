import { randomBytes } from "node:crypto";
import { AppError, RETENTION_MS, MAX_RECORDS } from "./contracts";
import type { PortraitImages } from "./processor";
export type OwnerAuthority = { token: string; expiresAt: number };
export type Portrait = PortraitImages & {
  id: string;
  owner: string;
  expiresAt: number;
  publicToken?: string;
};
export interface PortraitStore {
  count(): number;
  put(portrait: Portrait): void;
  owned(id: string, owner: string): Portrait;
  published(token: string): Portrait;
  publish(id: string, owner: string): string;
  revoke(id: string, owner: string): void;
  delete(id: string, owner: string): void;
}
export class MemoryStore implements PortraitStore {
  private readonly records = new Map<string, Portrait>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private readonly now = Date.now) {}
  private remove(id: string) {
    this.records.delete(id);
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }
  private sweep() {
    for (const p of this.records.values())
      if (p.expiresAt <= this.now()) this.remove(p.id);
  }
  count() {
    this.sweep();
    return this.records.size;
  }
  put(portrait: Portrait) {
    if (this.count() >= MAX_RECORDS)
      throw new AppError(
        503,
        "unavailable",
        "The local studio is full. Delete an earlier portrait and try again.",
      );
    this.records.set(portrait.id, portrait);
    const timer = setTimeout(
      () => this.remove(portrait.id),
      Math.max(0, portrait.expiresAt - this.now()),
    );
    timer.unref();
    this.timers.set(portrait.id, timer);
  }
  owned(id: string, owner: string) {
    this.sweep();
    const p = this.records.get(id);
    if (!p || p.owner !== owner)
      throw new AppError(404, "not_found", "Portrait unavailable or expired.");
    return p;
  }
  published(token: string) {
    this.sweep();
    const p = [...this.records.values()].find((p) => p.publicToken === token);
    if (!p)
      throw new AppError(
        404,
        "not_found",
        "This portrait is private, expired or no longer shared.",
      );
    return p;
  }
  publish(id: string, owner: string) {
    const p = this.owned(id, owner);
    return (p.publicToken ??= randomBytes(24).toString("hex"));
  }
  revoke(id: string, owner: string) {
    delete this.owned(id, owner).publicToken;
  }
  delete(id: string, owner: string) {
    this.owned(id, owner);
    this.remove(id);
  }
  dispose() {
    for (const id of this.records.keys()) this.remove(id);
  }
}
export class Sessions {
  private readonly sessions = new Map<string, number>();
  constructor(private readonly now = Date.now) {}
  create() {
    for (const [id, until] of this.sessions)
      if (until <= this.now()) this.sessions.delete(id);
    if (this.sessions.size >= 64)
      throw new AppError(
        503,
        "unavailable",
        "Session capacity reached. Try again later.",
      );
    const token = randomBytes(32).toString("hex");
    this.sessions.set(token, this.now() + RETENTION_MS);
    return token;
  }
  expiresAt(token: string) {
    this.require(token);
    return this.sessions.get(token)!;
  }
  require(token?: string) {
    if (!token || (this.sessions.get(token) ?? 0) <= this.now())
      throw new AppError(
        401,
        "unavailable",
        "Your private session expired. Reload to start again.",
      );
    return token;
  }
}
