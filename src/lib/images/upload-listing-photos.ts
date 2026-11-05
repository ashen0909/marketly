import { createAdminStorage } from "@/lib/supabase/storage-admin";
import { createMarketlyWatermarkedJpeg } from "@/lib/images/watermark";
import { createMarketlyPreviewJpeg } from "@/lib/images/preview";
import { marketlyConfig } from "@/lib/config";

export function validateImageFiles(images: File[], limit = 5) {
  if (images.length<1 || images.length>limit) throw new Error(`Use 1–${limit} photos for your account.`);
  for (const image of images) {
    if (!(marketlyConfig.imageMimeTypes as readonly string[]).includes(image.type) || image.size<1 || image.size>marketlyConfig.maxImageBytes)
      throw new Error("Use JPG/PNG/WEBP photos up to 5MB each.");
  }
}
export async function uploadListingPhotoPairs(images: File[], userId: string) {
  const storage=createAdminStorage();
  const paths:string[]=[];
  const previews:string[]=[];
  const uploaded:string[]=[];
  const group=crypto.randomUUID();
  try {
    for (const [index, file] of images.entries()) {
      const prefix=`${userId}/${group}/${index}-${crypto.randomUUID()}`;
      const detailed=`${prefix}.jpg`, preview=`${prefix}-preview.jpg`;
      const [watermarked, clean]=await Promise.all([createMarketlyWatermarkedJpeg(file), createMarketlyPreviewJpeg(file)]);
      for (const [path, bytes] of [[detailed,watermarked],[preview,clean]] as const) {
        const {error}=await storage.upload(path,bytes,{contentType:"image/jpeg",upsert:false,cacheControl:"3600"});
        if (error) throw new Error("Photo upload failed: "+error.message);
        uploaded.push(path);
      }
      paths.push(detailed);previews.push(preview);
    }
    return {paths,previews, uploaded, storage};
  } catch(error) { if (uploaded.length) await storage.remove(uploaded);throw error; }
}
