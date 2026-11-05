"use client";
import { useState, type FormEvent } from "react";
import { userFacingError } from "@/lib/user-facing-error";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function ResetPassword() {
 const router=useRouter();const [password,setPassword]=useState("");const [repeat,setRepeat]=useState("");
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [done,setDone]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setError("");
  if(password.length<8||password!==repeat){setError("Use matching passwords at least 8 characters long.");return;}
  setBusy(true);
  try{
   const client=createBrowserSupabase();const {data:{user}}=await client.auth.getUser();
   if(!user)throw new Error("Open the password recovery link from your email first.");
   const {error:authErr}=await client.auth.updateUser({password});if(authErr)throw authErr;
   setDone(true);setPassword("");setRepeat("");router.refresh();
  }catch(err){setError(userFacingError(err, "login"));}
  finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-md px-4 py-16"><div className="rounded-2xl border bg-white p-6 shadow-sm"><h1 className="text-2xl font-extrabold">Set a new password</h1>
  <p className="mt-2 text-sm text-stone-600">Use the password reset email link to authorize your change.</p>
  {done?<p className="success-text mt-6">Password updated. <Link href="/profile" className="font-bold underline">Return to profile</Link>.</p>:
   <form onSubmit={submit} className="mt-6 space-y-4"><Input type="password" autoComplete="new-password" minLength={8} required placeholder="New password" value={password} onChange={e=>setPassword(e.target.value)}/>
   <Input type="password" autoComplete="new-password" minLength={8} required placeholder="Confirm new password" value={repeat} onChange={e=>setRepeat(e.target.value)}/>
   {error&&<p className="error-text" role="alert">{error}</p>}
   <Button type="submit" disabled={busy} className="w-full">{busy?"Updating...":"Update password"}</Button></form>}
 </div></main>;
}
