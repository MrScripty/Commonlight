import { AppError } from "./contracts";

// Server-only configuration. An explicit origin enables hosting; otherwise the
// API retains its loopback-only default. Forwarded headers are never authority.
export function hostedOrigin(): URL | undefined {
  const configured = process.env.COMMONLIGHT_ORIGIN;
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      throw new Error("Invalid hosted origin");
    return url;
  } catch {
    throw new AppError(
      503,
      "unavailable",
      "COMMONLIGHT_ORIGIN must be an HTTPS origin with no path or credentials.",
    );
  }
}
