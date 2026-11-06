/** Only internally constructed, allowlisted routes. Never read an arbitrary URL from SQL. */
export type MarketlyNotice = {kind:string;conversation_id:string|null;listing_id:string|null;
 verification_request_id?:string|null;report_id?:string|null;chat_report_id?:string|null};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function notificationRoute(n: MarketlyNotice): string {
 const valid=(id?:string|null)=>!!id&&uuid.test(id);
 if((n.kind==="admin_verification"||n.kind==="admin_verification_escalation")&&valid(n.verification_request_id)) return `/admin/verification/${n.verification_request_id}`;
 if(n.kind==="admin_verification"||n.kind==="admin_verification_escalation") return "/admin#verification";
 if(n.kind==="admin_report" && valid(n.report_id))return `/admin/reports/${n.report_id}`;
 if(n.kind==="admin_report")return "/admin#reports";
 if(n.kind==="admin_chat_report" && valid(n.chat_report_id))return `/admin/chat-reports/${n.chat_report_id}`;
 if(n.kind==="admin_chat_report")return "/admin/chat-reports";
 if(n.kind==="admin_listing_pending"&&valid(n.listing_id))return `/admin/ads/${n.listing_id}`;
 if(n.kind==="admin_listing_pending")return "/admin#pending";
 if(n.kind.startsWith("verification_"))return "/verification";
 if(n.kind==="listing_rejected"&&valid(n.listing_id))return `/sell/${n.listing_id}/edit`;
 if(n.conversation_id && valid(n.conversation_id))return `/messages/${n.conversation_id}`;
 if(n.listing_id && valid(n.listing_id))return `/listings/${n.listing_id}`;
 if(n.kind.includes("membership")||n.kind.includes("billing"))return "/billing";
 return "/notifications";
}
