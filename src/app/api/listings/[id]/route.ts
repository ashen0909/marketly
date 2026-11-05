import {NextResponse} from "next/server";
import {z} from "zod";
import {categories,locations} from "@/data/catalog";
import {createServerSupabase} from "@/lib/supabase/server";
import {uploadListingPhotoPairs,validateImageFiles} from "@/lib/images/upload-listing-photos";
export const runtime="nodejs";
const schema=z.object({title:z.string().trim().min(5).max(90),description:z.string().trim().min(20).max(2500),
  category:z.enum(categories.map(c=>c.id) as [string,...string[]]),location:z.enum([...locations]),
  condition:z.enum(["New","Used","Refurbished"]),price:z.coerce.number().int().min(1).max(999999999),is_negotiable:z.boolean()});
const fail=(message:string,status=400)=>NextResponse.json({message},{status});
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return fail("Cross-origin blocked",403);
  if(Number(request.headers.get("content-length")||0)>27*1024*1024)return fail("Upload too large",413);
  const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return fail("Invalid ID");
  const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();if(!user)return fail("Sign in",401);
  const {data:own,error:ownershipError}=await db.from("listings").select("id").eq("id",id).eq("seller_id",user.id).maybeSingle();
  if(ownershipError||!own)return fail("Listing not found or not yours",403);
  const form=await request.formData().catch(()=>null);if(!form)return fail("Invalid form data");
  const result=schema.safeParse({title:form.get("title"),description:form.get("description"),price:form.get("price"),
    category:form.get("category"),location:form.get("location"),condition:form.get("condition"),is_negotiable:form.get("is_negotiable")==="true"});
  if(!result.success)return fail(result.error.issues[0]?.message||"Invalid fields");
  const { data: duplicates } = await db.from("listings").select("id,title")
    .eq("seller_id", user.id).neq("id", id).neq("status", "deleted").limit(500);
  if ((duplicates ?? []).some(row => row.title.trim().toLocaleLowerCase("en") === result.data.title.trim().toLocaleLowerCase("en")))
    return fail("You already have another active ad with this title.",409);
  const files=form.getAll("images");if(files.some(f=>!(f instanceof File)))return fail("Invalid photos");
  if(files.length)try{validateImageFiles(files as File[]);}catch(e){return fail(e instanceof Error?e.message:"Invalid photos");}
  const {data:oldPhotos}=files.length?await db.from("listing_images").select("storage_path,preview_storage_path").eq("listing_id",id):{data:null};
  let uploaded:Awaited<ReturnType<typeof uploadListingPhotoPairs>>|undefined;
  try{
    if(files.length)uploaded=await uploadListingPhotoPairs(files as File[],user.id);
    const {error}=await db.rpc("marketly_update_listing",{p_listing_id:id,p_title:result.data.title,
      p_description:result.data.description,p_price_lkr:result.data.price,p_category:result.data.category,
      p_location:result.data.location,p_condition:result.data.condition,p_is_negotiable:result.data.is_negotiable,
      p_image_paths:uploaded?.paths??null,p_preview_paths:uploaded?.previews??null});
    if(error)throw new Error(error.message);
    if(uploaded && oldPhotos?.length){
      const oldPaths=oldPhotos.flatMap(img=>[img.storage_path,img.preview_storage_path].filter((item):item is string=>!!item));
      // DB has already committed; a storage deletion failure must not undo the edit.
      const {error:cleanupError}=await uploaded.storage.remove(oldPaths);
      if(cleanupError)console.warn("[Marketly] old photo cleanup deferred",cleanupError.message);
    }
    return NextResponse.json({message:"Saved and submitted for admin review"});
  }catch(e){if(uploaded)await uploaded.storage.remove(uploaded.uploaded);
    return fail(e instanceof Error?e.message:"Unable to update",400);}
}
