import sharp from "sharp";

/**
 * Permanently watermark newly uploaded public listing photos.
 * Server-side processing prevents clients from bypassing the logo by editing JS.
 * All outputs are resized JPEGs with orientation fixed and EXIF metadata removed.
 */
export async function createMarketlyWatermarkedJpeg(file: File): Promise<Buffer> {
  const original = Buffer.from(await file.arrayBuffer());
  const source = sharp(original, { limitInputPixels: 25_000_000 });
  const metadata = await source.metadata();
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new Error("Photo format is not supported. Use JPG, PNG or WEBP.");
  }
  // Resize before compositing to put a ceiling on storage and processing cost.
  const resized = await source.rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
  const { width, height } = await sharp(resized).metadata();
  if (!width || !height) throw new Error("Could not read photo dimensions.");

  const centerSize = Math.max(16, Math.round(Math.min(width / 6, height / 6, 140)));
  const cornerSize = Math.max(12, Math.round(Math.min(width / 25, height / 20, 46)));
  const margin = Math.max(12, Math.round(width * .02));
  const labelWidth = Math.round(cornerSize * 6.6);
  const labelHeight = Math.round(cornerSize * 1.7);
  const x = Math.max(0, width - labelWidth - margin);
  const y = Math.max(0, height - labelHeight - margin);
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <g transform="translate(${width / 2} ${height / 2}) rotate(-25)">
      <text x="0" y="0" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${centerSize}" font-weight="900"
        fill="#ffffff" fill-opacity=".28" stroke="#000000" stroke-opacity=".16" stroke-width="1.4">MARKETLY</text>
    </g>
    <rect x="${x}" y="${y}" width="${labelWidth}" height="${labelHeight}" rx="${Math.round(cornerSize * .23)}" fill="#24272E" fill-opacity=".75"/>
    <text x="${x + labelWidth / 2}" y="${y + labelHeight / 2}" dominant-baseline="middle" text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif" font-size="${cornerSize}" font-weight="bold" fill="#ffffff">Marketly</text>
  </svg>`);
  const output = await sharp(resized).composite([{ input: svg }]).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  if (output.byteLength > 5 * 1024 * 1024) throw new Error("Processed photo is too large. Please choose a smaller photo.");
  return output;
}
