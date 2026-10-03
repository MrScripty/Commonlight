import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { TestServer } from "../browser-tests/server";

test("occupied port never becomes harness-ready or receives test requests", async () => {
  let requests = 0;
  const unrelated = createServer((_request, response) => {
    requests++;
    response.end("unrelated server is HTTP ready");
  });
  unrelated.listen(0, "127.0.0.1");
  await once(unrelated, "listening");
  const address = unrelated.address();
  assert.ok(address && typeof address === "object");
  const server = new TestServer(address.port);
  try {
    await assert.rejects(async () => {
      await server.start();
      // This is what a test would do if the harness accepted the wrong server.
      await fetch(`${server.url}/api/portraits`, { method: "POST" });
    }, /Test server exited:.*EADDRINUSE/s);
    assert.equal(requests, 0);
    assert.equal(unrelated.listening, true);
    assert.throws(() => server.url, /not ready/);
  } finally {
    await server.dispose();
    await new Promise<void>((resolve, reject) =>
      unrelated.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
