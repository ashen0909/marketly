import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
export const runtime="nodejs";
export async function POST(request: Request,{params}:{params:Promise<{id:string}>}) {
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)
    return NextResponse.json({message:"Cross-origin request blocked"},{status:403});
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({message:"Invalid ID"},{status:400});
  const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({message:"Sign in"},{status:401});
  const {data:listingId,error}=await db.rpc("marketly_submit_listing_draft",{p_draft_id:id});
  if(error){
    const message=error.message;
    return NextResponse.json({message},{status:/QUOTA|DUPLICATE/.test(message)?409:400});
  }
  return NextResponse.json({id:listingId,message:"Submitted for admin review"},{status:201});
}
