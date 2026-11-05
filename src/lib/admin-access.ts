/** Public-facing, SELF-only privilege summary from a database SECURITY DEFINER RPC.
 * Never treat this UI summary as authorization; database RPCs and RLS enforce permissions.
 */
export type AdminPermission = "listings" | "reports" | "chat_reports" | "verification" | "billing_view" | "audit_view";
export type AdminAccess = { role: "user" | "owner" | "sub_admin"; permissions: AdminPermission[]; ownerBenefits: boolean; isAdmin: boolean };
export const NO_ADMIN_ACCESS: AdminAccess = { role: "user", permissions: [], ownerBenefits: false, isAdmin: false };
export const ADMIN_PERMISSION_LABELS: { id: AdminPermission; label: string; detail: string }[] = [
 {id:"listings", label:"Advertisement reviews", detail:"Approve or reject pending ads"},
 {id:"reports", label:"Reported ads", detail:"Review, hide and resolve listing reports"},
 {id:"chat_reports", label:"Chat reports", detail:"Review conversation reports without opening private chat content"},
 {id:"verification", label:"Seller verification", detail:"Approve only after a separate authorized identity check"},
 {id:"billing_view", label:"Billing overview", detail:"Read-only sandbox summary; no payment actions"},
 {id:"audit_view", label:"Admin activity", detail:"Read all moderation audit events"},
];
export function normalizeAdminAccess(data: unknown): AdminAccess {
 if (!data || typeof data !== "object") return NO_ADMIN_ACCESS;
 const value = data as Record<string, unknown>;
 const role = value.role === "owner" || value.role === "sub_admin" ? value.role : "user";
 const valid = new Set<string>(ADMIN_PERMISSION_LABELS.map(x=>x.id));
 const permissions = Array.isArray(value.permissions) ? value.permissions.filter((x):x is AdminPermission=>typeof x==="string" && valid.has(x)) : [];
 return { role, permissions, ownerBenefits: role === "owner" && value.ownerBenefits === true, isAdmin: (role === "owner" || role === "sub_admin") && value.isAdmin === true };
}
export function adminCan(access: AdminAccess, permission: AdminPermission): boolean {
 return access.isAdmin && (access.role === "owner" || access.permissions.includes(permission));
}
