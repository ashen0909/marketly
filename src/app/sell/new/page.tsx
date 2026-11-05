import type {Metadata} from "next";
import {SellForm} from "@/components/market/sell-form";
import {createServerSupabase,hasSupabaseConfig} from "@/lib/supabase/server";
import {sriLankaBillingMonth} from "@/lib/billing-month";
import type {SavedDraft} from "@/lib/listing-drafts";
export const metadata: Metadata={title:"Post or resume an advertisement"};
export const dynamic="force-dynamic";
export default async function PostAdPage({searchParams}:{searchParams:Promise<{draft?:string}>}){
  const {draft:requestedDraft}=await searchParams;
  let canPublish=false;let quotaUsed=0;let ownerBenefits=false;let draft:SavedDraft|null=null;let existingTitles:string[]=[];
  if(hasSupabaseConfig()){
    const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();
    if(user){
      canPublish=true;
      const [quota,adTitles,savedDraft,adminAccess]=await Promise.all([
        db.from("listing_post_ledger").select("id",{count:"exact",head:true}).eq("seller_id",user.id).eq("billing_month",sriLankaBillingMonth()),
        db.from("listings").select("title").eq("seller_id",user.id).neq("status","deleted").limit(500),
        requestedDraft && /^[0-9a-f-]{36}$/i.test(requestedDraft) ? db.from("marketly_listing_drafts")
          .select("id,title,description,price_lkr,category,location,condition,is_negotiable,image_paths,preview_paths,updated_at")
          .eq("id",requestedDraft).eq("seller_id",user.id).maybeSingle() : Promise.resolve({data:null}),
        db.rpc("marketly_admin_access"),
      ]);
      quotaUsed=quota.count??0;ownerBenefits=adminAccess.data?.ownerBenefits === true;existingTitles=(adTitles.data??[]).map(item=>item.title);
      draft=(savedDraft.data??null) as SavedDraft|null;
    }
  }
  return <main className="bg-[#FBFAF8] px-4 py-10 sm:px-6"><div className="mx-auto max-w-6xl"><div className="mb-7"><p className="text-sm font-bold uppercase tracking-widest text-[#A3722F]">Seller workspace</p><h1 className="mt-2 text-3xl font-extrabold">{draft?"Continue saved draft":"Post a new advertisement"}</h1><p className="mt-2 text-[#68707C]">Save unfinished details, arrange photos, preview your ad and submit for review when ready.</p></div>
    {requestedDraft&&!draft&&<p role="alert" className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Requested draft not found in your account. Start a new one below.</p>}
    <SellForm key={draft?.id??"new"} canPublish={canPublish} quotaUsed={quotaUsed} ownerBenefits={ownerBenefits} draft={draft} existingTitles={existingTitles}/></div></main>;
}
