import { NextRequest } from "next/server";
import { state } from "@/lib/service";
import { failure, json, mutation } from "@/lib/http";
import { RETENTION_MS, AppError } from "@/lib/contracts";
import { hostedOrigin } from "@/lib/deployment";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    mutation(request);
    const existing = request.cookies.get("commonlight_session")?.value;
    try {
      await state.sessions.require(existing);
      return json({ ready: true });
    } catch (error) {
      if (!(error instanceof AppError) || error.status !== 401) throw error;
    }
    const response = json({ ready: true });
    response.cookies.set("commonlight_session", await state.sessions.create(), {
      httpOnly: true,
      sameSite: "strict",
      secure:
        Boolean(hostedOrigin()) || new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: RETENTION_MS / 1000,
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
