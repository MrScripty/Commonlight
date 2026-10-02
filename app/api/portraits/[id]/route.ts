import { NextRequest } from "next/server";
import {
  boundedBody,
  failure,
  jpeg,
  json,
  mutation,
  owner,
  originalDownload,
} from "@/lib/http";
import { state } from "@/lib/service";
import { AppError } from "@/lib/contracts";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const identity = owner(request);
    const { id } = await context.params;
    const kind = request.nextUrl.searchParams.get("kind");
    if (kind !== "original" && kind !== "preview" && kind !== "processed")
      throw new AppError(
        400,
        "invalid",
        "Choose original, preview or processed.",
      );
    const portrait = state.service.store.owned(id, identity);
    return kind === "original"
      ? originalDownload(portrait.original, portrait.originalFormat)
      : jpeg(portrait[kind]);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    mutation(request);
    const identity = owner(request);
    const { id } = await context.params;
    let data: unknown;
    try {
      data = JSON.parse((await boundedBody(request, 1024)).toString());
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(400, "invalid", "Invalid action.");
    }
    if (!data || typeof data !== "object" || !("action" in data))
      throw new AppError(400, "invalid", "Invalid action.");
    if (
      data.action === "publish" &&
      "consent" in data &&
      Object.keys(data).every((k) => ["action", "consent"].includes(k))
    )
      return json(state.service.publish(id, identity, data.consent));
    if (data.action === "revoke" && Object.keys(data).length === 1) {
      state.service.store.revoke(id, identity);
      return json({ revoked: true });
    }
    throw new AppError(400, "invalid", "Invalid action.");
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: NextRequest, context: Context) {
  try {
    mutation(request);
    const identity = owner(request);
    const { id } = await context.params;
    state.service.store.delete(id, identity);
    return json({ deleted: true });
  } catch (e) {
    return failure(e);
  }
}
