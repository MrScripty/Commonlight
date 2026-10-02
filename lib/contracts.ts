export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;
export const RETENTION_MS = 24 * 60 * 60 * 1000;
export const MAX_RECORDS = 12;
export const MAX_ACTIVE = 2;
export const WIDTH = 576;
export const HEIGHT = 720;
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:
      "invalid" | "unsupported" | "unavailable" | "not_found" | "cancelled",
    message: string,
  ) {
    super(message);
  }
}
export type Options = { consent: true; name: string; mark: boolean };
export function decodeOptions(value: unknown): Options {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(400, "invalid", "Invalid portrait options.");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some((k) => !["consent", "name", "mark"].includes(k)) ||
    v.consent !== true ||
    typeof v.name !== "string" ||
    v.name.length > 60 ||
    [...v.name].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    typeof v.mark !== "boolean"
  )
    throw new AppError(
      400,
      "invalid",
      "Consent is required. Use a name of up to 60 characters.",
    );
  return { consent: true, name: v.name.trim(), mark: v.mark };
}
export function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new AppError(409, "cancelled", "Processing was cancelled.");
}
export function decodeResult(value: unknown): {
  id: string;
  expiresAt: string;
} {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !/^[a-f0-9]{32}$/.test(value.id) ||
    !("expiresAt" in value) ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt))
  )
    throw new Error("The server returned an invalid portrait result.");
  return { id: value.id, expiresAt: value.expiresAt };
}
export function decodePublication(value: unknown): { token: string } {
  if (
    !value ||
    typeof value !== "object" ||
    !("token" in value) ||
    typeof value.token !== "string" ||
    !/^[a-f0-9]{48}$/.test(value.token)
  )
    throw new Error("The server returned an invalid gallery link.");
  return { token: value.token };
}
