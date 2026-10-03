import { NextRequest } from "next/server";
import { boundedBody, failure, json, mutation, owner } from "@/lib/http";
import { state } from "@/lib/service";
import { AppError, decodeOptions } from "@/lib/contracts";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    mutation(request);
    const identity = await owner(request);
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
        {
          token: identity,
          expiresAt: await state.sessions.expiresAt(identity),
        },
        request.signal,
      ),
      201,
    );
  } catch (e) {
    return failure(e);
  }
}

export async function GET(request: NextRequest) {
  try {
    const identity = await owner(request);
    return json(await state.service.store.list(identity));
  } catch (error) {
    return failure(error);
  }
}
