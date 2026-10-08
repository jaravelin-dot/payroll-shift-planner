// Koncept formuláře zaměstnance a jeho kontrola: čísla jako text (hodiny a Kč s čárkou), převod na minuty a haléře
// až při uložení. Bez Reactu, aby šlo kontrolu zkoušet samostatně a aby ji mohl použít i formulář firmy (účet).
import { ucetNaIban } from '../core/platby';
import type { Dite, Firma, Invalidita, NovyZamestnanec, RolePlanu, Smlouva, ZamestnanecSeSazbami } from '../shared/api';
import { CHYBA_CASTKY, cisloNaText, halNaText, minutyNaText, textNaHal, textNaMinuty } from './cisla';
import { formatDatum, jeDatum } from './datum';
import { novyKlicSazby, type RadekSazby } from './components/SazbyEditor';

/** Formulář tak, jak ho uživatel vidí. */
export interface Koncept {
  jmeno: string;
  prijmeni: string;
  smlouva: Smlouva;
  uvazek: string;
  nastup: string;
  ukonceni: string;
  sazby: RadekSazby[];
  prohlaseni: boolean;
  invalidita: Invalidita;
  ztpp: boolean;
  deti: Dite[];
  statniPojistenec: boolean;
  slevaNaPojistnem: boolean;
  ucet: string;
  /** Pořadí v podkladu pro účetního; prázdné = bez pořadí (na konci podle příjmení). */
  poradi: string;
  poznamka: string;
  /** Zahrnout do podkladů pro účetního (PDF a Excel); vypnuté = člověk v nich není. */
  vPodkladu: boolean;
  rolePlanu: RolePlanu;
  stridaniSmen: string[];
}

export type Chyby = Record<string, string | undefined>;
export type UdajeZamestnance = Omit<NovyZamestnanec, 'firmaId' | 'aktivni'>;

export const CHYBA_UCTU = 'Číslo účtu nesedí, zkontroluj ho.';
/**
 * Klíč v chybách: `klic` řádku sazeb, který kontrola označila jako první chybný, když je chyba celé historie
 * (`sazby`). Nese se spolu s hláškou, aby formulář mohl označit pole „Platí od" toho řádku.
 */
export const CHYBA_SAZBY_RADEK = 'sazby.radek';

const NEJDELSI_TEXT = 200;
const NEJDELSI_POZNAMKA = 500;
/** Zákonné maximum stanovené týdenní pracovní doby (§ 79 zákoníku práce). */
const NEJVIC_UVAZEK_MIN = 40 * 60;

/**
 * Chyby, které závisí i na jiném poli než na tom, u kterého se ukazují (kontroly přes víc polí).
 * Změna pole schová i je, aby po opravě nezůstala viset hláška, která už neplatí.
 */
export const SOUVISEJICI_CHYBY: Partial<Record<keyof Koncept, string[]>> = {
  smlouva: ['uvazek'],
  nastup: ['ukonceni', 'sazby', CHYBA_SAZBY_RADEK],
};

export function konceptZ(z: ZamestnanecSeSazbami | undefined, firma: Firma, dnes: string): Koncept {
  const plnyUvazek = cisloNaText(firma.nastaveni.tydenniPracovniDoba);
  if (!z) {
    return {
      jmeno: '', prijmeni: '', smlouva: 'HPP', uvazek: plnyUvazek, nastup: dnes, ukonceni: '',
      sazby: [{ klic: novyKlicSazby(), platiOd: dnes, kc: '' }],
      prohlaseni: false, invalidita: 'ZADNA', ztpp: false, deti: [], statniPojistenec: false, slevaNaPojistnem: false, ucet: '', poradi: '', poznamka: '', vPodkladu: true,
      rolePlanu: 'MIMO_PLAN', stridaniSmen: [],
    };
  }
  const sazby = z.sazby.map((s) => ({ klic: novyKlicSazby(), platiOd: s.platiOd, kc: halNaText(s.hodinovaHal) }));
  return {
    jmeno: z.jmeno,
    prijmeni: z.prijmeni,
    smlouva: z.smlouva,
    // Dohoda má úvazek 0; kdyby se přepnula na pracovní poměr, nabídne se plný úvazek firmy.
    uvazek: z.uvazekMinTydne > 0 ? minutyNaText(z.uvazekMinTydne) : plnyUvazek,
    nastup: z.nastup,
    ukonceni: z.ukonceni ?? '',
    sazby: sazby.length > 0 ? sazby : [{ klic: novyKlicSazby(), platiOd: z.nastup, kc: '' }],
    prohlaseni: z.prohlaseni,
    invalidita: z.invalidita,
    ztpp: z.ztpp,
    deti: z.deti,
    statniPojistenec: z.statniPojistenec,
    slevaNaPojistnem: z.slevaNaPojistnem,
    ucet: z.ucet ?? '',
    poradi: z.poradiPodkladu === null ? '' : String(z.poradiPodkladu),
    poznamka: z.poznamka ?? '',
    vPodkladu: z.vPodkladu,
    rolePlanu: z.rolePlanu,
    stridaniSmen: z.stridaniSmen,
  };
}

function overText(text: string, prazdne: string): string | undefined {
  if (!text) return prazdne;
  if (text.length > NEJDELSI_TEXT) return `Nejvýš ${NEJDELSI_TEXT} znaků.`;
  return undefined;
}

export function overUcet(ucet: string): string | undefined {
  return ucet.trim() && ucetNaIban(ucet) === null ? CHYBA_UCTU : undefined;
}

/** Zkontroluje formulář; bez chyb vrátí údaje zaměstnance pro API (minuty, haléře, prázdné → null). */
export function over(k: Koncept): { udaje: UdajeZamestnance | null; chyby: Chyby } {
  const chyby: Chyby = {};
  const jmeno = k.jmeno.trim();
  const prijmeni = k.prijmeni.trim();
  chyby.jmeno = overText(jmeno, 'Napiš jméno.');
  chyby.prijmeni = overText(prijmeni, 'Napiš příjmení.');

  let uvazekMinTydne = 0;
  if (k.smlouva === 'HPP') {
    const minuty = textNaMinuty(k.uvazek);
    if (minuty === null) chyby.uvazek = 'Zadej hodiny týdně, např. 40 nebo 37,5.';
    else if (minuty <= 0 || minuty > NEJVIC_UVAZEK_MIN) chyby.uvazek = 'Úvazek musí být víc než 0 a nejvýš 40 hodin týdně.';
    else uvazekMinTydne = minuty;
  }

  if (!jeDatum(k.nastup)) chyby.nastup = 'Vyplň den nástupu.';
  if (k.ukonceni && !jeDatum(k.ukonceni)) chyby.ukonceni = 'Datum ukončení nesedí.';
  else if (k.ukonceni && jeDatum(k.nastup) && k.ukonceni < k.nastup) chyby.ukonceni = 'Ukončení nesmí být před nástupem.';

  const sazby: UdajeZamestnance['sazby'] = [];
  for (const s of k.sazby) {
    if (!jeDatum(s.platiOd)) chyby[`${s.klic}.platiOd`] = 'Vyplň, od kdy sazba platí.';
    const hal = textNaHal(s.kc);
    if (!s.kc.trim()) chyby[`${s.klic}.kc`] = 'Vyplň sazbu v Kč za hodinu.';
    else if (hal === null) chyby[`${s.klic}.kc`] = CHYBA_CASTKY;
    else if (hal === 0) chyby[`${s.klic}.kc`] = 'Sazba musí být víc než 0 Kč.';
    else sazby.push({ platiOd: s.platiOd, hodinovaHal: hal });
  }
  const data = k.sazby.map((s) => s.platiOd).filter(jeDatum);
  const prvni = [...data].sort()[0];
  if (new Set(data).size !== data.length) {
    chyby.sazby = 'Dvě sazby nemůžou platit od stejného dne.';
    // První řádek, jehož den má ještě jiný řádek.
    chyby[CHYBA_SAZBY_RADEK] = k.sazby.find((s, i) => jeDatum(s.platiOd) && k.sazby.some((jina, j) => j !== i && jina.platiOd === s.platiOd))?.klic;
  } else if (prvni && jeDatum(k.nastup) && data.length === k.sazby.length && prvni > k.nastup) {
    // Dny mezi nástupem a první sazbou by se do mzdy nezapočítaly.
    chyby.sazby = `První sazba platí až od ${formatDatum(prvni)}, ale nástup je ${formatDatum(k.nastup)}. Nastav „Platí od" nejpozději na den nástupu.`;
    chyby[CHYBA_SAZBY_RADEK] = k.sazby.find((s) => s.platiOd === prvni)?.klic;
  }

  chyby.ucet = overUcet(k.ucet);
  const poradi = k.poradi.trim();
  if (poradi && !(/^\d+$/.test(poradi) && Number(poradi) >= 1 && Number(poradi) <= 999)) chyby.poradi = 'Celé číslo od 1 do 999.';
  const poznamka = k.poznamka.trim();
  if (poznamka.length > NEJDELSI_POZNAMKA) chyby.poznamka = `Poznámka může mít nejvýš ${NEJDELSI_POZNAMKA} znaků.`;

  if (Object.values(chyby).some(Boolean)) return { udaje: null, chyby };
  const ucet = k.ucet.replace(/\s+/g, '');
  return {
    chyby: {},
    udaje: {
      jmeno, prijmeni, smlouva: k.smlouva, uvazekMinTydne, nastup: k.nastup, ukonceni: k.ukonceni || null,
      prohlaseni: k.prohlaseni, invalidita: k.invalidita, ztpp: k.ztpp, deti: k.deti, statniPojistenec: k.statniPojistenec,
      // Sleva na pojistném je jen pro pracovní poměr; u dohody by jádro každý měsíc hlásilo, že se neuplatní.
      slevaNaPojistnem: k.smlouva === 'HPP' && k.slevaNaPojistnem,
      ucet: ucet || null, poradiPodkladu: poradi ? Number(poradi) : null, poznamka: poznamka || null, vPodkladu: k.vPodkladu, sazby,
      rolePlanu: k.rolePlanu, stridaniSmen: k.stridaniSmen,
    },
  };
}
