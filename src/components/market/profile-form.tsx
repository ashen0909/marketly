"use client";

import { useRef, useState, type FormEvent } from "react";
import { userFacingError } from "@/lib/user-facing-error";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Camera, CheckCircle2, Info, KeyRound, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { emptyProfileDetails, profileCompletion, type ProfileDetails } from "@/lib/profile-completion";
import { normalizeSriLankanMobile } from "@/lib/profile-phone";
import { isKnownTown, otherTownValue, sriLankaDistricts, townsForDistrict } from "@/lib/sri-lanka-towns";
import { useMarketlyUi } from "@/components/market/marketly-ui-provider";

type Props = {
  initialName: string;
  initialDetails: ProfileDetails | null;
  initialPhotoUrl: string | null;
  email: string;
  emailVerified: boolean;
  verified: boolean;
};
type Field = "display_name" | "full_name" | "phone" | "district" | "city" | "about" | "contact_preference";
type FieldErrors = Partial<Record<Field, string>>;

function editableSnapshot(name: string, details: ProfileDetails) {
  return JSON.stringify({ name, full_name: details.full_name, phone: details.phone,
    district: details.district, city: details.city, about: details.about,
    contact_preference: details.contact_preference, email_notifications: details.email_notifications });
}

function validatePartialProfile(name: string, details: ProfileDetails): { errors: FieldErrors; normalizedPhone: string } {
  const errors: FieldErrors = {};
  if (name.trim().length < 2 || name.trim().length > 60) errors.display_name = "Display name must be 2–60 characters.";
  if (details.full_name.trim() && details.full_name.trim().length < 3) errors.full_name = "Enter at least 3 characters, or leave this blank for now.";
  const normalizedPhone = details.phone.trim() ? normalizeSriLankanMobile(details.phone) : "";
  if (details.phone.trim() && !normalizedPhone) errors.phone = "Use 0771234567 or +94771234567 (Sri Lankan mobile number).";
  if (details.district && !sriLankaDistricts.includes(details.district)) errors.district = "Choose a Sri Lankan district from the list.";
  if (details.city.trim() && !details.district) errors.city = "Choose a district before selecting a town.";
  if (details.city.trim() && details.city.trim().length < 2) errors.city = "Town must have at least 2 characters.";
  if (details.about.trim() && details.about.trim().length < 10) errors.about = "Add at least 10 characters, or leave this blank to complete later.";
  if (!["", "chat", "phone", "whatsapp"].includes(details.contact_preference)) errors.contact_preference = "Choose a contact preference from the list.";
  return { errors, normalizedPhone: normalizedPhone || "" };
}

export function ProfileForm({ initialName, initialDetails, initialPhotoUrl, email, emailVerified, verified }: Props) {
  const router = useRouter();
  const { toast, confirm } = useMarketlyUi();
  const [name, setName] = useState(initialName);
  const [details, setDetails] = useState<ProfileDetails>(initialDetails || emptyProfileDetails);
  const [savedName, setSavedName] = useState(initialName);
  const [savedDetails, setSavedDetails] = useState<ProfileDetails>(initialDetails || emptyProfileDetails);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [manualTown, setManualTown] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [emailNext, setEmailNext] = useState(email);
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);

  // Show progress live while editing, but do NOT unlock verification before saving.
  const result = profileCompletion(name, details);
  const storedProgress = profileCompletion(savedName, savedDetails);
  const isDirty = editableSnapshot(name, details) !== editableSnapshot(savedName, savedDetails);
  const canVerify = storedProgress.complete && !isDirty && emailVerified && !verified;
  const towns = townsForDistrict(details.district);
  const showOtherTown = manualTown || (!!details.city && !isKnownTown(details.district, details.city));

  function setField<K extends keyof ProfileDetails>(key: K, value: ProfileDetails[K], errorKey?: Field) {
    setDetails(previous => ({ ...previous, [key]: value }));
    if (errorKey) setFieldErrors(previous => ({ ...previous, [errorKey]: undefined }));
    setMessage("");
  }
  function onDistrictChange(district: string) {
    setDetails(previous => ({ ...previous, district, city: "" }));
    setManualTown(false);
    setFieldErrors(previous => ({ ...previous, district: undefined, city: undefined }));
    setMessage("");
  }
  function onTownChange(value: string) {
    if (value === otherTownValue) {
      setManualTown(true);
      setField("city", "", "city");
    } else {
      setManualTown(false);
      setField("city", value, "city");
    }
  }
  function fieldError(field: Field) {
    return fieldErrors[field] ? <p id={`${field}-error`} role="alert" className="mt-1.5 text-xs font-semibold text-red-700">{fieldErrors[field]}</p> : null;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(""); setMessage("");
    const checked = validatePartialProfile(name, details);
    setFieldErrors(checked.errors);
    const firstError = (Object.keys(checked.errors) as Field[])[0];
    if (firstError) {
      setError("Please correct the highlighted field, then save again. Incomplete fields can be left blank until later.");
      toast("Check the highlighted profile field", "error");
      requestAnimationFrame(() => document.getElementById(`profile-${firstError}`)?.focus());
      return;
    }
    setBusy("profile");
    const updated: ProfileDetails = { ...details, full_name: details.full_name.trim(),
      phone: checked.normalizedPhone, district: details.district, city: details.city.trim(),
      about: details.about.trim(), contact_preference: details.contact_preference };
    try {
      const { error: dbError } = await createBrowserSupabase().rpc("marketly_update_my_profile", {
        p_display_name: name.trim(), p_full_name: updated.full_name, p_phone: updated.phone,
        p_district: updated.district, p_city: updated.city, p_about: updated.about,
        p_contact_preference: updated.contact_preference, p_email_notifications: updated.email_notifications,
      });
      if (dbError) throw dbError;
      setName(name.trim()); setDetails(updated); setSavedName(name.trim()); setSavedDetails(updated);
      setFieldErrors({});
      setMessage("Your profile details were saved. You can complete the remaining fields later.");
      toast("Profile details saved", "success");
      router.refresh();
    } catch (err) {
      setError(userFacingError(err, "save"));
      toast("Profile save failed. Check the message under My details.", "error");
    } finally { setBusy(""); }
  }

  async function updatePhoto(file?: File) {
    if (!file) return;
    if (file.size > 2*1024*1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Select a JPG, PNG or WebP photo under 2 MB."); return;
    }
    setBusy("photo"); setError("");
    try {
      const form = new FormData(); form.set("photo", file);
      const res = await fetch("/api/profile/photo", { method: "POST", body: form });
      const json: { url?: string | null; message?: string } = await res.json();
      if (!res.ok) throw new Error(json.message || "Upload failed");
      setPhotoUrl(json.url || null);
      const { data: { user } } = await createBrowserSupabase().auth.getUser();
      if (user) {
        const { data } = await createBrowserSupabase().from("marketly_profile_details").select("photo_path").eq("user_id",user.id).maybeSingle();
        const path = data?.photo_path || null;
        setDetails(previous => ({ ...previous, photo_path: path }));
        setSavedDetails(previous => ({ ...previous, photo_path: path }));
      }
      toast("Profile photo updated", "success"); router.refresh();
    } catch (err) { setError(userFacingError(err, "save")); }
    finally { setBusy(""); if (photoRef.current) photoRef.current.value=""; }
  }

  async function removePhoto() {
    if (!await confirm({ title: "Remove profile photo?", description: "You can add a new photo later. This affects profile completion.", confirmLabel: "Remove photo", destructive: true })) return;
    setBusy("photo"); setError("");
    try {
      const res = await fetch("/api/profile/photo", { method: "DELETE" });
      const json: { message?: string } = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not remove photo");
      setDetails(old => ({ ...old, photo_path: null }));
      setSavedDetails(old => ({ ...old, photo_path: null }));
      setPhotoUrl(null);
      toast("Profile photo removed", "success"); router.refresh();
    } catch (err) { setError(userFacingError(err, "save")); }
    finally { setBusy(""); }
  }

  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("email"); setError(""); setMessage("");
    try {
      const { error: authError } = await createBrowserSupabase().auth.updateUser({ email: emailNext.trim() });
      if (authError) throw authError;
      setMessage("Check your email to confirm the address change before it takes effect.");
      toast("Email confirmation requested", "success");
    } catch (err) { setError(userFacingError(err, "save")); }
    finally { setBusy(""); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (newPassword.length < 8 || newPassword !== passwordConfirm) { setError("Passwords must match and contain at least 8 characters."); return; }
    setBusy("password");
    try {
      const { error: authError } = await createBrowserSupabase().auth.updateUser({ password: newPassword });
      if (authError) throw authError;
      setNewPassword(""); setPasswordConfirm(""); setMessage("Password updated successfully."); toast("Password updated", "success");
    } catch (err) { setError(userFacingError(err, "save")); }
    finally { setBusy(""); }
  }

  return <div className="min-w-0 space-y-6">
    <section aria-label="Profile completion" className="rounded-2xl border border-[#E8D8BE] bg-[#FFFBF4] p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><h2 className="text-lg font-extrabold">Profile completion</h2><p className="mt-1 text-sm text-stone-600">Fill the details below and save to request verification.</p></div>
        <span className="text-3xl font-extrabold text-[#956622]" aria-label={`${result.percentage} percent completed`}>{result.percentage}%</span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#E8E0D5]" role="progressbar" aria-valuenow={result.percentage} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion">
        <div className="h-full rounded-full bg-[#B88746] transition-all" style={{ width: `${result.percentage}%` }}/>
      </div>
      <p className="mt-2 text-xs text-stone-600">{result.done} of {result.total} required details completed {isDirty ? "· Unsaved changes" : "· Saved progress"}</p>
      {result.missing.length ? <div className="mt-4 rounded-xl bg-white p-3 text-sm"><strong>Still missing:</strong> {result.missing.join(", ")}</div>
        : <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="size-5"/> All profile fields filled</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className={emailVerified ? "text-emerald-700" : "text-amber-800"}>{emailVerified ? "✓ Email confirmed" : "Email confirmation required"}</span>
        <span aria-hidden="true">·</span>
        <span>{verified ? "Identity verified" : "Identity verification needs admin approval"}</span>
      </div>
      {canVerify ? <Link className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#24272E] px-5 py-3 text-sm font-bold text-white hover:bg-[#40444C]" href="/verification"><ShieldCheck className="size-4"/> Request verification</Link>
        : <p className="mt-3 rounded-xl bg-white p-3 text-xs text-stone-700">{verified ? "Your account has already been verified." : isDirty ? "Save your updated details first. Verification uses saved profile information." : !emailVerified ? "Confirm your email to request verification." : "Complete all 8 fields to request admin verification."}</p>}
    </section>

    <form onSubmit={save} noValidate className="min-w-0 space-y-5 rounded-2xl border bg-white p-4 shadow-sm sm:p-6" aria-label="My details">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-extrabold">My details</h2><span className="text-xs text-stone-500">* Required for verification, not for saving a draft profile</span></div>
      <div className="flex min-w-0 flex-wrap items-center gap-4 rounded-xl bg-[#FAF9F6] p-3 sm:p-4">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#D9BC86] bg-[#EEE1C7] text-2xl font-bold text-[#624617]">
          {photoUrl ? <Image src={photoUrl} alt="Your profile photo" width={80} height={80} unoptimized className="h-full w-full object-cover"/> : (name.trim().slice(0,1).toUpperCase() || "M")}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <span className="field-label">Profile photo</span>
          <input ref={photoRef} id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={!!busy}
            onChange={e => { void updatePhoto(e.target.files?.[0]); }} className="sr-only"/>
          <label htmlFor="profile-photo" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#24272E] px-4 text-sm font-bold text-white focus-within:outline-2 focus-within:outline-[#D0A352]"><Camera className="size-4"/>{photoUrl ? "Change photo" : "Choose photo"}</label>
          <p className="text-xs text-stone-500">JPG, PNG or WebP, under 2 MB. Kept private.</p>
          {details.photo_path && <button type="button" onClick={() => { void removePhoto(); }} disabled={!!busy} className="inline-flex min-h-9 items-center gap-1 text-xs font-bold text-red-700"><Trash2 className="size-3"/> Remove photo</button>}
        </div>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="block min-w-0"><span className="field-label">Display name *</span>
          <Input id="profile-display_name" minLength={2} maxLength={60} value={name} aria-invalid={!!fieldErrors.display_name} aria-describedby={fieldErrors.display_name ? "display_name-error" : undefined}
            onChange={e => { setName(e.target.value); setFieldErrors(prev => ({ ...prev, display_name: undefined })); setMessage(""); }}/>
          {fieldError("display_name")}</label>
        <label className="block min-w-0"><span className="field-label">Full name *</span>
          <Input id="profile-full_name" maxLength={100} value={details.full_name} aria-invalid={!!fieldErrors.full_name} aria-describedby={fieldErrors.full_name ? "full_name-error" : undefined}
            onChange={e => setField("full_name",e.target.value,"full_name")} placeholder="As on your identity record"/>
          {fieldError("full_name")}</label>
        <label className="block min-w-0"><span className="field-label">Mobile number *</span>
          <Input id="profile-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={details.phone}
            aria-invalid={!!fieldErrors.phone} aria-describedby={fieldErrors.phone ? "phone-error" : "phone-help"}
            onChange={e => setField("phone",e.target.value,"phone")}
            onBlur={() => { if (details.phone.trim()) { const normalized=normalizeSriLankanMobile(details.phone); if(normalized) setField("phone",normalized,"phone"); } }}
            placeholder="0771234567 or +94771234567"/>
          <span id="phone-help" className="field-help block">Local 07 numbers are automatically converted to +94. Adding a number does not verify it.</span>
          {fieldError("phone")}</label>
        <label className="block min-w-0"><span className="field-label">District *</span>
          <select id="profile-district" className="field-control min-w-0" value={details.district} aria-invalid={!!fieldErrors.district}
            onChange={e => onDistrictChange(e.target.value)}><option value="">Select district</option>{sriLankaDistricts.map(item=><option value={item} key={item}>{item}</option>)}</select>
          {fieldError("district")}</label>
        <div className="min-w-0 space-y-2">
          <label htmlFor="profile-city" className="field-label">City / Town *</label>
          <select id="profile-city" className="field-control min-w-0" value={showOtherTown ? otherTownValue : details.city}
            disabled={!details.district} aria-invalid={!!fieldErrors.city} onChange={e => onTownChange(e.target.value)}>
            <option value="">{details.district ? "Choose town in your district" : "Choose district first"}</option>
            {towns.map(town=><option key={town} value={town}>{town}</option>)}
            {details.district && <option value={otherTownValue}>Other town (enter manually)</option>}
          </select>
          {showOtherTown && <label htmlFor="profile-custom-town" className="block"><span className="field-help block">Your town is not listed? Enter its name.</span>
            <Input id="profile-custom-town" maxLength={80} value={details.city} placeholder="Type your town / village" aria-invalid={!!fieldErrors.city}
              onChange={e => setField("city",e.target.value,"city")}/></label>}
          {fieldError("city")}
        </div>
        <label className="block min-w-0"><span className="field-label">Preferred contact *</span>
          <select id="profile-contact_preference" className="field-control min-w-0" value={details.contact_preference} aria-invalid={!!fieldErrors.contact_preference}
            onChange={e => setField("contact_preference",e.target.value,"contact_preference")}><option value="">Choose preference</option><option value="chat">Marketly chat</option><option value="phone">Phone (private by default)</option><option value="whatsapp">WhatsApp (private by default)</option></select>
          {fieldError("contact_preference")}</label>
      </div>
      <label className="block min-w-0"><span className="field-label">About me *</span>
        <textarea id="profile-about" className="field-control min-h-28 min-w-0 resize-y" maxLength={500} value={details.about} aria-invalid={!!fieldErrors.about}
          onChange={e => setField("about",e.target.value,"about")} placeholder="Tell buyers what you sell (at least 10 characters)."/>
        <span className="field-help block text-right">{details.about.length}/500 characters</span>
        {fieldError("about")}</label>
      <label className="flex min-w-0 items-start gap-3 rounded-xl border p-3 text-sm"><input type="checkbox" checked={details.email_notifications}
        onChange={e => setField("email_notifications",e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#B88746]"/>
        <span>Email notifications (saved as a preference for future email integration)</span></label>
      <p className="text-xs text-stone-600">Your legal name, phone and personal details are private. Changing a verified legal name requires another identity review.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {message && <p className="success-text" role="status">{message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!!busy} className="min-h-12 w-full sm:w-auto"><Save className="size-4"/>{busy==="profile" ? "Saving details..." : "Save profile details"}</Button>
        {isDirty && <span className="flex items-center gap-1 text-xs font-semibold text-amber-800"><Info className="size-4"/>Unsaved changes</span>}
      </div>
    </form>

    <section className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm sm:p-6"><h2 className="mb-4 text-xl font-extrabold">Account & security</h2>
      <form onSubmit={changeEmail} className="space-y-3"><label className="field-label" htmlFor="profile-email">Email address</label>
        <Input id="profile-email" type="email" value={emailNext} onChange={e=>setEmailNext(e.target.value)} required/>
        <p className="text-xs text-stone-600">Current address: {email}. Changes require email confirmation.</p>
        <Button type="submit" variant="outline" disabled={!!busy || emailNext.trim()===email}>Request email change</Button></form>
      <form onSubmit={changePassword} className="mt-6 space-y-3 border-t pt-5"><h3 className="flex items-center gap-2 font-bold"><KeyRound className="size-4"/> Change password</h3>
        <div className="grid gap-3 sm:grid-cols-2"><Input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/>
          <Input type="password" autoComplete="new-password" placeholder="Confirm new password" minLength={8} value={passwordConfirm} onChange={e=>setPasswordConfirm(e.target.value)}/></div>
        <Button type="submit" variant="outline" disabled={!!busy || !newPassword}>Update password</Button></form>
      <p className="mt-4 text-xs text-stone-500">Legal name, email and account security details are not shown on public seller profiles.</p>
    </section>
  </div>;
}
