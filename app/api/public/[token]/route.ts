import { failure, jpeg, localOnly } from "@/lib/http";
import { state } from "@/lib/service";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    localOnly(request);
    const { token } = await context.params;
    return jpeg(state.service.store.published(token).processed);
  } catch (e) {
    return failure(e);
  }
}
