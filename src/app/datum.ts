// Data ve tvaru RRRR-MM-DD (jak je ukládá API) pro formuláře a zobrazení.

const dvojmistne = (cislo: number) => String(cislo).padStart(2, '0');

/** Dnešní datum v místním čase (ne UTC: v noci po půlnoci je u nás už další den). */
export function dnesniDatum(ted: Date = new Date()): string {
  return `${ted.getFullYear()}-${dvojmistne(ted.getMonth() + 1)}-${dvojmistne(ted.getDate())}`;
}

/** Je to skutečné datum ve tvaru RRRR-MM-DD? (30. 2. ne.) */
export function jeDatum(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

/** „2026-10-06" → „6. 10. 2026" s nezlomitelnými mezerami, aby se datum nezalomilo. */
export function formatDatum(datum: string): string {
  const [rok, mesic, den] = datum.split('-').map(Number);
  return `${den}. ${mesic}. ${rok}`;
}

/** První den měsíce, který následuje po daném datu: „2026-12-31" → „2027-01-01". */
export function prvniDenDalsihoMesice(datum: string): string {
  const [rok, mesic] = datum.split('-').map(Number);
  return mesic === 12 ? `${rok + 1}-01-01` : `${rok}-${dvojmistne(mesic + 1)}-01`;
}
