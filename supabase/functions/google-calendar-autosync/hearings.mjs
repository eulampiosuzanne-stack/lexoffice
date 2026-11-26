// Converte audiências (process_hearings) em eventos para o Google, sem repetir as que já estão na agenda.
export function hearingsToSync(hearings, events) {
  const eventIds = new Set(events.map(e => e.id));
  const taken = new Set(events.filter(e => e.event_type === 'hearing').map(e => `${e.process_id}|${new Date(e.starts_at).getTime()}`));
  return hearings
    .filter(h => !(h.source_calendar_event_id && eventIds.has(h.source_calendar_event_id)))
    .filter(h => !taken.has(`${h.process_id}|${new Date(h.starts_at).getTime()}`))
    .map(h => ({
      id: `hearing:${h.id}`, hearing: true, event_type: 'hearing',
      title: h.title || 'Audiência', description: [h.notes, h.meeting_url].filter(Boolean).join('\n'),
      location: h.location || h.meeting_url || null, starts_at: h.starts_at, ends_at: null,
      client_id: h.client_id, process_id: h.process_id, status: h.status, updated_at: h.updated_at,
      meeting_mode: null,
    }));
}
