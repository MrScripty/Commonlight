import {
  NEXT_DIST_DIR,
  servedRoots,
  rejectServedLocation,
  rejectResolvedServedLocation,
  type StorageLayout,
} from "./storage-paths";
import { constants } from "node:fs";
import { mkdir, lstat, open, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { lock } from "proper-lockfile";
import {
  AppError,
  MAX_RECORDS,
  RETENTION_MS,
  MAX_UPLOAD_BYTES,
  checkCancelled,
} from "./contracts";
import type {
  Portrait,
  PortraitStore,
  SessionStore,
  PortraitSummary,
} from "./store";
import type { OriginalFormat } from "./processor";
const idPattern = /^[a-f0-9]{32}$/;
const tokenPattern = /^[a-f0-9]{64}$/;
const publicPattern = /^[a-f0-9]{48}$/;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Metadata = {
  version: 1;
  id: string;
  ownerHash: string;
  originalFormat: OriginalFormat;
  expiresAt: number;
  publicToken?: string;
  sharedAt?: number;
};
function invalid(): never {
  throw new AppError(
    503,
    "invalid",
    "Private storage is invalid. Preserve it for inspection; no fallback was used.",
  );
}
function missing(): never {
  throw new AppError(404, "not_found", "Portrait unavailable or expired.");
}
function metadata(value: unknown, id: string): Metadata {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid();
  const v = value as Record<string, unknown>;
  if (v.version !== 1)
    throw new AppError(
      503,
      "unsupported",
      "Private storage version is unsupported.",
    );
  if (
    Object.keys(v).some(
      (k) =>
        ![
          "version",
          "id",
          "ownerHash",
          "originalFormat",
          "expiresAt",
          "publicToken",
          "sharedAt",
        ].includes(k),
    ) ||
    v.id !== id ||
    !idPattern.test(id) ||
    typeof v.ownerHash !== "string" ||
    !tokenPattern.test(v.ownerHash) ||
    !["jpeg", "png", "webp"].includes(String(v.originalFormat)) ||
    typeof v.expiresAt !== "number" ||
    !Number.isSafeInteger(v.expiresAt) ||
    v.expiresAt <= 0 ||
    (v.publicToken !== undefined &&
      (typeof v.publicToken !== "string" ||
        !publicPattern.test(v.publicToken) ||
        typeof v.sharedAt !== "number" ||
        !Number.isSafeInteger(v.sharedAt) ||
        v.sharedAt >= v.expiresAt)) ||
    (v.publicToken === undefined && v.sharedAt !== undefined)
  )
    return invalid();
  return v as Metadata;
}
/** Single-machine private persistence. All authoritative changes hold the filesystem lock. */
export class LocalStore implements PortraitStore, SessionStore {
  readonly root: string;
  private timer?: ReturnType<typeof setInterval>;
  private maintenance?: Promise<void>;
  private maintenanceFailure?: "invalid" | "unavailable";
  private readonly excludedRoots: string[];
  constructor(
    root = path.resolve(process.cwd(), ".local-data"),
    private now = Date.now,
    layout: StorageLayout = {
      projectRoot: process.cwd(),
      distDir: NEXT_DIST_DIR,
    },
  ) {
    this.root = path.resolve(root);
    this.excludedRoots = servedRoots(layout);
    rejectServedLocation(this.root, this.excludedRoots);
  }
  private async read(file: string, maximum: number) {
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maximum || (stat.mode & 0o077) !== 0)
        return invalid();
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }
  private async syncDirectory(directory: string) {
    const handle = await open(directory, constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  private async write(
    file: string,
    data: Buffer | string,
    beforeCommit?: () => void,
  ) {
    const temporary = `${file}.pending-${randomBytes(8).toString("hex")}`;
    try {
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      beforeCommit?.();
      await rename(temporary, file);
      await this.syncDirectory(path.dirname(file));
    } finally {
      await rm(temporary, { force: true });
    }
  }
  private async writeMetadata(
    value: Metadata,
    directory = path.join(this.root, value.id),
  ) {
    const valid = metadata(value, value.id);
    await this.write(
      path.join(directory, "metadata.json"),
      JSON.stringify(valid),
      () => {
        if (valid.publicToken && this.now() >= valid.expiresAt)
          return missing();
      },
    );
  }

  private async transaction<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.root);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0
    )
      return invalid();
    await rejectResolvedServedLocation(this.root, this.excludedRoots);
    const release = await lock(this.root, {
      realpath: true,
      stale: 10_000,
      update: 2000,
      retries: { retries: 10, minTimeout: 25, maxTimeout: 250 },
    });
    try {
      await this.clean();
      return await operation();
    } finally {
      await release();
    }
  }
  private async clean() {
    const sessions = await this.sessions();
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      const full = path.join(this.root, entry.name);
      if (
        /^\.(pending|deleted)-[a-f0-9]{32}$/.test(entry.name) ||
        /^sessions.json.pending-[a-f0-9]{16}$/.test(entry.name)
      ) {
        await rm(full, { recursive: true, force: true });
        continue;
      }
      if (entry.name === "sessions.json" && entry.isFile()) continue;
      if (
        !idPattern.test(entry.name) ||
        !entry.isDirectory() ||
        entry.isSymbolicLink()
      )
        return invalid();
      const m = await this.meta(entry.name);
      if (m.expiresAt <= this.now()) await this.remove(entry.name);
      else if (!sessions[m.ownerHash] || m.expiresAt > sessions[m.ownerHash])
        return invalid();
      else
        for (const name of await readdir(full))
          if (/^metadata.json.pending-[a-f0-9]{16}$/.test(name))
            await rm(path.join(full, name));
    }
  }
  private async meta(id: string) {
    return metadata(
      JSON.parse(
        (
          await this.read(path.join(this.root, id, "metadata.json"), 2048)
        ).toString(),
      ),
      id,
    );
  }
  private async all() {
    const ids = (await readdir(this.root)).filter((n) => idPattern.test(n));
    const records = await Promise.all(ids.map((id) => this.meta(id)));
    const tokens = records.flatMap((m) =>
      m.publicToken ? [m.publicToken] : [],
    );
    if (new Set(tokens).size !== tokens.length) return invalid();
    return records;
  }
  private async authorized(id: string, owner: string) {
    if (!idPattern.test(id)) return missing();
    const record = (await this.all()).find(
      (m) => m.id === id && m.ownerHash === hash(owner),
    );
    if (!record || record.expiresAt <= this.now()) return missing();
    return record;
  }
  private async images(m: Metadata): Promise<Portrait> {
    const directory = path.join(this.root, m.id);
    const [original, preview, processed] = await Promise.all([
      this.read(path.join(directory, "original.bin"), MAX_UPLOAD_BYTES),
      this.read(path.join(directory, "preview.jpg"), 128 * 1024 * 1024),
      this.read(path.join(directory, "processed.jpg"), 4 * 1024 * 1024),
    ]);
    return {
      id: m.id,
      owner: m.ownerHash,
      originalFormat: m.originalFormat,
      expiresAt: m.expiresAt,
      publicToken: m.publicToken,
      original,
      preview,
      processed,
    };
  }
  private async remove(id: string) {
    const tombstone = path.join(
      this.root,
      `.deleted-${randomBytes(16).toString("hex")}`,
    );
    await rename(path.join(this.root, id), tombstone);
    await this.syncDirectory(this.root);
    await rm(tombstone, { recursive: true });
  }
  async count() {
    return this.transaction(async () => (await this.all()).length);
  }
  async list(owner: string): Promise<PortraitSummary[]> {
    return this.transaction(async () =>
      (await this.all())
        .filter((m) => m.ownerHash === hash(owner))
        .map((m) => ({
          id: m.id,
          expiresAt: new Date(m.expiresAt).toISOString(),
          ...(m.publicToken ? { token: m.publicToken } : {}),
        })),
    );
  }
  async put(p: Portrait, signal?: AbortSignal) {
    await this.transaction(async () => {
      checkCancelled(signal);
      if ((await this.all()).length >= MAX_RECORDS)
        throw new AppError(
          503,
          "unavailable",
          "The local studio is full. Delete an earlier portrait.",
        );
      if (!idPattern.test(p.id) || p.expiresAt <= this.now())
        throw new AppError(
          409,
          "cancelled",
          "The portrait expired before storage completed.",
        );
      const until = (await this.sessions())[hash(p.owner)];
      if (!until || p.expiresAt > until) return invalid();
      const stage = path.join(
        this.root,
        `.pending-${randomBytes(16).toString("hex")}`,
      );
      await mkdir(stage, { mode: 0o700 });
      try {
        await this.write(path.join(stage, "original.bin"), p.original);
        await this.write(path.join(stage, "preview.jpg"), p.preview);
        await this.write(path.join(stage, "processed.jpg"), p.processed);
        const m: Metadata = {
          version: 1,
          id: p.id,
          ownerHash: hash(p.owner),
          originalFormat: p.originalFormat,
          expiresAt: p.expiresAt,
        };
        await this.writeMetadata(m, stage);
        if (p.expiresAt <= this.now())
          throw new AppError(
            409,
            "cancelled",
            "The portrait expired before storage completed.",
          );
        checkCancelled(signal);
        await rename(stage, path.join(this.root, p.id));
        await this.syncDirectory(this.root);
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    });
  }
  async owned(id: string, owner: string) {
    return this.transaction(async () =>
      this.images(await this.authorized(id, owner)),
    );
  }
  async published(token: string) {
    return this.transaction(async () => {
      if (!publicPattern.test(token)) return missing();
      const m = (await this.all()).find((m) => m.publicToken === token);
      if (!m) return missing();
      return this.images(m);
    });
  }
  async publish(id: string, owner: string) {
    return this.transaction(async () => {
      const m = await this.authorized(id, owner);
      if (!m.publicToken) {
        const sharedAt = this.now();
        if (sharedAt >= m.expiresAt) return missing();
        const published = {
          ...m,
          publicToken: randomBytes(24).toString("hex"),
          sharedAt,
        };
        await this.writeMetadata(published);
        return published.publicToken;
      }
      if (this.now() >= m.expiresAt) return missing();
      return m.publicToken;
    });
  }
  async revoke(id: string, owner: string) {
    await this.transaction(async () => {
      const m = await this.authorized(id, owner);
      delete m.publicToken;
      delete m.sharedAt;
      await this.writeMetadata(m);
    });
  }
  async delete(id: string, owner: string) {
    await this.transaction(async () => {
      await this.authorized(id, owner);
      await this.remove(id);
    });
  }
  private async sessions(): Promise<Record<string, number>> {
    let data: unknown;
    try {
      data = JSON.parse(
        (
          await this.read(path.join(this.root, "sessions.json"), 16 * 1024)
        ).toString(),
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return {};
      throw error;
    }
    if (
      !data ||
      typeof data !== "object" ||
      !("version" in data) ||
      data.version !== 1 ||
      !("entries" in data) ||
      !data.entries ||
      typeof data.entries !== "object" ||
      Array.isArray(data.entries)
    )
      return invalid();
    const entries = data.entries as Record<string, unknown>;
    if (
      Object.keys(entries).length > 64 ||
      Object.entries(entries).some(
        ([key, value]) =>
          !tokenPattern.test(key) ||
          typeof value !== "number" ||
          !Number.isSafeInteger(value),
      )
    )
      return invalid();
    return Object.fromEntries(
      Object.entries(entries).filter(
        ([, until]) => (until as number) > this.now(),
      ),
    ) as Record<string, number>;
  }
  async create() {
    return this.transaction(async () => {
      const entries = await this.sessions();
      if (Object.keys(entries).length >= 64)
        throw new AppError(503, "unavailable", "Session capacity reached.");
      const token = randomBytes(32).toString("hex");
      entries[hash(token)] = this.now() + RETENTION_MS;
      await this.write(
        path.join(this.root, "sessions.json"),
        JSON.stringify({ version: 1, entries }),
      );
      return token;
    });
  }
  async expiresAt(token: string) {
    return this.transaction(async () => {
      const until = (await this.sessions())[hash(token)];
      if (!until || until <= this.now())
        throw new AppError(
          401,
          "unavailable",
          "Your private session expired. Reload to start again.",
        );
      return until;
    });
  }
  async require(token?: string) {
    if (!token || !tokenPattern.test(token))
      throw new AppError(
        401,
        "unavailable",
        "Your private session expired. Reload to start again.",
      );
    await this.expiresAt(token);
    return token;
  }
  maintenanceStatus() {
    return this.maintenanceFailure ?? null;
  }
  async maintain() {
    try {
      await this.transaction(async () => {});
      this.maintenanceFailure = undefined;
    } catch (error) {
      this.maintenanceFailure =
        error instanceof SyntaxError ||
        (error instanceof AppError &&
          (error.code === "invalid" || error.code === "unsupported"))
          ? "invalid"
          : "unavailable";
      throw error;
    }
  }
  startMaintenance() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.maintenance)
        this.maintenance = this.maintain()
          .catch(() => {
            /* Failure is recorded; the next operation must validate storage again. */
          })
          .finally(() => {
            this.maintenance = undefined;
          });
    }, 60_000);
    this.timer.unref();
  }
  async dispose() {
    clearInterval(this.timer);
    await this.maintenance;
  }
}
