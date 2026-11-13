export function processFollowupDecision(status) {
  const current = String(status ?? '').trim().toLowerCase();
  if (current === 'closed') return 'process_closed';
  if (current === 'archived') return 'process_archive_review';
  return null;
}

export function isProcessFollowup(item) {
  return Boolean(item.process_id) && (
    item.template_key === 'sf_care_reviewed' ||
    item.payload?.agent_key === 'client_process_updates' ||
    ['process_hearing', 'process_movement', 'stagnant_process_care'].includes(item.payload?.source)
  );
}
