import sharp from "sharp";
import {
  AppError,
  MAX_PIXELS,
  MAX_UPLOAD_BYTES,
  WIDTH,
  HEIGHT,
  checkCancelled,
  type Options,
} from "./contracts";
export type OriginalFormat = "jpeg" | "png" | "webp";
export type PortraitImages = {
  original: Buffer;
  originalFormat: OriginalFormat;
  preview: Buffer;
  processed: Buffer;
};
export interface PortraitProcessor {
  process(
    input: Buffer,
    options: Options,
    signal?: AbortSignal,
  ): Promise<PortraitImages>;
}
const escapeXml = (text: string) =>
  text.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[c]!,
  );
export class DeterministicProcessor implements PortraitProcessor {
  async process(input: Buffer, options: Options, signal?: AbortSignal) {
    checkCancelled(signal);
    if (!input.length || input.length > MAX_UPLOAD_BYTES)
      throw new AppError(413, "invalid", "Choose an image up to 10 MB.");
    const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
    const png = input
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp =
      input.toString("ascii", 0, 4) === "RIFF" &&
      input.toString("ascii", 8, 12) === "WEBP";
    if (!jpeg && !png && !webp)
      throw new AppError(
        415,
        "unsupported",
        "Choose a still JPEG, PNG or WebP image.",
      );
    try {
      const image = sharp(input, {
        limitInputPixels: MAX_PIXELS,
        failOn: "warning",
      });
      const metadata = await image.metadata();
      if (
        !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
        (metadata.pages ?? 1) !== 1
      )
        throw new AppError(
          415,
          "unsupported",
          "Choose a still JPEG, PNG or WebP image.",
        );
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width < 100 ||
        metadata.height < 100
      )
        throw new AppError(
          400,
          "invalid",
          "Choose an image at least 100 pixels on each side.",
        );
      // Decode/re-encode deliberately strips EXIF, GPS, XMP and embedded profiles.
      const preview = await image
        .rotate()
        .flatten({ background: "#f4f4eb" })
        .toColourspace("srgb")
        .jpeg({ quality: 95 })
        .toBuffer();
      checkCancelled(signal);
      let pipeline = sharp(preview)
        .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
        .modulate({ brightness: 1.035, saturation: 0.96 });
      if (options.name || options.mark) {
        const overlay = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="620" width="576" height="100" fill="#0a0d12" fill-opacity="0.82"/><text x="24" y="660" font-family="sans-serif" font-size="${options.name.length > 30 ? 14 : 22}" fill="white">${escapeXml(options.name)}</text><text x="24" y="695" font-family="sans-serif" font-size="16" fill="#dfe250">${options.mark ? "BC + AI" : ""}</text></svg>`;
        pipeline = pipeline.composite([{ input: Buffer.from(overlay) }]);
      }
      const processed = await pipeline
        .toColourspace("srgb")
        .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
        .toBuffer();
      checkCancelled(signal);
      return {
        original: Buffer.from(input),
        originalFormat: metadata.format as OriginalFormat,
        preview,
        processed,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        400,
        "invalid",
        "This image could not be decoded safely. Try another JPEG, PNG or WebP.",
      );
    }
  }
}
