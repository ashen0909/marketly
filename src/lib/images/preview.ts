import sharp from "sharp";

/** Clean photo for small listing-card thumbnails; no EXIF or embedded metadata. */
export async function createMarketlyPreviewJpeg(file: File): Promise<Buffer> {
  const raw = Buffer.from(await file.arrayBuffer());
  const input = sharp(raw, { limitInputPixels: 25_000_000 });
  const meta = await input.metadata();
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new Error("Unsupported image type");
  return input.rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 74, progressive: true, mozjpeg: true }).toBuffer();
}
