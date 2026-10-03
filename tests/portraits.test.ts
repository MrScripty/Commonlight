import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { PortraitService } from "../lib/service";
import { MemoryStore, Sessions } from "../lib/store";
import { DeterministicProcessor } from "../lib/processor";
import {
  MAX_UPLOAD_BYTES,
  RETENTION_MS,
  decodeOptions,
  decodeResult,
  decodePublication,
} from "../lib/contracts";
import { CameraController } from "../lib/camera";
const authority = (token: string) => ({
  token,
  expiresAt: Date.now() + RETENTION_MS,
});
const options = { consent: true as const, name: "", mark: false };
async function fixture() {
  return sharp({
    create: { width: 800, height: 1000, channels: 3, background: "#678f99" },
  })
    .png()
    .withMetadata({ exif: { IFD0: { Artist: "Synthetic fixture only" } } })
    .toBuffer();
}
test("output is metadata-free JPEG8, sRGB and exactly 576 × 720; clean preview retains frame and exact original survives", async () => {
  const input = await fixture();
  const processor = new DeterministicProcessor();
  const output = await processor.process(input, options);
  const metadata = await sharp(output.processed).metadata(),
    original = await sharp(output.preview).metadata();
  assert.deepEqual(output.original, input);
  assert.equal(output.originalFormat, "png");
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 576);
  assert.equal(metadata.height, 720);
  assert.equal(metadata.depth, "uchar");
  assert.equal(metadata.space, "srgb");
  for (const m of [metadata, original]) {
    assert.equal(m.exif, undefined);
    assert.equal(m.icc, undefined);
    assert.equal(m.xmp, undefined);
  }
  assert.equal(original.width, 800);
  assert.equal(original.height, 1000);
  assert.deepEqual(
    output.processed,
    (await processor.process(input, options)).processed,
  );
});
test("validates consent, size, supported image formats and names before processing", async () => {
  const service = new PortraitService();
  await assert.rejects(
    service.create(
      await fixture(),
      { ...options, consent: false },
      authority("owner"),
    ),
    /Consent/,
  );
  await assert.rejects(
    service.create(
      Buffer.alloc(MAX_UPLOAD_BYTES + 1),
      options,
      authority("owner"),
    ),
    /10 MB/,
  );
  await assert.rejects(
    service.create(Buffer.from("<svg/>"), options, authority("owner")),
    /still JPEG/,
  );
  assert.throws(() => decodeOptions({ ...options, name: "x".repeat(61) }));
  assert.throws(() => decodeOptions({ ...options, extra: "unexpected" }));
  assert.throws(() => decodeOptions({ ...options, name: "bad\nname" }));
});
test("optional SVG text is safely escaped and output remains bounded", async () => {
  const result = await new DeterministicProcessor().process(await fixture(), {
    ...options,
    name: '<script>&" test',
    mark: true,
  });
  assert.equal((await sharp(result.processed).metadata()).height, 720);
});
test("only owner reads originals; explicit sharing grants processed-only token; revoke rotates", async () => {
  const store = new MemoryStore();
  const service = new PortraitService(store);
  try {
    const p = await service.create(
      await fixture(),
      options,
      authority("owner"),
    );
    assert.throws(() => store.owned(p.id, "other"), /unavailable/);
    assert.throws(() => store.published(p.id), /private/);
    await assert.rejects(service.publish(p.id, "owner", false), /consent/);
    const { token } = await service.publish(p.id, "owner", true);
    assert.notEqual(token, p.id);
    assert.notEqual(token, "owner");
    assert.deepEqual(
      store.published(token).processed,
      store.owned(p.id, "owner").processed,
    );
    store.revoke(p.id, "owner");
    assert.throws(() => store.published(token));
    assert.notEqual((await service.publish(p.id, "owner", true)).token, token);
    store.delete(p.id, "owner");
    assert.equal(store.count(), 0);
    assert.throws(() => store.owned(p.id, "owner"));
  } finally {
    store.dispose();
  }
});
test("expired private and public images are unavailable and deleted", async () => {
  let now = Date.now();
  const store = new MemoryStore(() => now),
    service = new PortraitService(store, undefined, () => now);
  try {
    const p = await service.create(
      await fixture(),
      options,
      authority("owner"),
    );
    const { token } = await service.publish(p.id, "owner", true);
    now += RETENTION_MS + 1;
    assert.throws(() => store.owned(p.id, "owner"));
    assert.throws(() => store.published(token));
    assert.equal(store.count(), 0);
  } finally {
    store.dispose();
  }
});
test("cancellation after processing never retains a result; capacity is recovered", async () => {
  const abort = new AbortController(),
    store = new MemoryStore();
  const service = new PortraitService(store, {
    process: async () => {
      abort.abort();
      return {
        original: Buffer.alloc(1),
        originalFormat: "jpeg",
        preview: Buffer.alloc(1),
        processed: Buffer.alloc(1),
      };
    },
  });
  await assert.rejects(
    service.create(Buffer.alloc(1), options, authority("owner"), abort.signal),
    /cancelled/,
  );
  assert.equal(store.count(), 0);
  store.dispose();
});
test("active processing concurrency is bounded and failures release reservation", async () => {
  const store = new MemoryStore();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = new PortraitService(store, {
    process: async () => {
      await gate;
      throw new Error("processor unavailable");
    },
  });
  const one = service.create(Buffer.alloc(1), options, authority("one")),
    two = service.create(Buffer.alloc(1), options, authority("two"));
  await assert.rejects(
    service.create(Buffer.alloc(1), options, authority("three")),
    /busy/,
  );
  release();
  await Promise.all([assert.rejects(one), assert.rejects(two)]);
  await assert.rejects(
    service.create(Buffer.alloc(1), options, authority("four")),
    /processor unavailable/,
  );
  store.dispose();
});
test("camera permission resolving after Close stops all tracks instead of opening", async () => {
  let resolve: (s: MediaStream) => void = () => {};
  let stopped = 0;
  const controller = new CameraController();
  const pending = controller.open(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  controller.stop();
  resolve({
    getTracks: () => [{ stop: () => stopped++ }],
  } as unknown as MediaStream);
  assert.equal(await pending, null);
  assert.equal(stopped, 1);
});
test("camera replacement and teardown stop prior live tracks", async () => {
  let stopped = 0;
  const stream = () =>
    ({
      getTracks: () => [{ stop: () => stopped++ }],
    }) as unknown as MediaStream;
  const controller = new CameraController();
  await controller.open(async () => stream());
  await controller.open(async () => stream());
  assert.equal(stopped, 1);
  controller.stop();
  assert.equal(stopped, 2);
});
test("session capabilities expire and unknown identities are rejected", () => {
  let now = 100;
  const sessions = new Sessions(() => now);
  const id = sessions.create();
  assert.equal(sessions.require(id), id);
  assert.throws(() => sessions.require("untrusted"));
  now += RETENTION_MS;
  assert.throws(() => sessions.require(id));
});
test("client decoders reject malformed successful responses", () => {
  assert.throws(() => decodeResult({ id: "bad", expiresAt: "yesterday" }));
  assert.throws(() => decodePublication({ token: "../private" }));
});

test("staggered portraits expire no later than owner authority and remain revocable while live", async () => {
  let now = Date.now();
  const sessions = new Sessions(() => now),
    store = new MemoryStore(() => now);
  const service = new PortraitService(store, undefined, () => now);
  const owner = sessions.create();
  const access = { token: owner, expiresAt: sessions.expiresAt(owner) };
  const input = await fixture();
  try {
    const early = await service.create(input, options, access);
    now += RETENTION_MS - 1000;
    const late = await service.create(input, options, access);
    assert.equal(late.expiresAt, early.expiresAt);
    for (const time of [now, access.expiresAt - 1]) {
      now = time;
      sessions.require(owner);
      for (const p of [early, late]) {
        const { token } = await service.publish(p.id, owner, true);
        assert.ok(store.published(token));
        store.revoke(p.id, owner);
        assert.throws(() => store.published(token));
      }
    }
    const { token } = await service.publish(late.id, owner, true);
    now = access.expiresAt;
    assert.throws(() => sessions.require(owner));
    assert.throws(() => store.published(token));
    assert.throws(() => store.owned(late.id, owner));
    assert.equal(store.count(), 0);
  } finally {
    store.dispose();
  }
});
test("owner expiry during processing prevents retaining an uncontrollable portrait", async () => {
  let now = 100;
  const store = new MemoryStore(() => now);
  const service = new PortraitService(
    store,
    {
      process: async () => {
        now = 200;
        return {
          original: Buffer.alloc(1),
          originalFormat: "jpeg",
          preview: Buffer.alloc(1),
          processed: Buffer.alloc(1),
        };
      },
    },
    () => now,
  );
  await assert.rejects(
    service.create(Buffer.alloc(1), options, {
      token: "owner",
      expiresAt: 200,
    }),
    /expired during/,
  );
  assert.equal(store.count(), 0);
  store.dispose();
});
