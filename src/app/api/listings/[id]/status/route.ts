import {NextResponse} from "next/server";
import { userFacingError } from "@/lib/user-facing-error";
import {createServerSupabase,hasSupabaseConfig} from "@/lib/supabase/server";
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  if(!hasSupabaseConfig())return NextResponse.json({message:"Not configured"},{status:503});
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({message:"Cross-origin blocked"},{status:403});
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({message:"Invalid listing ID"},{status:400});
  const body=await request.json().catch(()=>null);if(!["sold","pause","relist","delete"].includes(body?.status))return NextResponse.json({message:"Unsupported action"},{status:400});
  const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({message:"Sign in"},{status:401});
  const {error}=await db.rpc("marketly_change_listing_status",{p_listing_id:id,p_action:body.status});
  return error?NextResponse.json({message:userFacingError(error, "save")},{status:403}):NextResponse.json({message:"Listing updated"},{headers:{"Cache-Control":"no-store"}});
}
