"use client";
import { useState, type FormEvent } from "react";
import { userFacingError } from "@/lib/user-facing-error";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, UserRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabase, hasSupabaseConfig } from "@/lib/supabase/browser";

export function LoginForm({ postLoginPath = "/dashboard" }: { postLoginPath?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const connected = hasSupabaseConfig();
  async function requestReset() {
    setError("");setNotice("");
    if (!email.trim()) {setError("Enter your email address first.");return;}
    setLoading(true);
    try {
      const {error:resetError}=await createBrowserSupabase().auth.resetPasswordForEmail(email.trim(), {
        redirectTo:`${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if(resetError)throw resetError;
      setNotice("If this email belongs to an account, a password reset link has been requested. Check your inbox.");
    }catch(e){setError(userFacingError(e, "login"));}
    finally{setLoading(false);}
  }


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    if (!connected) { setError("Connect Supabase to activate registration."); return; }
    if (password.length < 8) { setError("Use a password of at least 8 characters."); return; }
    if (mode === "register" && name.trim().length < 2) { setError("Your name must be at least 2 characters."); return; }
    setLoading(true);
    try {
      const supabase = createBrowserSupabase();
      if (mode === "register") {
        const { data, error: authError } = await supabase.auth.signUp({
          email, password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/profile`,
          },
        });
        if (authError) throw authError;
        if (!data.session) { setNotice("Check your email and click Confirm account. If you do not receive a message, review the Supabase email settings."); return; }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
      router.replace(mode === "register" ? "/profile?welcome=1" : postLoginPath); router.refresh();
    } catch (err) { setError(userFacingError(err, "login")); }
    finally { setLoading(false); }
  }

  return <div className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
    <div className="mb-7 text-center"><div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#FBF2E4] text-[#AA782C]"><ShieldCheck className="size-8"/></div><h1 className="text-2xl font-extrabold">{mode === "sign-in" ? "Welcome back" : "Create your account"}</h1><p className="mt-2 text-sm text-[#68707C]">One account for buying and selling. Complete your profile now or later.</p></div>
    {!connected && <div className="mb-5 rounded-xl bg-[#FFF4DF] p-3 text-sm text-amber-900">Local development preview: connect Supabase to activate real user accounts.</div>}
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === "register" && <div><label className="field-label" htmlFor="name">Display name</label><div className="relative"><UserRound className="pointer-events-none absolute left-3 top-3.5 size-5 text-stone-400"/><Input id="name" value={name} onChange={e=>setName(e.target.value)} autoComplete="name" maxLength={60} required className="pl-10" placeholder="Your full name"/></div></div>}
      <div><label className="field-label" htmlFor="email">Email address</label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-3.5 size-5 text-stone-400"/><Input id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required className="pl-10" placeholder="you@example.com"/></div></div>
      <div><label className="field-label" htmlFor="password">Password</label><div className="relative"><Lock className="pointer-events-none absolute left-3 top-3.5 size-5 text-stone-400"/><Input id="password" type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required className="pl-10" placeholder="At least 8 characters"/></div></div>
      {error && <p className="error-text" role="alert">{error}</p>}{notice && <p className="success-text" role="status">{notice}</p>}
      <Button type="submit" disabled={loading || !connected} className="w-full">{loading ? "Working..." : mode === "sign-in" ? "Sign In" : "Create Account"}</Button>
    </form>
    {mode === "sign-in" && <button type="button" disabled={loading || !connected} onClick={()=>{void requestReset();}} className="mt-4 block w-full text-center text-sm font-semibold text-[#9C6F2E] underline">Forgot your password?</button>}
    <p className="mt-6 text-center text-sm text-[#68707C]">{mode === "sign-in" ? "New to Marketly?" : "Already registered?"} <button type="button" onClick={()=>{setMode(mode === "sign-in" ? "register" : "sign-in");setError("");setNotice("");}} className="font-semibold text-[#A3722F]">{mode === "sign-in" ? "Create account" : "Sign in"}</button></p>
    <p className="mt-5 text-center text-xs text-[#68707C]">Your public seller badge is not identity verified by registration alone.</p>
    <Link className="mt-3 block text-center text-sm text-stone-600 underline" href="/">Back to home</Link>
  </div>;
}
