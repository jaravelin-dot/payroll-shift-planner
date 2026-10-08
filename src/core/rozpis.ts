// Rozpis směn pro zaměstnance: čistý model týdne (kdo, kdy, jaký text v buňce) a text do WhatsAppu.
// Sdílí ho Worker `rozpis` (veřejná stránka) a appka Mzdy, proto nesmí importovat nic z src/app.
// Nikdy neprozradí nemoc, dovolenou ani jinou nepřítomnost: ta je v buňce jen prázdné políčko.
import type { PlanSmeny, SablonaSmeny, Zamestnanec } from '../shared/api';
import { denVTydnu, svatky } from './kalendar';
import { dnyTydne, jeVPomeru, klicBunky } from './plan';
import { seradTyden } from './razeniRozpisu';

export interface DenRozpisu { datum: string; zkratka: string; datumText: string; svatek: string | null; dnes: boolean }
/** `bunky`: 7 textů Po–Ne, '' = prázdné políčko. */
export interface RadekRozpisu { zamestnanecId: string; jmeno: string; bunky: string[] }
export interface Rozpis { pondeli: string; nadpis: string; dny: DenRozpisu[]; radky: RadekRozpisu[] }

const ZKRATKY_DNU = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

/** „2026-10-19" → „19. 10." */
const kratkeDatum = (datum: string) => `${Number(datum.slice(8, 10))}. ${Number(datum.slice(5, 7))}.`;

/** „07:00" → „7", „08:30" → „8:30" */
function casKratce(cas: string): string {
  const [hodiny, minuty] = cas.split(':');
  return minuty === '00' ? String(Number(hodiny)) : `${Number(hodiny)}:${minuty}`;
}

/** Čas šablony zkráceně: „12–20", „8–16:30" (pomlčka je en dash). */
export function casSablonyKratce(s: Pick<SablonaSmeny, 'zacatek' | 'konec'>): string {
  return `${casKratce(s.zacatek)}–${casKratce(s.konec)}`;
}

/** Délka směny bez šablony česky: 300 → „5", 270 → „4,5", nejvýš dvě desetinná místa. */
const hodinyCesky = (minuty: number) => String(Math.round((minuty / 60) * 100) / 100).replace('.', ',');

/** Text jedné buňky rozpisu; vše kromě směny a „zavřeno" (i nepřítomnost v docházce) je prázdné. */
export function textBunky(polozka: PlanSmeny | undefined, sablona: SablonaSmeny | undefined, nepritomen: boolean): string {
  if (!polozka || nepritomen) return '';
  if (polozka.typ === 'ZAVRENO') return 'zavřeno';
  if (polozka.typ !== 'SMENA') return '';
  return sablona ? casSablonyKratce(sablona) : `směna ${hodinyCesky(polozka.minuty)} h`;
}

/** Rozsah týdne: „19.–25. 10." (v měsíci), „28. 9.–4. 10." (přes měsíc); s rokem „19.–25. 10. 2026" / „29. 12. 2026–4. 1. 2027". */
function rozsahTydne(pondeli: string, nedele: string, sRokem: boolean): string {
  const [rokOd, mesicOd] = [pondeli.slice(0, 4), pondeli.slice(5, 7)];
  const [rokDo, mesicDo] = [nedele.slice(0, 4), nedele.slice(5, 7)];
  const od = kratkeDatum(pondeli);
  const doKonce = kratkeDatum(nedele);
  if (rokOd !== rokDo) return sRokem ? `${od} ${rokOd}–${doKonce} ${rokDo}` : `${od}–${doKonce}`;
  const text = mesicOd === mesicDo ? `${od.slice(0, od.indexOf('.') + 1)}–${doKonce}` : `${od}–${doKonce}`;
  return sRokem ? `${text} ${rokDo}` : text;
}

export function sestavRozpis(a: {
  pondeli: string;
  dnes: string;
  lide: Zamestnanec[];
  plan: PlanSmeny[];
  sablony: SablonaSmeny[];
  /** Nepřítomnosti z docházky (už vyfiltrované přes `jeNepritomnost`), jen člověk a datum. */
  nepritomnosti: { zamestnanecId: string; datum: string }[];
}): Rozpis {
  const datumy = dnyTydne(a.pondeli);
  // Plán mimo pracovní poměr (zbylé záznamy po ukončení, před nástupem) se do rozpisu nedostane.
  const lidePodleId = new Map(a.lide.map((z) => [z.id, z]));
  const planPodleKlice = new Map(
    a.plan
      .filter((p) => {
        const z = lidePodleId.get(p.zamestnanecId);
        return datumy.includes(p.datum) && z !== undefined && jeVPomeru(z, p.datum);
      })
      .map((p) => [klicBunky(p.zamestnanecId, p.datum), p]),
  );
  const sablonyPodleId = new Map(a.sablony.map((s) => [s.id, s]));
  const nepritomni = new Set(a.nepritomnosti.map((n) => klicBunky(n.zamestnanecId, n.datum)));
  // Jen viditelné buňky (ne v den nepřítomnosti): podle nich se vybírají řádky i řadí, aby pořadí neprozradilo skrytou směnu.
  const viditelnyPlan = new Map([...planPodleKlice].filter(([klic]) => !nepritomni.has(klic)));
  const svatkyRoku = new Map<number, Map<string, string>>();
  const svatekDne = (datum: string) => {
    const rok = Number(datum.slice(0, 4));
    if (!svatkyRoku.has(rok)) svatkyRoku.set(rok, svatky(rok));
    return svatkyRoku.get(rok)!.get(datum) ?? null;
  };

  // Kdo je v rozpisu: aktivní, aspoň jeden den týdne v poměru a (role v plánu, nebo aspoň jedna viditelná směna v týdnu: ne v den nepřítomnosti).
  const vRozpisu = a.lide.filter(
    (z) =>
      z.aktivni &&
      datumy.some((d) => jeVPomeru(z, d)) &&
      (z.rolePlanu !== 'MIMO_PLAN' || datumy.some((d) => viditelnyPlan.get(klicBunky(z.id, d))?.typ === 'SMENA')),
  );

  const dny: DenRozpisu[] = datumy.map((datum) => ({
    datum,
    zkratka: ZKRATKY_DNU[denVTydnu(datum) - 1]!,
    datumText: kratkeDatum(datum),
    svatek: svatekDne(datum),
    dnes: datum === a.dnes,
  }));

  const radky = seradTyden(vRozpisu, datumy, viditelnyPlan, sablonyPodleId).map((z) => ({
    zamestnanecId: z.id,
    jmeno: z.jmeno,
    bunky: datumy.map((datum) => {
      const polozka = planPodleKlice.get(klicBunky(z.id, datum));
      return textBunky(polozka, polozka?.sablonaId ? sablonyPodleId.get(polozka.sablonaId) : undefined, nepritomni.has(klicBunky(z.id, datum)));
    }),
  }));

  return { pondeli: a.pondeli, nadpis: `Rozpis směn ${rozsahTydne(datumy[0]!, datumy[6]!, true)}`, dny, radky };
}

/** Text týdne do WhatsAppu: řádek na den, jen neprázdné buňky v pořadí řádků rozpisu, den bez nikoho „nikdo". */
export function textRozpisu(r: Rozpis): string {
  const radky = r.dny.map((den, i) => {
    const kdo = r.radky.filter((radek) => radek.bunky[i]).map((radek) => `${radek.jmeno} ${radek.bunky[i]}`);
    return `${den.zkratka} ${den.datumText}: ${kdo.length > 0 ? kdo.join(', ') : 'nikdo'}`;
  });
  return [`Rozpis směn ${rozsahTydne(r.dny[0]!.datum, r.dny[6]!.datum, false)}`, ...radky].join('\n');
}

/** Dnešní datum RRRR-MM-DD v Europe/Prague (Worker běží v UTC, v noci by jinak ukázal včerejšek). */
export function dnesVPraze(ted: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ted);
}
