"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    const value = name.trim();
    if (value.length < 2 || value.length > 60) {
      setError("Display name must be 2–60 characters."); return;
    }
    setBusy(true);
    try {
      // Database RPC updates ONLY the current user's name; identity_verified cannot be edited.
      const { error: dbError } = await createBrowserSupabase().rpc("update_my_display_name", { p_display_name: value });
      if (dbError) throw dbError;
      setName(value);
      setMessage("Profile updated. Your name now appears in the header and your seller listings.");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update your name.";
      setError(msg.includes("update_my_display_name") ? "Run the 002 profile SQL migration in Supabase, then try again." : msg);
    } finally { setBusy(false); }
  }

  return <form onSubmit={save} className="mt-5 space-y-4">
    <div>
      <label className="field-label" htmlFor="profile-name">Display name</label>
      <Input id="profile-name" name="display_name" autoComplete="name" required minLength={2} maxLength={60} value={name} onChange={e => setName(e.target.value)} />
    </div>
    {error && <p className="error-text" role="alert">{error}</p>}
    {message && <p className="success-text" role="status">{message}</p>}
    <Button type="submit" disabled={busy}><Save className="size-4"/>{busy ? "Saving..." : "Save profile"}</Button>
  </form>;
}
