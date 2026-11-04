import { NextResponse } from "next/server";
import { z } from "zod";
import { categories,locations } from "@/data/catalog";
import { createServerSupabase,hasSupabaseConfig } from "@/lib/supabase/server";
import { uploadListingPhotoPairs,validateImageFiles } from "@/lib/images/upload-listing-photos";
export const runtime="nodejs";
const schema=z.object({
  title:z.string().trim().min(5).max(90),description:z.string().trim().min(20).max(2500),
  category:z.enum(categories.map(c=>c.id) as [string,...string[]]),location:z.enum([...locations]),
  condition:z.enum(["New","Used","Refurbished"]),price:z.coerce.number().int().min(1).max(999999999),
  is_negotiable:z.boolean(),
});
const fail=(message:string,status=400)=>NextResponse.json({message},{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request){
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return fail("Cross-origin request blocked",403);
  if(Number(request.headers.get("content-length")||0)>27*1024*1024)return fail("Upload too large",413);
  if(!hasSupabaseConfig())return fail("Database not connected",503);
  const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();if(!user)return fail("Please sign in",401);
  const form=await request.formData().catch(()=>null);if(!form)return fail("Invalid form data");
  const result=schema.safeParse({title:form.get("title"),description:form.get("description"),category:form.get("category"),
    location:form.get("location"),condition:form.get("condition"),price:form.get("price"),is_negotiable:form.get("is_negotiable")==="true"});
  if(!result.success)return fail(result.error.issues[0]?.message||"Invalid product fields");
  const files=form.getAll("images");if(files.some(v=>!(v instanceof File)))return fail("Invalid photos");
  try{validateImageFiles(files as File[]);}catch(e){return fail(e instanceof Error?e.message:"Invalid photos");}
  let uploaded:Awaited<ReturnType<typeof uploadListingPhotoPairs>>|undefined;
  try{
    uploaded=await uploadListingPhotoPairs(files as File[],user.id);
    const {data:id,error}=await db.rpc("marketly_publish_listing",{
      p_title:result.data.title,p_description:result.data.description,p_price_lkr:result.data.price,
      p_category:result.data.category,p_location:result.data.location,p_condition:result.data.condition,
      p_is_negotiable:result.data.is_negotiable,p_image_paths:uploaded.paths,p_preview_paths:uploaded.previews,
    });
    if(error)throw new Error(error.message);
    return NextResponse.json({id,message:"Submitted for admin review",review_status:"pending"},{status:201,headers:{"Cache-Control":"no-store"}});
  }catch(e){if(uploaded)await uploaded.storage.remove(uploaded.uploaded);
    const message=e instanceof Error?e.message:"Unable to submit ad";
    return fail(message,message.includes("QUOTA")?409:400);
  }
}
