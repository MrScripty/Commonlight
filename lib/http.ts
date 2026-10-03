import { NextRequest, NextResponse } from "next/server";
import { AppError, MAX_UPLOAD_BYTES, checkCancelled } from "./contracts";
import { state } from "./service";
export const privateHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
export function localOnly(request: Request) {
  const host = new URL(request.url).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host))
    throw new AppError(
      503,
      "unavailable",
      "This prototype is local-only. Production hosting is not enabled.",
    );
}
export function mutation(request: Request) {
  localOnly(request);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new AppError(403, "invalid", "Use the studio on the same origin.");
}
export async function owner(request: NextRequest) {
  localOnly(request);
  return await state.sessions.require(
    request.cookies.get("commonlight_session")?.value,
  );
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: privateHeaders });
}
export function failure(error: unknown) {
  return error instanceof AppError
    ? json({ code: error.code, error: error.message }, error.status)
    : json(
        {
          code: "unavailable",
          error: "The operation could not finish. Please try again.",
        },
        500,
      );
}
export function jpeg(buffer: Buffer) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      ...privateHeaders,
      "Content-Type": "image/jpeg",
      "Content-Disposition": 'inline; filename="commonlight.jpg"',
    },
  });
}
export function originalDownload(
  buffer: Buffer,
  format: "jpeg" | "png" | "webp",
) {
  const extension = format === "jpeg" ? "jpg" : format;
  return new Response(new Uint8Array(buffer), {
    headers: {
      ...privateHeaders,
      "Content-Type": `image/${format}`,
      "Content-Disposition": `attachment; filename="commonlight-original.${extension}"`,
    },
  });
}
export async function boundedBody(request: Request, limit = MAX_UPLOAD_BYTES) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new AppError(413, "invalid", "The upload is too large.");
  if (!request.body)
    throw new AppError(400, "invalid", "An image is required.");
  checkCancelled(request.signal);
  const reader = request.body.getReader();
  let cancellation: Promise<void> | undefined;
  const onAbort = () => {
    // Retain cleanup ownership until the stream acknowledges cancellation.
    cancellation = reader.cancel().then(
      () => undefined,
      () => undefined,
    );
  };
  request.signal.addEventListener("abort", onAbort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      checkCancelled(request.signal);
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError(413, "invalid", "The upload is too large.");
      }
      chunks.push(value);
    }
  } finally {
    request.signal.removeEventListener("abort", onAbort);
    await cancellation;
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
