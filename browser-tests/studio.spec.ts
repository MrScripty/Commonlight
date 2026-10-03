import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { TestServer } from "./server";
const server = new TestServer();
const base = "http://127.0.0.1:3100";
let synthetic: Buffer;
declare global {
  interface Window {
    releaseCamera?: () => void;
    capturedTracks?: MediaStreamTrack[];
  }
}
test.beforeAll(async () => {
  synthetic = await sharp({
    create: { width: 800, height: 1000, channels: 3, background: "#688f99" },
  })
    .png()
    .toBuffer();
  await server.start();
});
test.afterAll(async () => {
  await server.dispose();
});
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("status")).not.toContainText("Restoring");
}
async function prepare(page: Page) {
  await page.getByRole("checkbox", { name: /I’m the person/ }).check();
  await page.getByLabel("Upload photo", { exact: true }).setInputFiles({
    name: "synthetic-colour.png",
    mimeType: "image/png",
    buffer: synthetic,
  });
  await page.getByRole("button", { name: /Prepare my portrait/ }).click();
  await expect(
    page.getByRole("heading", { name: "Meet your portrait." }),
  ).toBeVisible();
}
async function cleanup(page: Page) {
  const r = await page.request.get("/api/portraits");
  if (r.ok())
    for (const p of await r.json())
      await page.request.delete(`/api/portraits/${p.id}`, {
        headers: { origin: base },
      });
}
test.afterEach(async ({ page }) => {
  await cleanup(page);
});

test("consent, exact original, reload/restart recovery, public consent and revocation", async ({
  page,
  browser,
}) => {
  await ready(page);
  await expect(page.getByRole("button", { name: "Use camera" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Prepare my portrait/ }),
  ).toBeDisabled();
  await prepare(page);
  await expect(
    page.getByRole("heading", { name: "Meet your portrait." }),
  ).toBeFocused();
  const original = page.getByRole("link", { name: "Save exact original" });
  const originalUrl = await original.getAttribute("href");
  const recovered = await page.request.get(originalUrl!);
  expect(Buffer.from(await recovered.body())).toEqual(synthetic);
  expect(recovered.headers()["content-type"]).toBe("image/png");
  await expect(
    page.getByRole("button", { name: /Create gallery link/ }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Meet your portrait." }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /person pictured explicitly/ }),
  ).not.toBeChecked();
  await page
    .getByRole("checkbox", { name: /person pictured explicitly/ })
    .check();
  await page.getByRole("button", { name: /Create gallery link/ }).click();
  const gallery = await page
    .getByLabel("Gallery link", { exact: true })
    .inputValue();
  const viewer = await browser.newContext();
  const publicPage = await viewer.newPage();
  await publicPage.goto(gallery);
  await expect(
    publicPage.getByRole("heading", { name: "A face from the room." }),
  ).toBeVisible();
  expect((await publicPage.request.get(base + originalUrl)).status()).toBe(401);
  await page.goto(gallery);
  await page.goBack();
  await expect(page.getByLabel("Gallery link", { exact: true })).toHaveValue(
    gallery,
  );
  await server.restart();
  await page.reload();
  await expect(page.getByLabel("Gallery link", { exact: true })).toHaveValue(
    gallery,
  );
  await page.getByRole("button", { name: "Revoke link", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Link revoked");
  await publicPage.reload();
  await expect(
    publicPage.getByRole("heading", { name: "This portrait is private." }),
  ).toBeVisible();
  await viewer.close();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: /person pictured explicitly/ }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Delete both & start again", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start with a good moment." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Start with a good moment." }),
  ).toBeVisible();
});

test("repeated prepare is single-flight and an interrupted response is recoverable after reload", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("checkbox", { name: /I’m the person/ }).check();
  await page.getByLabel("Upload photo", { exact: true }).setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: synthetic,
  });
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/portraits")
      posts++;
  });
  await page.getByRole("button", { name: /Prepare my portrait/ }).dblclick();
  await expect(
    page.getByRole("heading", { name: "Meet your portrait." }),
  ).toBeVisible();
  expect(posts).toBe(1);
  await page.getByRole("button", { name: "Add another portrait" }).click();
  await page.getByLabel("Upload photo", { exact: true }).setInputFiles({
    name: "another-synthetic.png",
    mimeType: "image/png",
    buffer: synthetic,
  });
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let committed = false;
  await page.route("**/api/portraits", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    committed = response.status() === 201;
    await gate;
    try {
      await route.fulfill({ response });
    } catch {
      /* Navigation may already have cancelled this synthetic response. */
    }
  });
  await page.getByRole("button", { name: /Prepare my portrait/ }).click();
  await expect.poll(() => committed).toBe(true);
  await page.getByRole("button", { name: "Cancel request" }).click();
  release();
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(
    page
      .getByRole("navigation", { name: "Your saved portraits" })
      .getByRole("button", { name: /Portrait \d/ }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Portrait 2 · private", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Portrait 2 · private", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("closing a pending fake-camera request releases its tracks; capture and mobile layout remain usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      await new Promise<void>((resolve) => {
        window.releaseCamera = resolve;
      });
      const stream = await original(constraints);
      window.capturedTracks = stream.getTracks();
      return stream;
    };
  });
  await ready(page);
  await page.getByRole("checkbox", { name: /I’m the person/ }).check();
  await page.getByRole("button", { name: "Use camera", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Close camera", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  await page.evaluate(() => window.releaseCamera?.());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.capturedTracks?.every((t) => t.readyState === "ended") ??
          false,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Use camera", exact: true }).click();
  await page.evaluate(() => window.releaseCamera?.());
  await expect(
    page.getByRole("button", { name: "Take photo", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.locator("video").evaluate((v) => (v as HTMLVideoElement).videoWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(page.getByAltText("Selected source photograph")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.capturedTracks?.every((t) => t.readyState === "ended") ??
          false,
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /Prepare my portrait/ }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Meet your portrait." }),
  ).toBeVisible();
  await test.info().attach("synthetic-mobile-review", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
