"use client";
import {useState, type FormEvent} from "react";
import {createBrowserSupabase} from "@/lib/supabase/browser";

/** Uses Supabase Auth's phone-change challenge, not a client-side "verified" flag. */
export function PhoneVerification(){
  const [phone,setPhone]=useState(""),[token,setToken]=useState(""),[stage,setStage]=useState<"phone"|"otp"|"verified">("phone");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function send(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");
    try{
      if(!/^\+94[1-9]\d{8}$/.test(phone))throw new Error("Use +94XXXXXXXXX (Sri Lankan mobile number).");
      const {error}=await createBrowserSupabase().auth.updateUser({phone});if(error)throw new Error(error.message);
      setStage("otp");setMessage("If your project's SMS provider is configured, an OTP has been sent.");
    }catch(e){setMessage(e instanceof Error?e.message:"OTP request failed");}finally{setBusy(false);}
  }
  async function confirm(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");
    try{const {error}=await createBrowserSupabase().auth.verifyOtp({phone,token,type:"phone_change"});
      if(error)throw new Error(error.message);
      setStage("verified");setMessage("Phone verification succeeded through Supabase Auth.");
    }catch(e){setMessage(e instanceof Error?e.message:"Verification failed");}finally{setBusy(false);}
  }
  return <div className="mt-6 rounded-2xl border bg-white p-6">
    <h2 className="text-lg font-bold">Verify phone via SMS OTP</h2>
    <p className="mt-2 text-sm text-stone-600">This requires SMS/Phone Auth enabled in your Supabase project. Phone verification does not mean identity verification.</p>
    {stage==="phone"&&<form onSubmit={send} className="mt-4 flex flex-wrap gap-2"><input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+94771234567" className="field-control flex-1"/><button disabled={busy} className="rounded-lg bg-[#24272E] px-5 py-2 font-semibold text-white">Send OTP</button></form>}
    {stage==="otp"&&<form onSubmit={confirm} className="mt-4 flex flex-wrap gap-2"><input required inputMode="numeric" value={token} onChange={e=>setToken(e.target.value.replace(/\D/g,""))} placeholder="SMS code" className="field-control flex-1"/><button disabled={busy} className="rounded-lg bg-[#24272E] px-5 py-2 font-semibold text-white">Verify SMS</button></form>}
    {stage==="verified"&&<p className="mt-3 font-bold text-emerald-700">Phone verified</p>}
    {message&&<p role="status" className="mt-3 text-sm text-stone-600">{message}</p>}
  </div>;
}
