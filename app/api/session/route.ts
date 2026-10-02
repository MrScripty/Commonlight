import { NextRequest } from "next/server";
import { state } from "@/lib/service";
import { failure, json, mutation } from "@/lib/http";
import { RETENTION_MS } from "@/lib/contracts";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    mutation(request);
    const existing = request.cookies.get("commonlight_session")?.value;
    try {
      state.sessions.require(existing);
      return json({ ready: true });
    } catch {
      /* Expired sessions get new bounded capabilities. */
    }
    const response = json({ ready: true });
    response.cookies.set("commonlight_session", state.sessions.create(), {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: RETENTION_MS / 1000,
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
