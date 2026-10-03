import test, { before, after } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStore } from "../lib/local-store";
import { state, PortraitService } from "../lib/service";
let testRoot: string;
let localStore: LocalStore;
before(async () => {
  if (state.sessions instanceof LocalStore) await state.sessions.dispose();
  testRoot = await mkdtemp(path.join(tmpdir(), "commonlight-routes-"));
  localStore = new LocalStore(path.join(testRoot, "data"));
  state.service = new PortraitService(localStore);
  state.sessions = localStore;
});
after(async () => {
  await localStore.dispose();
  await rm(testRoot, { recursive: true, force: true });
});
async function until(check: () => boolean) {
  const end = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > end)
      throw new Error("Expected stream state did not arrive");
    await new Promise((r) => setTimeout(r, 10));
  }
}
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { POST as session } from "../app/api/session/route";
import { POST as create } from "../app/api/portraits/route";
import {
  GET as privateGet,
  POST as action,
  DELETE as remove,
} from "../app/api/portraits/[id]/route";
import { GET as publicGet } from "../app/api/public/[token]/route";
import { boundedBody } from "../lib/http";
const origin = "http://localhost:3000";
function request(
  path: string,
  method = "GET",
  cookie = "",
  body?: BodyInit,
  extra: Record<string, string> = {},
) {
  return new NextRequest(origin + path, {
    method,
    headers: { origin, cookie, ...extra },
    body,
  });
}
test("HTTP workflow enforces owner, consent, no-store, token separation, revoke and deletion", async () => {
  const sessionResponse = await session(request("/api/session", "POST"));
  assert.equal(sessionResponse.status, 200);
  const rawCookie = sessionResponse.headers.get("set-cookie")!;
  assert.match(rawCookie, /HttpOnly/i);
  assert.match(rawCookie, /SameSite=strict/i);
  const cookie = rawCookie.split(";")[0];
  const input = await sharp({
    create: { width: 600, height: 750, channels: 3, background: "#669988" },
  })
    .png()
    .toBuffer();
  const options = { consent: true, name: "", mark: false };
  const response = await create(
    request("/api/portraits", "POST", cookie, new Uint8Array(input), {
      "x-portrait-options": encodeURIComponent(JSON.stringify(options)),
    }),
  );
  assert.equal(response.status, 201);
  const { id } = await response.json();
  const context = { params: Promise.resolve({ id }) };
  assert.equal(
    (await privateGet(request(`/api/portraits/${id}?kind=original`), context))
      .status,
    401,
  );
  const image = await privateGet(
    request(`/api/portraits/${id}?kind=original`, "GET", cookie),
    context,
  );
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.match(
    image.headers.get("content-disposition")!,
    /attachment; filename="commonlight-original.png"/,
  );
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), input);
  assert.match(image.headers.get("cache-control")!, /no-store/);
  assert.equal(
    (
      await action(
        request(
          `/api/portraits/${id}`,
          "POST",
          cookie,
          JSON.stringify({ action: "publish", consent: false }),
        ),
        context,
      )
    ).status,
    400,
  );
  const published = await action(
    request(
      `/api/portraits/${id}`,
      "POST",
      cookie,
      JSON.stringify({ action: "publish", consent: true }),
    ),
    context,
  );
  const { token } = await published.json();
  assert.notEqual(id, token);
  const publicContext = { params: Promise.resolve({ token }) };
  const output = await publicGet(
    request(`/api/public/${token}?kind=original`),
    publicContext,
  );
  assert.equal(output.status, 200);
  const metadata = await sharp(
    Buffer.from(await output.arrayBuffer()),
  ).metadata();
  assert.equal(metadata.width, 576);
  assert.equal(metadata.height, 720);
  assert.equal(
    (
      await privateGet(
        request(
          `/api/portraits/${id}?kind=original`,
          "GET",
          `commonlight_session=${token}`,
        ),
        context,
      )
    ).status,
    401,
  );
  const outsider = (await session(request("/api/session", "POST"))).headers
    .get("set-cookie")!
    .split(";")[0];
  assert.equal(
    (await remove(request(`/api/portraits/${id}`, "DELETE", outsider), context))
      .status,
    404,
  );
  assert.equal(
    (
      await action(
        request(
          `/api/portraits/${id}`,
          "POST",
          cookie,
          JSON.stringify({ action: "revoke" }),
        ),
        context,
      )
    ).status,
    200,
  );
  assert.equal(
    (await publicGet(request(`/api/public/${token}`), publicContext)).status,
    404,
  );
  assert.equal(
    (await remove(request(`/api/portraits/${id}`, "DELETE", cookie), context))
      .status,
    200,
  );
  assert.equal(
    (
      await privateGet(
        request(`/api/portraits/${id}?kind=original`, "GET", cookie),
        context,
      )
    ).status,
    404,
  );
});
test("HTTP rejects cross-origin writes and remote deployment hosts", async () => {
  assert.equal(
    (
      await session(
        request("/api/session", "POST", "", undefined, {
          origin: "https://evil.example",
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await session(
        new NextRequest("https://public.example/api/session", {
          method: "POST",
          headers: { origin: "https://public.example" },
        }),
      )
    ).status,
    503,
  );
});
test("streaming body bounds apply even without Content-Length", async () => {
  const input = new Request(origin, {
    method: "POST",
    body: new Uint8Array(12),
  });
  await assert.rejects(boundedBody(input, 10), /too large/);
});

test("JPEG and WebP originals recover exact bytes with their real media type and extension", async () => {
  const cookie = (await session(request("/api/session", "POST"))).headers
    .get("set-cookie")!
    .split(";")[0];
  for (const format of ["jpeg", "webp"] as const) {
    const input = await sharp({
      create: { width: 200, height: 250, channels: 3, background: "#339966" },
    })
      .toFormat(format)
      .withMetadata({ exif: { IFD0: { Artist: "Synthetic only" } } })
      .toBuffer();
    const response = await create(
      request("/api/portraits", "POST", cookie, new Uint8Array(input), {
        "x-portrait-options": encodeURIComponent(
          JSON.stringify({ consent: true, name: "", mark: false }),
        ),
      }),
    );
    assert.equal(response.status, 201);
    const { id } = await response.json(),
      context = { params: Promise.resolve({ id }) };
    try {
      const original = await privateGet(
        request(`/api/portraits/${id}?kind=original`, "GET", cookie),
        context,
      );
      assert.equal(original.headers.get("content-type"), `image/${format}`);
      assert.ok(
        original.headers
          .get("content-disposition")!
          .endsWith(`.${format === "jpeg" ? "jpg" : format}"`),
      );
      assert.deepEqual(Buffer.from(await original.arrayBuffer()), input);
      const preview = await privateGet(
        request(`/api/portraits/${id}?kind=preview`, "GET", cookie),
        context,
      );
      assert.equal(
        (await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).exif,
        undefined,
      );
    } finally {
      await remove(request(`/api/portraits/${id}`, "DELETE", cookie), context);
    }
  }
});

test("upload admission precedes body reading; only two incomplete streams are consumed and cancellation releases slots", async () => {
  const cookie = (await session(request("/api/session", "POST"))).headers
    .get("set-cookie")!
    .split(";")[0];
  const pulls = Array<number>(6).fill(0),
    cancels = Array<number>(6).fill(0);
  const aborts = Array.from({ length: 6 }, () => new AbortController());
  const streams = Array.from(
    { length: 6 },
    (_, i) =>
      new ReadableStream<Uint8Array>(
        {
          pull() {
            pulls[i]++;
          },
          cancel() {
            cancels[i]++;
          },
        },
        { highWaterMark: 0 },
      ),
  );
  function upload(i: number, consent = true) {
    return create(
      new NextRequest(origin + "/api/portraits", {
        method: "POST",
        body: streams[i],
        signal: aborts[i].signal,
        headers: {
          origin,
          cookie,
          "x-portrait-options": encodeURIComponent(
            JSON.stringify({ consent, name: "", mark: false }),
          ),
        },
        duplex: "half",
      } as ConstructorParameters<typeof NextRequest>[1]),
    );
  }
  const pending = [upload(0), upload(1)];
  await until(() => pulls[0] === 1 && pulls[1] === 1);
  try {
    const rejected = await Promise.all([
      upload(2),
      upload(3),
      upload(4),
      upload(5),
    ]);
    assert.deepEqual(
      rejected.map((r) => r.status),
      [503, 503, 503, 503],
    );
    assert.deepEqual(pulls, [1, 1, 0, 0, 0, 0]);
    aborts[0].abort();
    aborts[1].abort();
    assert.deepEqual(
      (await Promise.all(pending)).map((r) => r.status),
      [409, 409],
    );
    assert.deepEqual(cancels.slice(0, 2), [1, 1]);
    assert.equal((await upload(2, false)).status, 400);
    assert.equal(pulls[2], 0);
    const resumed = upload(3);
    await until(() => pulls[3] === 1);
    assert.equal(pulls[3], 1);
    aborts[3].abort();
    assert.equal((await resumed).status, 409);
    // Reader failure also releases admission, rather than stranding the two-slot gate.
    for (let i = 0; i < 3; i++) {
      const broken = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            controller.error(new Error("read failed"));
          },
        },
        { highWaterMark: 0 },
      );
      const response = await create(
        new NextRequest(origin + "/api/portraits", {
          method: "POST",
          body: broken,
          headers: {
            origin,
            cookie,
            "x-portrait-options": encodeURIComponent(
              JSON.stringify({ consent: true, name: "", mark: false }),
            ),
          },
          duplex: "half",
        } as ConstructorParameters<typeof NextRequest>[1]),
      );
      assert.equal(response.status, 500);
    }
  } finally {
    aborts.forEach((a) => a.abort());
    await Promise.all(pending);
  }
});

test("private listing restores review and sharing state without exposing another owner", async () => {
  const first = (await session(request("/api/session", "POST"))).headers
    .get("set-cookie")!
    .split(";")[0];
  const second = (await session(request("/api/session", "POST"))).headers
    .get("set-cookie")!
    .split(";")[0];
  const input = await sharp({
    create: { width: 120, height: 150, channels: 3, background: "#774488" },
  })
    .png()
    .toBuffer();
  const result = await create(
    request("/api/portraits", "POST", first, new Uint8Array(input), {
      "x-portrait-options": encodeURIComponent(
        JSON.stringify({ consent: true, name: "", mark: false }),
      ),
    }),
  );
  const { id } = await result.json(),
    context = { params: Promise.resolve({ id }) };
  try {
    const { GET: list } = await import("../app/api/portraits/route");
    assert.equal((await list(request("/api/portraits"))).status, 401);
    assert.deepEqual(
      await (await list(request("/api/portraits", "GET", second))).json(),
      [],
    );
    const own = await (
      await list(request("/api/portraits", "GET", first))
    ).json();
    assert.equal(own.length, 1);
    assert.equal(own[0].id, id);
    assert.equal(own[0].token, undefined);
    const shared = await action(
      request(
        `/api/portraits/${id}`,
        "POST",
        first,
        JSON.stringify({ action: "publish", consent: true }),
      ),
      context,
    );
    const { token } = await shared.json();
    assert.equal(
      (await (await list(request("/api/portraits", "GET", first))).json())[0]
        .token,
      token,
    );
  } finally {
    await remove(request(`/api/portraits/${id}`, "DELETE", first), context);
  }
});

test("normalized Next loopback URLs preserve exact browser Host/Origin equality", async () => {
  for (const host of ["127.0.0.1:3100", "localhost:3100", "[::1]:3100"]) {
    const response = await session(
      new NextRequest("http://localhost:3100/api/session", {
        method: "POST",
        headers: { host, origin: `http://${host}` },
      }),
    );
    assert.equal(response.status, 200);
  }
  for (const origin of [
    "http://localhost:3100",
    "http://127.0.0.1:3101",
    "https://127.0.0.1:3100",
    "null",
  ]) {
    const response = await session(
      new NextRequest("http://localhost:3100/api/session", {
        method: "POST",
        headers: { host: "127.0.0.1:3100", origin },
      }),
    );
    assert.equal(response.status, 403);
  }
  const external = await session(
    new NextRequest("http://localhost:3100/api/session", {
      method: "POST",
      headers: {
        host: "evil.example:3100",
        origin: "http://evil.example:3100",
        "x-forwarded-host": "localhost:3100",
      },
    }),
  );
  assert.equal(external.status, 503);
  const port = await session(
    new NextRequest("http://localhost:3100/api/session", {
      method: "POST",
      headers: { host: "127.0.0.1:3101", origin: "http://127.0.0.1:3101" },
    }),
  );
  assert.equal(port.status, 403);
});
