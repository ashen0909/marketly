import { NextResponse } from "next/server";
import { userFacingError } from "@/lib/user-facing-error";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminStorage } from "@/lib/supabase/storage-admin";
export const runtime="nodejs";
export async function DELETE(request: Request,{params}:{params:Promise<{id:string}>}) {
  const origin=request.headers.get("origin");if(origin && origin!==new URL(request.url).origin)
    return NextResponse.json({message:"Cross-origin request blocked"},{status:403});
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({message:"Invalid ID"},{status:400});
  const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({message:"Sign in"},{status:401});
  const {data:old}=await db.from("marketly_listing_drafts").select("image_paths,preview_paths")
    .eq("id",id).eq("seller_id",user.id).maybeSingle();
  if(!old)return NextResponse.json({message:"Draft not found"},{status:404});
  const {error}=await db.rpc("marketly_delete_listing_draft",{p_draft_id:id});
  if(error)return NextResponse.json({message:userFacingError(error, "save")},{status:400});
  const paths=[...(old.image_paths||[]),...(old.preview_paths||[])];
  if(paths.length)try {
    const {error:cleanupError}=await createAdminStorage().remove(paths);
    if(cleanupError)console.warn("[Marketly] deleted draft cleanup deferred",cleanupError.message);
  }catch(e){console.warn("[Marketly] draft storage cleanup deferred",e instanceof Error?e.message:"unknown");}
  return NextResponse.json({message:"Draft deleted"});
}
