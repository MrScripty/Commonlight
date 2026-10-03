import path from "node:path";
import { realpath } from "node:fs/promises";
import { AppError } from "./contracts";
// This is the single supported Next distDir authority: next.config.ts consumes it too.
export const NEXT_DIST_DIR = ".next";
export type StorageLayout = { projectRoot: string; distDir: string };
export function servedRoots(layout: StorageLayout) {
  return [
    ...new Set(
      ["public", ".next", layout.distDir, "out", ".vercel/output"].map(
        (directory) => path.resolve(layout.projectRoot, directory),
      ),
    ),
  ];
}
function within(candidate: string, parent: string) {
  return candidate === parent || candidate.startsWith(parent + path.sep);
}
export function rejectServedLocation(candidate: string, roots: string[]) {
  if (roots.some((root) => within(candidate, root) || within(root, candidate)))
    throw new AppError(
      503,
      "invalid",
      "Private storage cannot overlap public assets or served/build-output paths.",
    );
}
async function resolveLocation(candidate: string): Promise<string> {
  try {
    return await realpath(candidate);
  } catch (error) {
    if (!(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ))
      throw error;
    const parent = path.dirname(candidate);
    if (parent === candidate) throw error;
    return path.join(await resolveLocation(parent), path.basename(candidate));
  }
}
export async function rejectResolvedServedLocation(
  candidate: string,
  roots: string[],
) {
  const [resolved, ...resolvedRoots] = await Promise.all(
    [candidate, ...roots].map(resolveLocation),
  );
  rejectServedLocation(resolved, resolvedRoots);
}
