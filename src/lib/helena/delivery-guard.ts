export type DeliveryDecision = { allow: boolean; reason: string };
export type DeliveryContext = {
  tenantId: string; clientTenantId: string; messageId: string;
  alreadySentIds: ReadonlySet<string>; humanLastMessageAt?: number;
  now: number; isAutomatedSender: boolean; needsHumanReview: boolean; approved: boolean;
  providerReady: boolean; recipientVerified: boolean;
};
/** Pure guard. Call at the last outbound boundary, before enqueue and again before sending. */
export function authorizeHelenaDelivery(context: DeliveryContext): DeliveryDecision {
  if (!context.tenantId || !context.clientTenantId || context.tenantId !== context.clientTenantId) return {allow:false,reason:'tenant_mismatch'};
  if (!context.messageId || context.alreadySentIds.has(context.messageId)) return {allow:false,reason:'duplicate_or_missing_id'};
  if (!context.recipientVerified) return {allow:false,reason:'unverified_recipient'};
  if (!context.providerReady) return {allow:false,reason:'provider_unavailable'};
  if (context.isAutomatedSender && context.humanLastMessageAt !== undefined && context.now - context.humanLastMessageAt < 20*60*1000) return {allow:false,reason:'human_cooldown'};
  if (context.needsHumanReview && !context.approved) return {allow:false,reason:'human_review_required'};
  return {allow:true,reason:'authorized'};
}
