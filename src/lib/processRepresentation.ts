export type ProcessPole = "author" | "defendant";

export function normalizeProcessPole(value: unknown): ProcessPole | null {
  const pole = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (/^(author|autor|autora|requerente|demandante|exequente|polo ativo|ativo|plaintiff|claimant)$/.test(pole)) return "author";
  if (/^(defendant|respondent|reu|re|requerido|requerida|demandado|executado|polo passivo|passivo)$/.test(pole)) return "defendant";
  return null;
}

export async function persistProcessRepresentation(
  database: any,
  processId: string,
  orgId: string,
  patch: { client_id?: string | null; pole?: string | null },
) {
  const update = { ...patch };
  if ("pole" in patch) {
    update.pole = normalizeProcessPole(patch.pole);
    if (patch.pole && !update.pole) throw new Error("Selecione um polo válido.");
  }
  const { data, error } = await database.from("processes").update(update)
    .eq("id", processId).eq("org_id", orgId)
    .select("id,client_id,pole").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("O processo não foi atualizado. Confira se sua sessão tem permissão para editar este processo e tente novamente.");
  return data;
}
