export function recentVerifiedDistribution({movements,previousStatus,clientId,isDemo,secrecyLevel,now=Date.now()}) {
 if (!clientId || isDemo || previousStatus === 'baseline_pending' || Number(secrecyLevel||0)>0) return null;
 for (const item of movements || []) {
  const title=String(item.title||'');
  if (!/distribui(?:ção|cao|do|da|ído|ido)/i.test(title)) continue;
  const timestamp=Date.parse(item.movement_date||'');
  if (!Number.isFinite(timestamp)||timestamp>now+3600000||now-timestamp>7*86400000) continue;
  return {date:new Date(timestamp).toISOString(),title};
 }
 return null;
}