import { NextRequest } from "next/server";
import { boundedBody, failure, json, mutation, owner } from "@/lib/http";
import { state } from "@/lib/service";
import { AppError, decodeOptions } from "@/lib/contracts";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    mutation(request);
    const identity = owner(request);
    let options: unknown;
    try {
      options = JSON.parse(
        decodeURIComponent(request.headers.get("x-portrait-options") ?? ""),
      );
    } catch {
      throw new AppError(400, "invalid", "Invalid portrait options.");
    }
    return json(
      await state.service.create(
        () => boundedBody(request),
        decodeOptions(options),
        { token: identity, expiresAt: state.sessions.expiresAt(identity) },
        request.signal,
      ),
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
