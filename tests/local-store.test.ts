import test from "node:test";
import { watch } from "node:fs";
import { lock } from "proper-lockfile";
import { NEXT_DIST_DIR } from "../lib/storage-paths";
import nextConfig from "../next.config";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  readdir,
  mkdir,
  symlink,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { LocalStore } from "../lib/local-store";
import { PortraitService } from "../lib/service";
import { RETENTION_MS } from "../lib/contracts";
async function fixture() {
  return sharp({
    create: { width: 120, height: 150, channels: 3, background: "#487965" },
  })
    .png()
    .toBuffer();
}
async function setup() {
  const directory = await mkdtemp(
      path.join(tmpdir(), "commonlight-persistence-"),
    ),
    root = path.join(directory, "data");
  const store = new LocalStore(root),
    owner = await store.create(),
    service = new PortraitService(store);
  const input = await fixture();
  const portrait = await service.create(
    input,
    { consent: true, name: "", mark: false },
    { token: owner, expiresAt: await store.expiresAt(owner) },
  );
  return {
    directory,
    root,
    store,
    owner,
    service,
    input,
    portrait,
    cleanup: async () => {
      await store.dispose();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
test("private originals, session authority, consented publication and owner controls survive reopening", async () => {
  const t = await setup();
  try {
    const { token } = await t.service.publish(t.portrait.id, t.owner, true);
    const reopened = new LocalStore(t.root);
    assert.equal(await reopened.require(t.owner), t.owner);
    assert.deepEqual(
      (await reopened.owned(t.portrait.id, t.owner)).original,
      t.input,
    );
    assert.deepEqual(await reopened.list(t.owner), [{ ...t.portrait, token }]);
    assert.deepEqual(await reopened.list(await reopened.create()), []);
    await assert.rejects(
      reopened.owned(t.portrait.id, "untrusted"),
      /unavailable/,
    );
    assert.equal((await stat(t.root)).mode & 0o077, 0);
    assert.equal(
      (await stat(path.join(t.root, t.portrait.id, "original.bin"))).mode &
        0o077,
      0,
    );
    await reopened.revoke(t.portrait.id, t.owner);
    await assert.rejects(t.store.published(token), /unavailable/);
    await reopened.delete(t.portrait.id, t.owner);
    assert.equal(await t.store.count(), 0);
    assert.deepEqual(
      (await readdir(t.root)).filter((p) => /^[a-f0-9]{32}$/.test(p)),
      [],
    );
    await reopened.dispose();
  } finally {
    await t.cleanup();
  }
});
test("concurrent independent adapters do not lose session or publication mutations", async () => {
  const t = await setup(),
    other = new LocalStore(t.root);
  try {
    const sessions = await Promise.all(
      Array.from({ length: 8 }, (_, i) => (i % 2 ? t.store : other).create()),
    );
    for (const token of sessions)
      assert.equal(await other.require(token), token);
    const tokens = await Promise.all([
      t.store.publish(t.portrait.id, t.owner),
      other.publish(t.portrait.id, t.owner),
    ]);
    assert.equal(tokens[0], tokens[1]);
    await other.revoke(t.portrait.id, t.owner);
    await assert.rejects(t.store.published(tokens[0]), /unavailable/);
    const renewed = await t.store.publish(t.portrait.id, t.owner);
    assert.notEqual(renewed, tokens[0]);
  } finally {
    await other.dispose();
    await t.cleanup();
  }
});
test("interrupted staging and delete tombstones are not authoritative and are cleaned on reopen", async () => {
  const t = await setup();
  try {
    const staging = path.join(t.root, ".pending-" + "a".repeat(32)),
      deleted = path.join(t.root, ".deleted-" + "b".repeat(32));
    await mkdir(staging, { mode: 0o700 });
    await writeFile(path.join(staging, "original.bin"), t.input, {
      mode: 0o600,
    });
    await mkdir(deleted, { mode: 0o700 });
    await writeFile(path.join(deleted, "original.bin"), t.input, {
      mode: 0o600,
    });
    await writeFile(
      path.join(
        t.root,
        t.portrait.id,
        "metadata.json.pending-" + "c".repeat(16),
      ),
      "partial",
      { mode: 0o600 },
    );
    const reopened = new LocalStore(t.root);
    assert.equal(await reopened.count(), 1);
    assert.ok(!(await readdir(t.root)).includes(path.basename(staging)));
    assert.ok(!(await readdir(t.root)).includes(path.basename(deleted)));
    assert.ok(
      !(await readdir(path.join(t.root, t.portrait.id))).some((n) =>
        n.includes("pending"),
      ),
    );
    await reopened.dispose();
  } finally {
    await t.cleanup();
  }
});
test("corrupt or unsupported authoritative metadata fails closed without rebuilding it", async () => {
  const t = await setup();
  try {
    const file = path.join(t.root, t.portrait.id, "metadata.json"),
      before = await readFile(file, "utf8");
    const record = JSON.parse(before);
    record.version = 2;
    const unsupported = JSON.stringify(record);
    await writeFile(file, unsupported, { mode: 0o600 });
    await assert.rejects(new LocalStore(t.root).count(), /unsupported/);
    assert.equal(await readFile(file, "utf8"), unsupported);
    await writeFile(file, "broken", { mode: 0o600 });
    await assert.rejects(new LocalStore(t.root).list(t.owner));
    assert.equal(await readFile(file, "utf8"), "broken");
    assert.deepEqual(
      await readFile(path.join(t.root, t.portrait.id, "original.bin")),
      t.input,
    );
  } finally {
    await t.cleanup();
  }
});
test("private image symlinks and a public storage root are rejected", async () => {
  const t = await setup();
  try {
    const outside = path.join(t.directory, "not-a-photo");
    await writeFile(outside, "must not disclose", { mode: 0o600 });
    const original = path.join(t.root, t.portrait.id, "original.bin");
    await rm(original);
    await symlink(outside, original);
    await assert.rejects(t.store.owned(t.portrait.id, t.owner));
    assert.throws(
      () => new LocalStore(path.resolve("public", "photos")),
      /cannot overlap/,
    );
  } finally {
    await t.cleanup();
  }
});
test("offline expiry is enforced before disclosure and purged on reopen", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "commonlight-expiry-"));
  let now = Date.now();
  const root = path.join(directory, "data");
  const store = new LocalStore(root, () => now);
  try {
    const owner = await store.create(),
      service = new PortraitService(store, undefined, () => now),
      access = { token: owner, expiresAt: await store.expiresAt(owner) };
    const p = await service.create(
        await fixture(),
        { consent: true, name: "", mark: false },
        access,
      ),
      { token } = await service.publish(p.id, owner, true);
    now += RETENTION_MS;
    const reopened = new LocalStore(root, () => now);
    await assert.rejects(reopened.require(owner), /expired/);
    await assert.rejects(reopened.published(token), /unavailable/);
    assert.equal(await reopened.count(), 0);
    assert.ok(!(await readdir(root)).includes(p.id));
    await reopened.dispose();
  } finally {
    await store.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test("cancellation during private staging removes incomplete files before publication", async () => {
  const t = await setup();
  try {
    const original = await t.store.owned(t.portrait.id, t.owner);
    const id = "e".repeat(32),
      abort = new AbortController();
    const watcher = watch(t.root, (_event, name) => {
      if (name?.startsWith(".pending-")) abort.abort();
    });
    try {
      await assert.rejects(
        t.store.put(
          {
            ...original,
            id,
            owner: t.owner,
            original: Buffer.alloc(10 * 1024 * 1024),
          },
          abort.signal,
        ),
        /cancelled/,
      );
    } finally {
      watcher.close();
    }
    assert.equal(await t.store.count(), 1);
    assert.ok(!(await readdir(t.root)).includes(id));
    assert.ok(!(await readdir(t.root)).some((n) => n.startsWith(".pending-")));
  } finally {
    await t.cleanup();
  }
});

test("storage rejects configured and resolved static/build output roots, including custom distDir", async () => {
  assert.equal(nextConfig.distDir, NEXT_DIST_DIR);
  const directory = await mkdtemp(
    path.join(tmpdir(), "commonlight-served-paths-"),
  );
  const projectRoot = path.join(directory, "app"),
    layout = { projectRoot, distDir: "custom-build" };
  try {
    for (const dir of [
      "public",
      ".next/static",
      "custom-build/static",
      "out",
      ".vercel/output/static",
    ]) {
      assert.throws(
        () =>
          new LocalStore(
            path.join(projectRoot, dir, "private"),
            Date.now,
            layout,
          ),
        /served\/build-output/,
      );
    }
    const target = path.join(projectRoot, "custom-build", "static");
    await mkdir(target, { recursive: true, mode: 0o700 });
    const alias = path.join(directory, "alias");
    await symlink(target, alias);
    const store = new LocalStore(path.join(alias, "private"), Date.now, layout);
    await assert.rejects(store.create(), /served\/build-output/);
    assert.deepEqual(await readdir(path.join(target, "private")), []);
    const privateRoot = path.join(directory, "private");
    await mkdir(privateRoot, { mode: 0o700 });
    await symlink(privateRoot, path.join(projectRoot, "public"));
    await assert.rejects(
      new LocalStore(privateRoot, Date.now, layout).create(),
      /served\/build-output/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("transient maintenance lock failure recovers through a fresh validated transaction", async () => {
  const t = await setup();
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lock(t.root, { realpath: true, retries: 0 });
    await assert.rejects(t.store.maintain(), (error) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ELOCKED",
      ),
    );
    assert.equal(t.store.maintenanceStatus(), "unavailable");
    await release();
    release = undefined;
    assert.equal(await t.store.count(), 1);
    assert.deepEqual(
      (await t.store.owned(t.portrait.id, t.owner)).original,
      t.input,
    );
    await t.store.maintain();
    assert.equal(t.store.maintenanceStatus(), null);
  } finally {
    if (release) await release();
    await t.cleanup();
  }
});

test("maintenance corruption is preserved and revalidated rather than mistaken for transient success", async () => {
  const t = await setup();
  try {
    const file = path.join(t.root, t.portrait.id, "metadata.json"),
      before = await readFile(file, "utf8");
    await writeFile(file, "broken", { mode: 0o600 });
    await assert.rejects(t.store.maintain());
    assert.equal(t.store.maintenanceStatus(), "invalid");
    await assert.rejects(t.store.count());
    assert.equal(await readFile(file, "utf8"), "broken");
    // The test explicitly repairs its own fixture; the adapter never rebuilds corrupt state.
    await writeFile(file, before, { mode: 0o600 });
    await t.store.maintain();
    assert.equal(t.store.maintenanceStatus(), null);
    assert.equal(await t.store.count(), 1);
  } finally {
    await t.cleanup();
  }
});

for (const crossAt of [4, 5])
  test(`publication expiry at clock observation ${crossAt} cannot poison persisted metadata`, async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "commonlight-publish-expiry-"),
    );
    let now = Date.now(),
      armed = false,
      calls = 0,
      deadline = 0;
    const clock = () =>
      armed ? (++calls >= crossAt ? deadline : deadline - 1) : now;
    const store = new LocalStore(path.join(directory, "data"), clock);
    try {
      const owner = await store.create();
      deadline = await store.expiresAt(owner);
      const service = new PortraitService(store, undefined, clock);
      const p = await service.create(
        await fixture(),
        { consent: true, name: "", mark: false },
        { token: owner, expiresAt: deadline },
      );
      const file = path.join(store.root, p.id, "metadata.json"),
        before = await readFile(file, "utf8");
      armed = true;
      await assert.rejects(
        store.publish(p.id, owner),
        /unavailable or expired/,
      );
      assert.equal(calls, crossAt);
      assert.equal(await readFile(file, "utf8"), before);
      assert.ok(
        !(await readdir(path.join(store.root, p.id))).some((name) =>
          name.includes("pending"),
        ),
      );
      armed = false;
      now = deadline;
      assert.equal(await store.count(), 0);
      const fresh = await store.create();
      assert.equal(await store.require(fresh), fresh);
      await store.maintain();
      assert.equal(store.maintenanceStatus(), null);
    } finally {
      await store.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });
