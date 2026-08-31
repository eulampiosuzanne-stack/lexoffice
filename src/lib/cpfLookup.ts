import { supabase } from './supabase';

export type ExternalCpfLookup = {
  cpf: string;
  name?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  mother_name?: string | null;
};

export async function lookupCpfProviders(cpf: string) {
  if (!supabase) throw new Error('Conexão com o Supabase indisponível.');

  const { data, error } = await supabase.functions.invoke('client-cpf-lookup', {
    body: { cpf },
  });

  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);

  return {
    data: ((data as any)?.data || null) as ExternalCpfLookup | null,
    sources: Array.isArray((data as any)?.sources) ? (data as any).sources as string[] : [],
  };
}
