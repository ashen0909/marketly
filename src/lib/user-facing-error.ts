/**
 * Convert database/auth/API errors into safe, readable interface messages.
 * Never show arbitrary exception text to buyers or sellers. Keep raw details in
 * restricted server logs for troubleshooting.
 */
export type PublicErrorContext = "general" | "save" | "upload" | "message" | "billing" | "login" | "verification";

const defaults: Record<PublicErrorContext, string> = {
  general: "Something went wrong. Please try again.",
  save: "We couldn't save your changes. Please try again.",
  upload: "We couldn't upload your photo. Check the file and try again.",
  message: "Your message wasn't sent. Please try again.",
  billing: "The test checkout couldn't finish. Please try again.",
  login: "We couldn't complete sign-in. Check your details and try again.",
  verification: "We couldn't submit your verification request. Please try again.",
};

const publicCodeMessages: Record<string,string> = {
  NOT_AUTHENTICATED: "Your session has expired. Sign in again to continue.",
  LOGIN_REQUIRED: "Sign in to continue.",
  NOT_PARTICIPANT: "You don't have access to this conversation.",
  NOT_CONVERSATION_PARTICIPANT: "You don't have access to this conversation.",
  CHAT_CLOSED_ITEM_UNAVAILABLE: "This item isn't available for chat. If it's relisted, wait for admin approval.",
  CHAT_BLOCKED: "This conversation is blocked. Unblock it to send messages.",
  MESSAGE_RATE_LIMIT: "You're sending messages too quickly. Please try again shortly.",
  REPORT_LIMIT_ONE_PER_DAY: "You can report this conversation once every 24 hours.",
  INVALID_REPORT: "Choose a reason before reporting this conversation.",
  LISTING_NOT_AVAILABLE: "This advertisement is not available right now.",
  AD_NOT_AVAILABLE: "This advertisement is not available right now.",
  DUPLICATE_ACTIVE_AD_TITLE: "You already have an active ad with this title. Change the title or edit that ad.",
  FREE_AD_QUOTA_EXCEEDED_RENEWAL: "Your free monthly posting limit has been reached.",
  MAX_FIVE_FREE_PHOTOS: "You can publish up to five free photos while real image payments are disabled.",
  MAX_TEN_DRAFTS: "You have ten drafts. Remove a draft before saving another.",
  DRAFT_NOT_FOUND_OR_NOT_YOURS: "This draft isn't available. Return to My Ads and try again.",
  PENDING_OFFER_EXISTS: "There's already a pending offer for this conversation.",
  OFFER_NOT_PENDING: "This offer is no longer pending.",
  CANNOT_CONTACT_YOURSELF: "You can't start a conversation with your own ad.",
  INVALID_MESSAGE: "Enter a message before sending.",
  ADMIN_REQUIRED: "Only a Marketly administrator can perform this action.",
  OWNER_ONLY: "Only the Marketly Owner can manage Sub Admins and owner benefits.",
  ADMIN_PERMISSION_REQUIRED: "Your administrator role does not allow this action.",
  SELF_REVIEW_NOT_ALLOWED: "You cannot review your own listing or request. Another authorized administrator must handle it.",
  REGISTERED_USER_REQUIRED: "The person needs a registered Marketly account before becoming a Sub Admin.",
  SUB_ADMIN_NOT_FOUND: "This Sub Admin is no longer available. Refresh the team list.",
  SELECT_VALID_PERMISSIONS: "Choose at least one valid permission.",
  OWNER_PROTECTED: "The Owner account cannot be edited by Sub Admin tools.",
  VALID_EMAIL_REQUIRED: "Enter a valid registered email address.",
  OWN_APPROVED_ACTIVE_LISTING_REQUIRED: "Choose one of your own approved, active ads to apply a free boost.",

};

const approvedPrefixes = [
  "Please ", "Enter ", "Select ", "Use ", "Choose ", "Your ",
  "This ", "You ", "No active ", "Sign in ", "Only ",
  "Passwords ", "Too many ", "The photo ", "Maximum ",
];

export function userFacingError(error: unknown, context: PublicErrorContext = "general"): string {
  const raw = error instanceof Error ? error.message :
    typeof error === "string" ? error :
    error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
  const normalized = raw.trim().toUpperCase();
  if (publicCodeMessages[normalized]) return publicCodeMessages[normalized];
  const lower = raw.toLowerCase();
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|offline|econnreset|timeout|timed out/.test(lower)) {
    return "Connection problem. Check your internet and try again.";
  }
  if (/session|jwt expired|refresh token|not authenticated|not authorized|unauthorized|auth session missing|invalid login credentials/.test(lower)) {
    return /invalid login credentials/.test(lower) ? "Incorrect email or password. Please try again." : "Your session has expired. Sign in again to continue.";
  }
  if (/rate limit|too many requests|over_request_rate_limit|429/.test(lower)) {
    return "Too many attempts. Please wait a moment before trying again.";
  }
  if (/file too large|payload too large|exceeds.*size|413/.test(lower)) {
    return "That file is too large. Choose a smaller image and try again.";
  }
  if (/duplicate key|unique constraint|23505/.test(lower)) {
    return "This information is already in use. Check the details and try again.";
  }
  if (/permission denied|row-level security|42501|403|forbidden/.test(lower)) {
    return "You don't have permission to do that. Sign in or check your account.";
  }
  // Unknown uppercase exception codes and SQL/PostgREST internals are never UI copy.
  if (/^[A-Z][A-Z0-9_]{2,80}$/.test(raw.trim()) ||
      /(?:pgrst\d+|sqlstate|rpc|postgres|supabase|relation|column|record\s+"|stack trace|undefined is not|internal server error)/i.test(raw)) {
    return defaults[context];
  }
  // Reuse only our own clear, nontechnical field-validation feedback.
  if (raw.length <= 160 && approvedPrefixes.some(prefix => raw.startsWith(prefix)) &&
      !/[{}<>\n\r]/.test(raw) && !/\b(?:sql|insert|database|table|code|token|stack|api|http)\b/i.test(raw)) {
    return raw;
  }
  return defaults[context];
}
