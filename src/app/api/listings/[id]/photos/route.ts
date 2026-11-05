import {NextResponse} from "next/server";
import { userFacingError } from "@/lib/user-facing-error";
import {z} from "zod";
import {createServerSupabase} from "@/lib/supabase/server";
import {createAdminStorage} from "@/lib/supabase/storage-admin";
export const runtime="nodejs";
const schema=z.object({paths:z.array(z.string().min(1).max(1024)).min(1).max(5)});
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)
    return NextResponse.json({message:"Cross-origin request blocked"},{status:403});
  const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({message:"Invalid ID"},{status:400});
  const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({message:"Sign in"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({message:"Select 1–5 owned photos"},{status:400});
  const {data:removed,error}=await db.rpc("marketly_manage_listing_photos",{
    p_listing_id:id,p_ordered_paths:parsed.data.paths,
  });
  if(error)return NextResponse.json({message:userFacingError(error, "upload")},{status:400});
  if(Array.isArray(removed)&&removed.length){
    try {const {error:cleanup}=await createAdminStorage().remove(removed);
      if(cleanup)console.warn("[Marketly] listing photo cleanup deferred",cleanup.message);
    }catch(e){console.warn("[Marketly] photo cleanup deferred",e instanceof Error?e.message:"unknown");}
  }
  return NextResponse.json({message:"Photo order saved",reviewRequired:Array.isArray(removed)&&removed.length>0});
}
