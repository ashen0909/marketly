export type ProfileDetails = {
  full_name: string; phone: string; district: string; city: string;
  about: string; contact_preference: string; photo_path: string | null;
  email_notifications: boolean;
};
export const emptyProfileDetails: ProfileDetails = {
  full_name: "", phone: "", district: "", city: "", about: "",
  contact_preference: "", photo_path: null, email_notifications: true,
};
export const PROFILE_FIELDS = ["Display name", "Full name", "Phone", "District", "City", "About", "Contact preference", "Profile photo"] as const;
export function profileCompletion(displayName: string, details: ProfileDetails) {
  const complete = [
    displayName.trim().length >= 2,
    details.full_name.trim().length >= 3,
    /^\+947\d{8}$/.test(details.phone.trim()),
    details.district.trim().length > 0,
    details.city.trim().length >= 2,
    details.about.trim().length >= 10,
    ["chat", "phone", "whatsapp"].includes(details.contact_preference),
    !!details.photo_path,
  ];
  return { percentage: Math.round(100 * complete.filter(Boolean).length / complete.length),
    done: complete.filter(Boolean).length, total: complete.length,
    missing: PROFILE_FIELDS.filter((_, index) => !complete[index]), complete: complete.every(Boolean) };
}
