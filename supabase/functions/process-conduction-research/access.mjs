export async function loadAuthorizedProcess(scopedDb, adminDb, orgId, actorId, processId, internal = false) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(processId)) return null;
  // Browser requests use the caller's JWT so SELECT policies, including shares,
  // decide visibility. Internal callers retain the original owner-only boundary.
  let query = (internal ? adminDb : scopedDb).from("processes").select("*")
    .eq("id", processId).eq("org_id", orgId);
  if (internal) query = query.eq("owner_user_id", actorId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Não foi possível verificar o acesso ao processo. Tente novamente.");
  return data || null;
}
