// Regras do cadastro rápido de quem assina sem ser cliente (aba Assinaturas).
export const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export function isValidCpf(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    return ((sum * 10) % 11) % 10 === Number(d[len]);
  };
  return check(9) && check(10);
}

// Telefone brasileiro com DDD, sem o 55. Devolve '' se for inválido.
export function localPhone(value: string) {
  let d = onlyDigits(value).replace(/^0+/, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : '';
}

// Compara DDD + 8 últimos dígitos, para casar números com e sem o nono dígito.
export function samePhone(a?: string | null, b?: string | null) {
  const x = localPhone(a || ''), y = localPhone(b || '');
  return !!x && !!y && x.slice(0, 2) === y.slice(0, 2) && x.slice(-8) === y.slice(-8);
}

export function signerError(name: string, cpf: string, phone: string) {
  if (name.trim().split(/\s+/).filter((p) => p.length > 1).length < 2) return 'Informe o nome completo (nome e sobrenome).';
  if (!isValidCpf(cpf)) return 'CPF inválido. Confira os 11 números.';
  if (!localPhone(phone)) return 'WhatsApp inválido. Use DDD + número, como (31) 99999-9999.';
  return '';
}
