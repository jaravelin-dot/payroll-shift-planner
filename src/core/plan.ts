// Plán směn: délka šablony, převod plánu na dny docházky a doplňování prázdných dnů podle vzoru (kopie týdne, celý měsíc).
import type { Den, PlanSmeny, SablonaSmeny, TypDne, TypPlanu, Zamestnanec } from '../shared/api';
import { jeSvatek, posunDatum, denVTydnu } from './kalendar';

const DEN_MIN = 24 * 60;

export function casNaMinuty(cas: string): number {
  const shoda = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(cas);
  if (!shoda) throw new RangeError(`Neplatný čas: ${cas}`);
  return Number(shoda[1]) * 60 + Number(shoda[2]);
}

/** Délka směny v minutách: konec − začátek − přestávka. Konec dřív než začátek (nebo stejně) znamená přes půlnoc (+24 h). Nikdy záporná. */
export function minutySablony(s: Pick<SablonaSmeny, 'zacatek' | 'konec' | 'prestavkaMin'>): number {
  let doba = casNaMinuty(s.konec) - casNaMinuty(s.zacatek);
  if (doba <= 0) doba += DEN_MIN;
  return Math.max(0, doba - s.prestavkaMin);
}

const TYP_DNE: Record<Exclude<TypPlanu, 'VOLNO'>, TypDne> = { SMENA: 'PRACE', DOVOLENA: 'DOVOLENA', ZAVRENO: 'SVATEK_ZAVRENO', NEMOC: 'NEMOC' };

const klic = (zamestnanecId: string, datum: string) => `${zamestnanecId}|${datum}`;

/** Klíč buňky rozpisu (člověk + datum). */
export const klicBunky = (zamestnanecId: string, datum: string) => `${zamestnanecId}|${datum}`;

/**
 * Dny docházky podle plánu: SMENA → PRACE, DOVOLENA → DOVOLENA, ZAVRENO → SVATEK_ZAVRENO, NEMOC → NEMOC, vždy s minutami z plánu,
 * bez kasy a poznámky; VOLNO nic. Den, který už v docházce existuje (jakéhokoli typu), se přeskočí — převod nic nepřepíše.
 */
export function planNaDny(plan: PlanSmeny[], existujici: Den[]): Den[] {
  const obsazene = new Set(existujici.map((d) => klic(d.zamestnanecId, d.datum)));
  const dny: Den[] = [];
  for (const p of plan) {
    if (p.typ === 'VOLNO' || obsazene.has(klic(p.zamestnanecId, p.datum))) continue;
    obsazene.add(klic(p.zamestnanecId, p.datum));
    dny.push({ zamestnanecId: p.zamestnanecId, datum: p.datum, typ: TYP_DNE[p.typ], minuty: p.minuty, kasa: false, poznamka: null });
  }
  return dny;
}

/** Trval ten den pracovní poměr? (Včetně dne nástupu i ukončení.) */
export function jeVPomeru(z: Pick<Zamestnanec, 'nastup' | 'ukonceni'>, datum: string): boolean {
  return z.nastup <= datum && (z.ukonceni === null || datum <= z.ukonceni);
}

export type ClovekPlanu = Pick<Zamestnanec, 'id' | 'smlouva' | 'nastup' | 'ukonceni'>;

export interface PrevodPlanu {
  dny: Den[];
  /** Dny, které už v docházce byly. */
  preskoceno: number;
  /** „Zavřeno" u DPP: dohoda na náhradu mzdy za svátek nárok nemá (spec 5.9), do docházky se nepřevádí. */
  preskocenoDpp: number;
  /** Plán na dny před nástupem, po ukončení nebo u člověka, který ve firmě není. */
  mimoPomer: number;
}

/** Převod plánu do docházky s rozpisem, co a proč se přeskočilo (VOLNO se nepočítá nikam); víkendy a svátky uvnitř nemoci doplní s 0 min. */
export function prevedPlan(plan: PlanSmeny[], existujici: Den[], lide: ClovekPlanu[]): PrevodPlanu {
  const podleId = new Map(lide.map((z) => [z.id, z]));
  const kPrevodu: PlanSmeny[] = [];
  let preskocenoDpp = 0;
  let mimoPomer = 0;
  for (const p of plan) {
    if (p.typ === 'VOLNO') continue;
    const z = podleId.get(p.zamestnanecId);
    if (!z || !jeVPomeru(z, p.datum)) mimoPomer += 1;
    else if (p.typ === 'ZAVRENO' && z.smlouva === 'DPP') preskocenoDpp += 1;
    else kPrevodu.push(p);
  }
  const dny = planNaDny(kPrevodu, existujici);
  const preskoceno = kPrevodu.length - dny.length;
  dny.push(...volneDnyMeziNemocemi(kPrevodu, plan, existujici, dny));
  return { dny, preskoceno, preskocenoDpp, mimoPomer };
}

const jeVolnyDen = (datum: string) => denVTydnu(datum) >= 6 || jeSvatek(datum);

/**
 * Pojistka epizody nemoci: výplata počítá 14 dní náhrady po kalendářních dnech, takže víkend nebo svátek bez záznamu by epizodu
 * přerušil (docházka proto píše nemoc od–do na každý den, viz `dnyNemoci` v src/app/dochazka.ts). Když má člověk v převáděném
 * plánu NEMOC ve dnech A < B, oba v docházce skončí jako NEMOC a všechny dny mezi nimi jsou víkend nebo svátek bez položky
 * plánu i bez dne v docházce, doplní se jako NEMOC s 0 min. Převádí se po měsících, takže přes hranici měsíce to neplatí:
 * víkend na přelomu měsíce se do docházky dostane, jen když ho má plán (panel plánu zapisuje nemoc od–do na každý den).
 */
function volneDnyMeziNemocemi(kPrevodu: PlanSmeny[], plan: PlanSmeny[], existujici: Den[], prevedene: Den[]): Den[] {
  const vPlanu = new Set(plan.map((p) => klic(p.zamestnanecId, p.datum)));
  const vDochazce = new Set(existujici.map((d) => klic(d.zamestnanecId, d.datum)));
  const nemocVDochazce = new Set([...existujici, ...prevedene].filter((d) => d.typ === 'NEMOC').map((d) => klic(d.zamestnanecId, d.datum)));
  const nemocKPrevodu = new Set(kPrevodu.filter((p) => p.typ === 'NEMOC').map((p) => klic(p.zamestnanecId, p.datum)));
  const jeNemoc = (zamestnanecId: string, datum: string) =>
    nemocKPrevodu.has(klic(zamestnanecId, datum)) && nemocVDochazce.has(klic(zamestnanecId, datum));
  const doplnene: Den[] = [];
  const pridane = new Set<string>();
  for (const a of kPrevodu) {
    if (a.typ !== 'NEMOC' || !jeNemoc(a.zamestnanecId, a.datum)) continue;
    const mezera: string[] = [];
    let datum = posunDatum(a.datum, 1);
    for (; jeVolnyDen(datum) && !vPlanu.has(klic(a.zamestnanecId, datum)) && !vDochazce.has(klic(a.zamestnanecId, datum)); datum = posunDatum(datum, 1)) {
      mezera.push(datum);
    }
    if (mezera.length === 0 || !jeNemoc(a.zamestnanecId, datum)) continue;
    for (const d of mezera) {
      if (pridane.has(klic(a.zamestnanecId, d))) continue;
      pridane.add(klic(a.zamestnanecId, d));
      doplnene.push({ zamestnanecId: a.zamestnanecId, datum: d, typ: 'NEMOC', minuty: 0, kasa: false, poznamka: null });
    }
  }
  return doplnene;
}

/** Pondělí týdne, do kterého datum patří (týden je Po–Ne). */
export function pondeliTydne(datum: string): string {
  return posunDatum(datum, 1 - denVTydnu(datum));
}

/** Sedm dat týdne od pondělí. */
export function dnyTydne(pondeli: string): string[] {
  return Array.from({ length: 7 }, (_, i) => posunDatum(pondeli, i));
}

/** Opakuje se jen rozpis směn a volna; dovolená a „zavřeno" patří ke konkrétnímu dni. */
const KOPIROVATELNE: ReadonlySet<TypPlanu> = new Set(['SMENA', 'VOLNO']);

/**
 * Nové položky plánu pro prázdné `cilove` dny: každý den převezme směnu nebo volno ze dne `zdroj(datum)` téhož člověka.
 * Vynechá dny, které už něco mají, dny mimo pracovní poměr a svátky (ty se rozhodují ručně: otevřeno, nebo zavřeno).
 */
export function doplnPlan(
  plan: PlanSmeny[],
  lide: Pick<Zamestnanec, 'id' | 'nastup' | 'ukonceni'>[],
  cilove: string[],
  zdroj: (datum: string) => string,
): PlanSmeny[] {
  const podleKlice = new Map(plan.map((p) => [klic(p.zamestnanecId, p.datum), p]));
  const nove: PlanSmeny[] = [];
  for (const z of lide) {
    for (const datum of cilove) {
      if (podleKlice.has(klic(z.id, datum)) || !jeVPomeru(z, datum) || jeSvatek(datum)) continue;
      const vzor = podleKlice.get(klic(z.id, zdroj(datum)));
      if (!vzor || !KOPIROVATELNE.has(vzor.typ)) continue;
      nove.push({ zamestnanecId: z.id, datum, typ: vzor.typ, sablonaId: vzor.sablonaId, minuty: vzor.minuty });
    }
  }
  return nove;
}
