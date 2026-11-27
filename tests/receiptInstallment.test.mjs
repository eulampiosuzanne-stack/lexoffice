import test from "node:test";
import assert from "node:assert/strict";
import { checkReceipt } from "../supabase/functions/whatsapp-media-intake/receipt.mjs";
test("parcela aceita qualquer valor, mas exige comprovante válido", () => {
  const t = "Comprovante de Pix\nValor: R$ 512,40\nRecebedor: Suzanne Figueiredo\n27/11/2026 08:00";
  assert.equal(checkReceipt(t, { fee: null, now: Date.parse("2026-11-27T12:00:00Z") }).amount, 512.4);
  assert.equal(checkReceipt("Pix agendado comprovante R$ 1,00", { fee: null }).ok, false);
});
