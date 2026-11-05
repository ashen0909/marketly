"use client";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { ADMIN_PERMISSION_LABELS, type AdminPermission } from "@/lib/admin-access";
import { userFacingError } from "@/lib/user-facing-error";
import { useMarketlyUi } from "@/components/market/marketly-ui-provider";
import { ShieldCheck, UserPlus, RefreshCcw, Trash2 } from "lucide-react";

type AdminRow = { user_id:string;display_name:string;email:string;role:"owner"|"sub_admin";is_active:boolean;permissions:AdminPermission[];created_at:string };
type FoundUser = { id:string;display_name:string;email:string };
const suggested: AdminPermission[]=["listings","reports"];

export function SubAdminManager(){
 const {confirm,toast}=useMarketlyUi();
 const [admins,setAdmins]=useState<AdminRow[]>([]);
 const [email,setEmail]=useState("");const [found,setFound]=useState<FoundUser|null>(null);
 const [permissions,setPermissions]=useState<AdminPermission[]>(suggested);
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
 async function load(){const {data,error}=await createBrowserSupabase().rpc("marketly_owner_list_admins");if(error)throw error;setAdmins((data??[]) as AdminRow[]);}
 useEffect(()=>{void (async()=>{try{await load();}catch(e){setError(userFacingError(e,"general"));}finally{setLoading(false);}})();},[]);
 async function lookup(){if(busy)return;setError("");setFound(null);setBusy(true);
  try{const {data,error}=await createBrowserSupabase().rpc("marketly_owner_find_user",{p_email:email.trim()});if(error)throw error;
   const row=(data??[])[0] as FoundUser|undefined;
   if(!row){setError("No registered Marketly account matches that email. Ask the person to sign up first.");return;}
   if(admins.some(a=>a.user_id===row.id&&a.role==="owner")){setError("Owner account cannot be edited here.");return;}
   const current=admins.find(a=>a.user_id===row.id);
   setFound(row);setPermissions(current?.permissions??suggested);
  }catch(e){setError(userFacingError(e,"general"));}finally{setBusy(false);}
 }
 function toggle(id:AdminPermission,enabled:boolean){setPermissions(prev=>enabled?[...prev,id]:prev.filter(p=>p!==id));}
 async function apply(id:string,action:"save"|"activate"|"suspend"|"remove",chosen:AdminPermission[]=permissions){
  if(busy)return;
  if((action==="save" && chosen.length===0)){setError("Choose at least one permission.");return;}
  if((action==="remove"||action==="suspend") && !await confirm({title:action==="remove"?"Remove Sub Admin access?":"Suspend this Sub Admin?",description:"Their personal account, ads, chats and purchases will remain untouched. Only administrative access changes.",confirmLabel:action==="remove"?"Remove admin access":"Suspend access"}))return;
  setBusy(true);setError("");
  try{const {error}=await createBrowserSupabase().rpc("marketly_owner_manage_sub_admin",{p_user_id:id,p_action:action,p_permissions:action==="save"?chosen:[]});if(error)throw error;
   toast(`Sub Admin ${action} successful`,"success");await load();setFound(null);setEmail("");
  }catch(e){setError(userFacingError(e,"general"));}finally{setBusy(false);}
 }
 return <div className="space-y-6">
  <section className="rounded-2xl border border-[#E8DFD2] bg-white p-5 sm:p-7"><div className="flex items-start gap-3"><UserPlus className="mt-1 size-6 text-[#A3722F]"/><div><h2 className="text-xl font-extrabold">Add or edit a Sub Admin</h2><p className="mt-1 text-sm text-stone-600">Use an existing Marketly member&apos;s exact email. No passwords are shared or created.</p></div></div>
   <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={e=>{e.preventDefault();void lookup();}}><label htmlFor="admin-email" className="sr-only">Registered member email</label><input id="admin-email" className="field-control min-w-0 flex-1" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="off" placeholder="member@example.com"/><button className="rounded-xl bg-[#24272E] px-5 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={busy||!email.trim()} type="submit">{busy?"Checking...":"Find member"}</button></form>
   {found&&<div className="mt-5 rounded-2xl border border-[#DFCBA6] bg-[#FFFCF5] p-4"><p className="font-bold">{found.display_name||"Marketly member"}</p><p className="mt-1 break-all text-xs text-stone-600">{found.email}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{ADMIN_PERMISSION_LABELS.map(p=><label key={p.id} className="flex cursor-pointer gap-3 rounded-xl border bg-white p-3"><input type="checkbox" checked={permissions.includes(p.id)} onChange={e=>toggle(p.id,e.target.checked)} className="mt-1 size-4 accent-[#B88746]"/><span><strong className="block text-sm">{p.label}</strong><span className="mt-1 block text-xs text-stone-500">{p.detail}</span></span></label>)}</div><button type="button" className="mt-4 rounded-xl bg-[#24272E] px-5 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={busy||!permissions.length} onClick={()=>void apply(found.id,"save")}>Save Sub Admin permissions</button></div>}
  </section>
  <section className="rounded-2xl border border-[#E8DFD2] bg-white p-5 sm:p-7"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-extrabold">Admin team</h2><button type="button" onClick={()=>void (async()=>{setLoading(true);setError("");try{await load();}catch(e){setError(userFacingError(e,"general"));}finally{setLoading(false);}})()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm" disabled={busy||loading}><RefreshCcw className="size-4"/>Refresh</button></div>
   {loading?<p className="mt-4 text-sm text-stone-500">Loading admin team...</p>:<div className="mt-4 space-y-3">{admins.map(a=><article key={a.user_id} className="rounded-xl border border-[#E7E0D6] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="flex items-center gap-2 font-bold"><ShieldCheck className="size-4 text-[#AE8138]"/>{a.display_name||"Marketly member"} <span className="rounded-full bg-[#F5ECD9] px-2 py-1 text-[10px] font-bold uppercase text-[#77551E]">{a.role==="owner"?"Owner":"Sub Admin"}</span></p><p className="mt-1 break-all text-xs text-stone-500">{a.email}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${a.is_active?"bg-emerald-50 text-emerald-800":"bg-stone-100 text-stone-600"}`}>{a.is_active?"Active":"Suspended"}</span></div><p className="mt-3 text-xs text-stone-600">{a.role==="owner"?"All permissions + Owner benefits":a.permissions.map(p=>ADMIN_PERMISSION_LABELS.find(k=>k.id===p)?.label??p).join(" · ")}</p>
    {a.role==="sub_admin"&&<div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>{setFound({id:a.user_id,email:a.email,display_name:a.display_name});setEmail(a.email);setPermissions(a.permissions);document.getElementById("admin-email")?.focus();}} className="rounded-lg border border-[#B88746] px-3 py-2 text-xs font-bold">Edit permissions</button><button type="button" disabled={busy} onClick={()=>void apply(a.user_id,a.is_active?"suspend":"activate")} className="rounded-lg border px-3 py-2 text-xs font-semibold">{a.is_active?"Suspend":"Activate"}</button><button type="button" disabled={busy} onClick={()=>void apply(a.user_id,"remove")} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"><Trash2 className="size-3"/>Remove access</button></div>}
   </article>)}</div>}
  </section>
  {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</p>}
 </div>;
}
