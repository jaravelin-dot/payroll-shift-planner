// Docházka v appce: typy dnů (písmeno, název, barvy), popisy dat a pomocníci panelu dne (výchozí hodiny, nemoc od–do,
// kopie minulého týdne). Čisté funkce bez Reactu, data jako text RRRR-MM-DD.
import { denVTydnu, jeSvatek, posunDatum } from '../core/kalendar';
import { jeVPomeru } from '../core/plan';
import type { Den, Smlouva, TypDne, Zamestnanec } from '../shared/api';

/** Den k uložení přes `PUT /api/dny` (bez zaměstnance). */
export type NovyDen = Omit<Den, 'zamestnanecId'>;

export interface InfoTypu {
  pismeno: string;
  nazev: string;
  /** Co typ znamená, jednou větou do panelu dne. */
  popis: string;
  /** Světlá výplň, levý okraj a barva písmene (spec 8); třídy jsou celé kvůli Tailwindu. */
  vypln: string;
  okraj: string;
  text: string;
}

export const TYPY_DNU: Record<TypDne, InfoTypu> = {
  PRACE: { pismeno: 'P', nazev: 'Práce', popis: 'Odpracované hodiny. Kasa přidá příplatek za kasu.', vypln: 'bg-den-prace/8', okraj: 'border-den-prace', text: 'text-den-prace' },
  DOVOLENA: { pismeno: 'D', nazev: 'Dovolená', popis: 'Hodiny dovolené, proplácí se průměrným výdělkem.', vypln: 'bg-den-dovolena/9', okraj: 'border-den-dovolena', text: 'text-den-dovolena' },
  NEMOC: { pismeno: 'N', nazev: 'Nemoc', popis: 'Zapiš celou neschopenku od–do, i víkendy. Prvních 14 dní platí náhradu firma.', vypln: 'bg-den-nemoc/9', okraj: 'border-den-nemoc', text: 'text-den-nemoc' },
  SVATEK_ZAVRENO: { pismeno: 'S', nazev: 'Svátek – zavřeno', popis: 'Svátek, kdy by měl směnu, ale bylo zavřeno. Hodiny = délka té směny.', vypln: 'bg-den-svatek/8', okraj: 'border-den-svatek', text: 'text-den-svatek' },
  NAHRADNI_VOLNO: { pismeno: 'V', nazev: 'Náhradní volno', popis: 'Volno za práci ve svátek, proplácí se průměrným výdělkem.', vypln: 'bg-den-volno/9', okraj: 'border-den-volno', text: 'text-den-volno' },
  NEPLACENE: { pismeno: '–', nazev: 'Neplacené volno', popis: 'Volno bez mzdy i bez náhrady.', vypln: 'bg-den-neplacene/12', okraj: 'border-den-neplacene', text: 'text-tlumeny' },
  ABSENCE: { pismeno: '–', nazev: 'Absence', popis: 'Neomluvená absence, bez mzdy.', vypln: 'bg-den-neplacene/12', okraj: 'border-den-neplacene', text: 'text-tlumeny' },
};

const PORADI_TYPU: TypDne[] = ['PRACE', 'DOVOLENA', 'NEMOC', 'SVATEK_ZAVRENO', 'NAHRADNI_VOLNO', 'NEPLACENE', 'ABSENCE'];

/** Typy, které dávají smysl pro dané dny: „Svátek – zavřeno" jen když jsou všechny svátkem a jen u HPP (DPP na náhradu nárok nemá). */
export function typyProDny(datumy: string[], smlouva: Smlouva): TypDne[] {
  const svatek = smlouva === 'HPP' && datumy.length > 0 && datumy.every(jeSvatek);
  return PORADI_TYPU.filter((t) => t !== 'SVATEK_ZAVRENO' || svatek);
}

const DNY_TYDNE = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
export const ZKRATKY_DNU = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const MESICE_2_PAD = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
export const NAZVY_MESICU = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

/** „2026-10-01" → „Čtvrtek 1. října". */
export function nazevDne(datum: string): string {
  const [, mesic, den] = datum.split('-').map(Number);
  return `${DNY_TYDNE[denVTydnu(datum) - 1]} ${den}. ${MESICE_2_PAD[mesic - 1]}`;
}

/** „Říjen 2026". */
export function nazevMesice(rok: number, mesic: number): string {
  return `${NAZVY_MESICU[mesic - 1]} ${rok}`;
}

const MESICE_6_PAD = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];

/** 10 → „v říjnu", 7 → „v červenci". */
export function vMesici(mesic: number): string {
  return `v ${MESICE_6_PAD[mesic - 1]}`;
}

/** Je den mimo pracovní poměr (před nástupem nebo po ukončení)? */
export function mimoPomer(datum: string, z: Pick<Zamestnanec, 'nastup' | 'ukonceni'>): boolean {
  return !jeVPomeru(z, datum);
}

const jeVolnyDen = (datum: string) => denVTydnu(datum) >= 6 || jeSvatek(datum);

/** Obvyklá délka směny: nejčastější délka odpracovaného dne (při shodě ta pozdější), jinak týdenní úvazek / 5, u dohody 8 h. */
export function obvykleMinuty(dny: Den[], z: Pick<Zamestnanec, 'smlouva' | 'uvazekMinTydne'>): number {
  const cetnost = new Map<number, number>();
  let nejlepsi: number | null = null;
  for (const d of [...dny].sort((a, b) => a.datum.localeCompare(b.datum))) {
    if (d.typ !== 'PRACE' || d.minuty <= 0) continue;
    const pocet = (cetnost.get(d.minuty) ?? 0) + 1;
    cetnost.set(d.minuty, pocet);
    if (nejlepsi === null || pocet >= (cetnost.get(nejlepsi) ?? 0)) nejlepsi = d.minuty;
  }
  if (nejlepsi !== null) return nejlepsi;
  if (z.smlouva === 'HPP' && z.uvazekMinTydne > 0) return Math.round(z.uvazekMinTydne / 5);
  return 480;
}

/**
 * Výchozí hodiny pro nový den daného typu: hodiny posledního zadaného dne téhož typu (nejbližšího před datem, jinak
 * posledního vůbec); u nemoci se nepočítají dny s 0 h (víkendy). Bez vzoru obvyklá směna.
 */
export function vychoziMinuty(typ: TypDne, datum: string, dny: Den[], z: Pick<Zamestnanec, 'smlouva' | 'uvazekMinTydne'>): number {
  const vzory = dny.filter((d) => d.typ === typ && (typ !== 'NEMOC' || d.minuty > 0)).sort((a, b) => b.datum.localeCompare(a.datum));
  const vzor = vzory.find((d) => d.datum < datum) ?? vzory[0];
  return vzor ? vzor.minuty : obvykleMinuty(dny, z);
}

/**
 * Nemoc od–do na každý kalendářní den (jinak by se přerušila epizoda a 14 dní náhrady by se počítalo špatně): pracovní dny
 * s `minutyPracovni`, víkendy a svátky s 0 h. Jediný den dostane přesně zadané hodiny. Dny mimo pracovní poměr vynechá.
 */
export function dnyNemoci(od: string, do_: string, minutyPracovni: number, z: Pick<Zamestnanec, 'nastup' | 'ukonceni'>): NovyDen[] {
  const dny: NovyDen[] = [];
  for (let datum = od; datum <= do_; datum = posunDatum(datum, 1)) {
    if (mimoPomer(datum, z)) continue;
    const minuty = od === do_ || !jeVolnyDen(datum) ? minutyPracovni : 0;
    dny.push({ datum, typ: 'NEMOC', minuty, kasa: false, poznamka: null });
  }
  return dny;
}

/** Pondělí týdne, do kterého datum patří. */
export const pondeliTydne = (datum: string) => posunDatum(datum, 1 - denVTydnu(datum));

/**
 * Do týdne Po–Ne s daným dnem zkopíruje typ, hodiny a kasu ze dnů o 7 dní dřív — jen do prázdných dnů tohoto měsíce
 * v pracovním poměru. Svátky vynechá (práce ve svátek má příplatek, ať ji uživatel zadá vědomě), stejně jako
 * „Svátek – zavřeno" do obyčejného dne.
 */
export function zkopirujMinulyTyden(datum: string, dny: Den[], rok: number, mesic: number, z: Pick<Zamestnanec, 'nastup' | 'ukonceni'>):
  { dny: NovyDen[]; preskocenySvatek: string[] } {
  const mesicKlic = `${String(rok).padStart(4, '0')}-${String(mesic).padStart(2, '0')}`;
  const podleData = new Map(dny.map((d) => [d.datum, d]));
  const kopie: NovyDen[] = [];
  const preskocenySvatek: string[] = [];
  const pondeli = pondeliTydne(datum);
  for (let i = 0; i < 7; i++) {
    const cil = posunDatum(pondeli, i);
    const zdroj = podleData.get(posunDatum(cil, -7));
    if (!zdroj || cil.slice(0, 7) !== mesicKlic || podleData.has(cil) || mimoPomer(cil, z)) continue;
    if (jeSvatek(cil)) { preskocenySvatek.push(cil); continue; }
    if (zdroj.typ === 'SVATEK_ZAVRENO') continue;
    kopie.push({ datum: cil, typ: zdroj.typ, minuty: zdroj.minuty, kasa: zdroj.typ === 'PRACE' && zdroj.kasa, poznamka: null });
  }
  return { dny: kopie, preskocenySvatek };
}
