// Automatický plánovač směn (spec docs/superpowers/specs/2026-10-06-planovac-smen-design.md):
// kontrola obsazení kasy a prodejny v týdnu a návrh směn podle rolí, pevného střídání a přání.
import type { Den, NastaveniPlanovace, PlanSmeny, RolePlanu, SablonaSmeny, TypDne, Zamestnanec } from '../shared/api';
import { datumNaMs, jeSvatek, posunDatum } from './kalendar';
import { casNaMinuty, dnyTydne, jeVPomeru, minutySablony, pondeliTydne } from './plan';

export type ClovekPlanovace = Pick<Zamestnanec, 'id' | 'jmeno' | 'prijmeni' | 'smlouva' | 'nastup' | 'ukonceni' | 'rolePlanu' | 'stridaniSmen'>;

export interface VstupPlanovace {
  /** Pondělí týdne. */
  pondeli: string;
  lide: ClovekPlanovace[];
  /** Plán aspoň tohoto a minulého týdne (další dny nevadí). */
  plan: PlanSmeny[];
  /** Docházka aspoň tohoto týdne. */
  dochazka: Den[];
  sablony: SablonaSmeny[];
  nastaveni: NastaveniPlanovace;
}

export type DruhUpozorneni = 'CHYBI_KASAR' | 'ZASKAKUJE' | 'OBSAZENI' | 'MALO_LIDI' | 'ODPOLEDNE_PODRUHE' | 'PODLE_DOCHAZKY';

/** Problém v obsazení. Úsek dne má `od`/`do` ('HH:MM'); odpolední týden má datum pondělí a čas null. */
export interface Upozorneni {
  druh: DruhUpozorneni;
  datum: string;
  od: string | null;
  do: string | null;
  jmena: string[];
  /** Jen u OBSAZENI: kolik lidí v úseku je a kolik má být. */
  pocet?: number;
  cil?: number;
  /** Jen u OBSAZENI z okna „aspoň“ (víc lidí nevadí, hlásí se jen nedostatek). */
  aspon?: boolean;
}

const TYDEN_MS = 7 * 24 * 60 * 60 * 1000;
const PULHODINA = 30;
const DEN_MIN = 24 * 60;
/** Nejméně lidí na prodejně v otevírací době. */
const MIN_LIDI = 2;

const NEPRITOMNOST: ReadonlySet<TypDne> = new Set(['DOVOLENA', 'NEMOC', 'SVATEK_ZAVRENO', 'NAHRADNI_VOLNO', 'NEPLACENE', 'ABSENCE']);
/** Den docházky, kdy člověk v práci není. */
export const jeNepritomnost = (typ: TypDne) => NEPRITOMNOST.has(typ);

const klic = (zamestnanecId: string, datum: string) => `${zamestnanecId}|${datum}`;
const minutyNaCas = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const podleJmena = (a: ClovekPlanovace, b: ClovekPlanovace) =>
  a.prijmeni.localeCompare(b.prijmeni, 'cs') || a.jmeno.localeCompare(b.jmeno, 'cs') || a.id.localeCompare(b.id);
/** Hlídá se u něj „odpolední týden podruhé" a plánovač mu vybírá směnu. */
const naProdejne = (role: RolePlanu) => role === 'KASA' || role === 'KASA_UCI_SE' || role === 'PRODEJNA';
const jeVolny = (z: ClovekPlanovace) => z.stridaniSmen.length === 0 && naProdejne(z.rolePlanu);

/** Kolikátá šablona pevného střídání platí v týdnu s pondělím `pondeli` (týden kotvy = 0). Funguje i před kotvou a přes přelom roku. */
export function indexStridani(kotva: string, pondeli: string, delka: number): number {
  const tydny = Math.round((datumNaMs(pondeliTydne(pondeli)) - datumNaMs(pondeliTydne(kotva))) / TYDEN_MS);
  return ((tydny % delka) + delka) % delka;
}

/** Zavírací směna končí v `kasaDo` nebo později; směna přes půlnoc je zavírací vždy. */
export function jeZaviraci(s: Pick<SablonaSmeny, 'zacatek' | 'konec'>, kasaDo: string): boolean {
  const konec = casNaMinuty(s.konec);
  return konec <= casNaMinuty(s.zacatek) || konec >= casNaMinuty(kasaDo);
}

/** Směny se šablonou v týdnu (Po–Ne) a kolik z nich je zavíracích. */
export function smenyTydne(zamestnanecId: string, pondeli: string, plan: PlanSmeny[], sablony: Map<string, SablonaSmeny>, kasaDo: string) {
  const dny = new Set(dnyTydne(pondeli));
  let smen = 0;
  let zaviracich = 0;
  for (const p of plan) {
    if (p.zamestnanecId !== zamestnanecId || p.typ !== 'SMENA' || !p.sablonaId || !dny.has(p.datum)) continue;
    const s = sablony.get(p.sablonaId);
    if (!s) continue;
    smen += 1;
    if (jeZaviraci(s, kasaDo)) zaviracich += 1;
  }
  return { smen, zaviracich };
}

/** Odpolední týden: víc než polovina směn týdne je zavíracích. */
export function jeOdpoledniTyden(zamestnanecId: string, pondeli: string, plan: PlanSmeny[], sablony: SablonaSmeny[], kasaDo: string): boolean {
  const { smen, zaviracich } = smenyTydne(zamestnanecId, pondeli, plan, new Map(sablony.map((s) => [s.id, s])), kasaDo);
  return zaviracich * 2 > smen;
}

/** Společné podklady kontroly i návrhu: mřížka po půlhodinách přes hlídání kasy, otevírací dobu a okna ranního obsazení, Po–Pá bez svátků. */
export interface Kontext {
  dny: string[];
  od: number;
  slotu: number;
  kasa: [number, number];
  otevreno: [number, number];
  minKasaru: number;
  /** V půlhodinách mřížky před touto se dozor počítá jako zodpovědný kasař. */
  dozorDo: number;
  /**
   * Kolik lidí má být v půlhodině mřížky (−1 = bez cíle); při překryvu oken platí pozdější okno. Počítají se KASA, KASA_UCI_SE
   * a PRODEJNA, dozor jen před `dozorDo`.
   */
  obsazeni: Int32Array;
  /** 1 = cíl půlhodiny je jen minimum (okno „aspoň“), 0 = přesný počet. */
  aspon: Uint8Array;
  sablony: Map<string, SablonaSmeny>;
  plan: Map<string, PlanSmeny>;
  nepritomen: Set<string>;
  lide: ClovekPlanovace[];
}

export function kontext(v: VstupPlanovace): Kontext {
  const n = v.nastaveni;
  const [kasaOd, kasaDo] = [casNaMinuty(n.planovacKasaOd), casNaMinuty(n.planovacKasaDo)];
  const [otevOd, otevDo] = [casNaMinuty(n.planovacOtevrenoOd), casNaMinuty(n.planovacOtevrenoDo)];
  const okna = n.planovacObsazeni.map((o) => ({ od: casNaMinuty(o.od), do: casNaMinuty(o.do), lidi: o.lidi, aspon: o.aspon ? 1 : 0 }));
  const od = Math.min(kasaOd, otevOd, ...okna.map((o) => o.od));
  const slotu = Math.max(0, Math.ceil((Math.max(kasaDo, otevDo, ...okna.map((o) => o.do)) - od) / PULHODINA));
  const rozsah = (z: number, k: number): [number, number] => {
    const a = Math.max(0, Math.ceil((z - od) / PULHODINA));
    return [a, Math.max(a, Math.min(slotu, Math.floor((k - od) / PULHODINA)))];
  };
  const obsazeni = new Int32Array(slotu).fill(-1);
  const aspon = new Uint8Array(slotu);
  for (const o of okna) {
    obsazeni.fill(o.lidi, ...rozsah(o.od, o.do));
    aspon.fill(o.aspon, ...rozsah(o.od, o.do));
  }
  return {
    dny: dnyTydne(v.pondeli).slice(0, 5).filter((d) => !jeSvatek(d)),
    od,
    slotu,
    kasa: rozsah(kasaOd, kasaDo),
    otevreno: rozsah(otevOd, otevDo),
    minKasaru: n.planovacMinKasaru,
    dozorDo: Math.min(slotu, Math.max(0, Math.ceil((casNaMinuty(n.planovacDozorNaKaseDo) - od) / PULHODINA))),
    obsazeni,
    aspon,
    sablony: new Map(v.sablony.map((s) => [s.id, s])),
    plan: new Map(v.plan.map((p) => [klic(p.zamestnanecId, p.datum), p])),
    nepritomen: new Set(v.dochazka.filter((d) => jeNepritomnost(d.typ)).map((d) => klic(d.zamestnanecId, d.datum))),
    lide: [...v.lide].sort(podleJmena),
  };
}

/** Půlhodiny mřížky [od, do), které směna šablony celé pokrývá. */
export function slotySablony(ctx: Kontext, s: SablonaSmeny): [number, number] {
  const z = casNaMinuty(s.zacatek);
  let k = casNaMinuty(s.konec);
  if (k <= z) k += DEN_MIN;
  const a = Math.max(0, Math.ceil((z - ctx.od) / PULHODINA));
  return [a, Math.max(a, Math.min(ctx.slotu, Math.floor((k - ctx.od) / PULHODINA)))];
}

/** Kdy je člověk ten den na prodejně podle plánu (`plan`), nebo null: mimo poměr, nepřítomen v docházce, bez směny se šablonou. */
export function pritomnost(ctx: Kontext, z: ClovekPlanovace, datum: string, plan: Map<string, PlanSmeny>): [number, number] | null {
  if (!jeVPomeru(z, datum) || ctx.nepritomen.has(klic(z.id, datum))) return null;
  const p = plan.get(klic(z.id, datum));
  const s = p?.typ === 'SMENA' && p.sablonaId ? ctx.sablony.get(p.sablonaId) : undefined;
  return s ? slotySablony(ctx, s) : null;
}

/** Jméno do upozornění: křestní, a když ho má víc lidí, i s příjmením. */
function jmenovac(lide: ClovekPlanovace[]): (z: ClovekPlanovace) => string {
  const pocet = new Map<string, number>();
  for (const z of lide) pocet.set(z.jmeno, (pocet.get(z.jmeno) ?? 0) + 1);
  return (z) => ((pocet.get(z.jmeno) ?? 0) > 1 ? `${z.jmeno} ${z.prijmeni}` : z.jmeno);
}

type Stav = { druh: DruhUpozorneni; jmena: string[]; pocet?: number; cil?: number; aspon?: boolean } | null;

/** Projde půlhodiny [od, do) a sousední se stejným stavem sloučí do jednoho upozornění. */
function useky(vysledek: Upozorneni[], ctx: Kontext, datum: string, [od, doSlotu]: [number, number], stav: (s: number) => Stav) {
  let otevreny: Upozorneni | null = null;
  let klicOtevreneho = '';
  for (let s = od; s < doSlotu; s++) {
    const st = stav(s);
    const k = st ? `${st.druh}|${st.jmena.join(',')}|${st.pocet ?? ''}|${st.cil ?? ''}|${st.aspon ?? ''}` : '';
    const konec = minutyNaCas(ctx.od + (s + 1) * PULHODINA);
    if (st && otevreny && k === klicOtevreneho) {
      otevreny.do = konec;
      continue;
    }
    otevreny = st
      ? {
        druh: st.druh, datum, od: minutyNaCas(ctx.od + s * PULHODINA), do: konec, jmena: st.jmena,
        ...(st.pocet === undefined ? {} : { pocet: st.pocet, cil: st.cil }), ...(st.aspon ? { aspon: true } : {}),
      }
      : null;
    klicOtevreneho = k;
    if (otevreny) vysledek.push(otevreny);
  }
}

/** Odchylka od cíle obsazení: u okna „aspoň“ jen nedostatek, jinak rozdíl oběma směry. */
const odchylka = (pocet: number, cil: number, aspon: number) => (aspon ? Math.max(0, cil - pocet) : Math.abs(pocet - cil));

/** Upozornění k obsazení týdne Po–Pá (svátky se přeskočí) podle plánu a docházky. */
export function kontrolaTydne(v: VstupPlanovace): Upozorneni[] {
  const ctx = kontext(v);
  const jmeno = jmenovac(ctx.lide);
  const vysledek: Upozorneni[] = [];
  for (const datum of ctx.dny) {
    const pritomni: { z: ClovekPlanovace; od: number; do: number }[] = [];
    for (const z of ctx.lide) {
      const k = klic(z.id, datum);
      if (ctx.plan.get(k)?.typ === 'SMENA' && ctx.nepritomen.has(k) && jeVPomeru(z, datum)) {
        vysledek.push({ druh: 'PODLE_DOCHAZKY', datum, od: null, do: null, jmena: [jmeno(z)] });
      }
      const p = pritomnost(ctx, z, datum, ctx.plan);
      if (p) pritomni.push({ z, od: p[0], do: p[1] });
    }
    const tam = (s: number, role?: RolePlanu) => pritomni.filter((x) => x.od <= s && s < x.do && (!role || x.z.rolePlanu === role));
    useky(vysledek, ctx, datum, ctx.kasa, (s) => {
      // Ráno (před planovacDozorNaKaseDo) stojí na kase i dozor.
      const kasari = tam(s, 'KASA').length + (s < ctx.dozorDo ? tam(s, 'DOZOR').length : 0);
      if (kasari >= ctx.minKasaru) return null;
      const uci = tam(s, 'KASA_UCI_SE').map((x) => jmeno(x.z)).sort((a, b) => a.localeCompare(b, 'cs'));
      return kasari + uci.length >= ctx.minKasaru ? { druh: 'ZASKAKUJE', jmena: uci } : { druh: 'CHYBI_KASAR', jmena: [] };
    });
    useky(vysledek, ctx, datum, [0, ctx.slotu], (s) => {
      const cil = ctx.obsazeni[s]!;
      if (cil < 0) return null;
      // Stejně jako ve skóre návrhu: lidé na prodejně a dozor jen před planovacDozorNaKaseDo.
      const pocet = tam(s).filter((x) => naProdejne(x.z.rolePlanu)).length + (s < ctx.dozorDo ? tam(s, 'DOZOR').length : 0);
      if (odchylka(pocet, cil, ctx.aspon[s]!) === 0) return null;
      return { druh: 'OBSAZENI', jmena: [], pocet, cil, ...(ctx.aspon[s] ? { aspon: true } : {}) };
    });
    useky(vysledek, ctx, datum, ctx.otevreno, (s) => (tam(s).length < MIN_LIDI ? { druh: 'MALO_LIDI', jmena: [] } : null));
  }
  const minuly = posunDatum(v.pondeli, -7);
  for (const z of ctx.lide) {
    // Dohody (DPP) plánovač neplánuje, takže jim odpolední týden nehlídá.
    if (!jeVolny(z) || z.smlouva === 'DPP') continue;
    const kasaDo = v.nastaveni.planovacKasaDo;
    if (jeOdpoledniTyden(z.id, v.pondeli, v.plan, v.sablony, kasaDo) && jeOdpoledniTyden(z.id, minuly, v.plan, v.sablony, kasaDo)) {
      vysledek.push({ druh: 'ODPOLEDNE_PODRUHE', datum: v.pondeli, od: null, do: null, jmena: [jmeno(z)] });
    }
  }
  return vysledek;
}

export interface NavrhTydne {
  /** Nové položky plánu (jen do prázdných dnů). */
  nove: PlanSmeny[];
  /** Kontrola týdne po doplnění návrhu. */
  upozorneni: Upozorneni[];
  /** true = nejlepší návrh ze všech kombinací; false = z postupného zlepšování (nejlepší dosažený, pokaždé stejný). */
  presny: boolean;
}

/** Do tolika kombinací se zkusí všechny; nad to se zlepšuje postupně (po jednom i po dvou lidech, z několika začátků). */
export const MEZ_KOMBINACI = 2_000_000;
/**
 * Nejvíc navštívených uzlů při procházení všech kombinací; pak se hledání vzdá a návrh dá postupné zlepšování.
 * Počítá se v uzlech, ne v čase, aby byl výsledek na každém zařízení stejný.
 */
export const ROZPOCET_UZLU = 50_000;

/** Nastavení hledání návrhu, jiné hodnoty než výchozí jen pro testy. */
export interface VolbyHledani {
  mezKombinaci?: number;
  rozpocetUzlu?: number;
  /** Všechny kombinace bez odhadů a bez vynechání prohozených stejných lidí (kontrola, že odhady nic neztratí). */
  bezOrezavani?: boolean;
}

const smena = (zamestnanecId: string, datum: string, s: SablonaSmeny): PlanSmeny =>
  ({ zamestnanecId, datum, typ: 'SMENA', sablonaId: s.id, minuty: minutySablony(s) });

interface Pocty { kasari: Int32Array; uci: Int32Array; dozor: Int32Array; prodejna: Int32Array; celkem: Int32Array }
const novePocty = (n: number): Pocty =>
  ({ kasari: new Int32Array(n), uci: new Int32Array(n), dozor: new Int32Array(n), prodejna: new Int32Array(n), celkem: new Int32Array(n) });

/** Připočte (`kolik` = 1) nebo odečte (−1) člověka s rolí v půlhodinách `indexy` (den × půlhodina). */
function pricti(p: Pocty, role: RolePlanu, indexy: number[], kolik = 1) {
  const roleNaProdejne = naProdejne(role);
  for (const j of indexy) {
    p.celkem[j] += kolik;
    if (role === 'KASA') p.kasari[j] += kolik;
    if (role === 'KASA_UCI_SE') p.uci[j] += kolik;
    if (role === 'DOZOR') p.dozor[j] += kolik;
    if (roleNaProdejne) p.prodejna[j] += kolik;
  }
}

const indexyDne = (ctx: Kontext, den: number, [a, b]: [number, number]) => Array.from({ length: b - a }, (_, i) => den * ctx.slotu + a + i);

/** Porovná prvních `k` složek skóre: −1 = `a` je lepší, 1 = horší, 0 = stejné. */
function porovnej(a: number[], b: number[], k: number): number {
  for (let i = 0; i < k; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  return 0;
}

/**
 * Skóre týdne, menší je lepší, porovnává se po složkách: půlhodiny bez kasařů ani s učícími se, lidé s odpoledním
 * týdnem podruhé, půlhodiny se zaskakováním, váha zaskakování (dřív v den váží víc), odchylka od obsazení
 * (Σ |lidé − cíl| po půlhodinách oken, u okna „aspoň“ jen nedostatek; lidé = KASA + KASA_UCI_SE + PRODEJNA),
 * půlhodiny s méně než 2 lidmi, nevyrovnanost počtu lidí na prodejně (n·Σc² − (Σc)² po dnech).
 * Před planovacDozorNaKaseDo se mezi kasaře i do obsazení počítá i dozor.
 * S `mez` vrátí skóre, jen když není horší než `mez` (jinak null); počítá po složkách a skončí, jakmile je jasně horší.
 */
function skore(ctx: Kontext, p: Pocty, odpoledne: number): number[];
function skore(ctx: Kontext, p: Pocty, odpoledne: number, mez: number[] | null): number[] | null;
function skore(ctx: Kontext, p: Pocty, odpoledne: number, mez: number[] | null = null): number[] | null {
  // [chybí, odpoledne, zaskakuje, váha, odchylka obsazení, málo lidí, nevyrovnanost]
  const sk = [0, odpoledne, 0, 0, 0, 0, 0];
  /** −1 = už je lepší než mez (nebo mez není), 0 = zatím stejné, 1 = horší. */
  let stav = mez ? 0 : -1;
  const horsi = (k: number) => {
    if (stav === 0) stav = porovnej(sk, mez!, k);
    return stav > 0;
  };
  const [ko, kd] = ctx.kasa;
  const [oo, od] = ctx.otevreno;
  for (let i = 0; i < ctx.dny.length; i++) {
    const zaklad = i * ctx.slotu;
    let soucet = 0;
    let ctverce = 0;
    for (let s = ko; s < kd; s++) {
      const j = zaklad + s;
      const kasari = p.kasari[j]! + (s < ctx.dozorDo ? p.dozor[j]! : 0);
      if (kasari < ctx.minKasaru) {
        if (kasari + p.uci[j]! >= ctx.minKasaru) {
          sk[2] += 1;
          sk[3] += kd - s;
        } else sk[0] += 1;
      }
      soucet += p.prodejna[j]!;
      ctverce += p.prodejna[j]! ** 2;
    }
    sk[6] += (kd - ko) * ctverce - soucet * soucet;
  }
  if (horsi(4)) return null;
  for (let i = 0; i < ctx.dny.length; i++) {
    const zaklad = i * ctx.slotu;
    for (let s = 0; s < ctx.slotu; s++) {
      if (ctx.obsazeni[s]! < 0) continue;
      const j = zaklad + s;
      sk[4] += odchylka(p.prodejna[j]! + (s < ctx.dozorDo ? p.dozor[j]! : 0), ctx.obsazeni[s]!, ctx.aspon[s]!);
    }
  }
  if (horsi(5)) return null;
  for (let i = 0; i < ctx.dny.length; i++) for (let s = oo; s < od; s++) if (p.celkem[i * ctx.slotu + s]! < MIN_LIDI) sk[5] += 1;
  if (horsi(7)) return null;
  return sk;
}

const lepsi = (a: number[], b: number[]) => porovnej(a, b, a.length) < 0;
/** Lexikograficky menší volby (první člověk je nejvyšší řád): rozhodují při shodě skóre, ať je výsledek pokaždé stejný. */
const mensiVolby = (a: number[], b: number[]) => porovnej(a, b, a.length) < 0;
/** Pořadí průchodu všech kombinací: nejdřív kasaři, pak učící se, aby šly odhady chybějících kasařů použít co nejdřív. */
const poradiRole = (role: RolePlanu) => (role === 'KASA' ? 0 : role === 'KASA_UCI_SE' ? 1 : 2);

/**
 * Index šablony z `moznosti` pro každého z `volni` (celý týden stejná). Procházení všech kombinací je přesné: nejlepší skóre,
 * při shodě lexikograficky nejmenší volby. Postupné zlepšování (nad mez kombinací nebo po vyčerpání rozpočtu uzlů) je jen
 * nejlepší snaha, ale pokaždé dá stejný výsledek.
 */
function vyberSmeny(
  ctx: Kontext, v: VstupPlanovace, zakladniPlan: PlanSmeny[], volni: ClovekPlanovace[], volneDny: Map<string, string[]>, moznosti: SablonaSmeny[],
  hledani: Required<VolbyHledani>,
): { volby: number[]; presny: boolean } {
  const kasaDo = v.nastaveni.planovacKasaDo;
  const planMapa = new Map(zakladniPlan.map((p) => [klic(p.zamestnanecId, p.datum), p]));
  const zaklad = novePocty(ctx.dny.length * ctx.slotu);
  for (const z of ctx.lide) {
    ctx.dny.forEach((d, i) => {
      const p = pritomnost(ctx, z, d, planMapa);
      if (p) pricti(zaklad, z.rolePlanu, indexyDne(ctx, i, p));
    });
  }
  const prinosy = volni.map((z) => moznosti.map((s) => {
    const dny = new Set(volneDny.get(z.id));
    return ctx.dny.flatMap((d, i) => (dny.has(d) ? indexyDne(ctx, i, slotySablony(ctx, s)) : []));
  }));
  const minuly = posunDatum(v.pondeli, -7);
  const odpoledne = volni.map((z) => {
    if (!jeOdpoledniTyden(z.id, minuly, v.plan, v.sablony, kasaDo)) return moznosti.map(() => false);
    const { smen, zaviracich } = smenyTydne(z.id, v.pondeli, zakladniPlan, ctx.sablony, kasaDo);
    const pocet = volneDny.get(z.id)!.length;
    return moznosti.map((s) => (zaviracich + (jeZaviraci(s, kasaDo) ? pocet : 0)) * 2 > smen + pocet);
  });

  const pocty = novePocty(zaklad.celkem.length);
  const odZakladu = () => {
    pocty.kasari.set(zaklad.kasari);
    pocty.uci.set(zaklad.uci);
    pocty.dozor.set(zaklad.dozor);
    pocty.prodejna.set(zaklad.prodejna);
    pocty.celkem.set(zaklad.celkem);
  };
  const m = moznosti.length;
  const n = volni.length;
  const presne = m ** n <= hledani.mezKombinaci ? vsechnyKombinace() : null;
  return presne ? { volby: presne, presny: true } : { volby: postupneZlepsovani(), presny: false };

  /**
   * Všechny kombinace do hloubky: počty se po lidech přičítají a zase odečítají, skóre se v listu počítá jen, dokud může
   * být aspoň stejné jako dosud nejlepší, a větev, která už lepší být nemůže, se přeskočí. Po `rozpocetUzlu` uzlech vrátí null.
   */
  function vsechnyKombinace(): number[] | null {
    const poradi = volni.map((_, i) => i).sort((a, b) => poradiRole(volni[a]!.rolePlanu) - poradiRole(volni[b]!.rolePlanu) || a - b);
    // Kolik lidí z hloubky h a dál (kasařů / učících se / všech) může v půlhodině stát aspoň v jedné ze svých směn.
    const zbyvaKasaru = Array.from({ length: n + 1 }, () => new Int32Array(zaklad.celkem.length));
    const zbyvaUcicich = Array.from({ length: n + 1 }, () => new Int32Array(zaklad.celkem.length));
    const zbyvaVsech = Array.from({ length: n + 1 }, () => new Int32Array(zaklad.celkem.length));
    for (let h = n - 1; h >= 0; h--) {
      zbyvaKasaru[h]!.set(zbyvaKasaru[h + 1]!);
      zbyvaUcicich[h]!.set(zbyvaUcicich[h + 1]!);
      zbyvaVsech[h]!.set(zbyvaVsech[h + 1]!);
      const i = poradi[h]!;
      const role = volni[i]!.rolePlanu;
      for (const j of new Set(prinosy[i]!.flat())) {
        zbyvaVsech[h]![j] += 1;
        if (role === 'KASA') zbyvaKasaru[h]![j] += 1;
        if (role === 'KASA_UCI_SE') zbyvaUcicich[h]![j] += 1;
      }
    }
    // Dva stejní lidé (role, příspěvky, odpolední týden) dají po prohození stejné skóre a menší volby má ten, kdo má dřív
    // menší šablonu: pozdější z nich proto začíná od šablony toho dřívějšího (hloubka dřívějšího, nebo −1).
    const klicCloveka = (i: number) => JSON.stringify([volni[i]!.rolePlanu, odpoledne[i], prinosy[i]]);
    const stejnyPred = poradi.map((i, h) => (hledani.bezOrezavani ? -1 : poradi.slice(0, h).findLastIndex((k) => klicCloveka(k) === klicCloveka(i))));
    const [ko, kd] = ctx.kasa;
    const [oo, od] = ctx.otevreno;
    const odhad = [0, 0, 0, 0, 0, 0, 0];
    /** Půlhodiny mřížky s cílem obsazení. */
    const slotyCile = Array.from({ length: ctx.slotu }, (_, s) => s).filter((s) => ctx.obsazeni[s]! >= 0);
    // Kasaři a učící se jdou v pořadí první: od hloubky `poKasarich` se odhad u kasy už nemění, spočítá se jednou pro celou větev.
    const poKasarich = volni.filter((z) => poradiRole(z.rolePlanu) < 2).length;
    const kasa = { chybi: 0, zaskakuje: 0, vaha: 0, bezKasaru: 0 };
    const odhadKasy = (h: number) => {
      kasa.chybi = 0;
      kasa.zaskakuje = 0;
      kasa.vaha = 0;
      kasa.bezKasaru = 0;
      for (let i = 0; i < ctx.dny.length; i++) {
        for (let s = ko; s < kd; s++) {
          const j = i * ctx.slotu + s;
          const ted = pocty.kasari[j]! + (s < ctx.dozorDo ? pocty.dozor[j]! : 0);
          const kasari = ted + zbyvaKasaru[h]![j]!;
          if (kasari >= ctx.minKasaru) continue;
          kasa.bezKasaru += 1;
          if (kasari + pocty.uci[j]! + zbyvaUcicich[h]![j]! < ctx.minKasaru) kasa.chybi += 1;
          else if (ted + pocty.uci[j]! >= ctx.minKasaru) {
            kasa.zaskakuje += 1;
            kasa.vaha += kd - s;
          }
        }
      }
    };
    /**
     * Větev v hloubce h se přeskočí, jen když je každé její doplnění ostře horší než `nej`. Odhad zdola po složkách, jako by
     * všichni zbylí stáli ve všech svých směnách naráz: chybí kasař i se zbylými; odpolední týdny s dalšími lidmi jen přibývají;
     * zaskakuje tam, kde zodpovědní nebudou ani se zbylými, ale s už rozdělenými učícími se je jich dost (i váha); odchylka
     * od obsazení (lidí jen přibývá); málo lidí i se zbylými. Navíc: když chybí stejně jako u `nej`, zaskakuje se ve všech
     * ostatních půlhodinách bez dost zodpovědných kasařů.
     */
    const nelzeZlepsit = (h: number, odp: number, nej: number[]) => {
      odhad.fill(0);
      [odhad[0], odhad[1], odhad[2], odhad[3]] = [kasa.chybi, odp, kasa.zaskakuje, kasa.vaha];
      const [c, o, z] = nej as [number, number, number];
      if (odhad[0] === c && (odp > o || (odp === o && kasa.bezKasaru - c > z))) return true;
      const zatim = porovnej(odhad, nej, 4);
      if (zatim !== 0) return zatim > 0;
      for (let i = 0; i < ctx.dny.length; i++) {
        const zaklad = i * ctx.slotu;
        for (const s of slotyCile) {
          const cil = ctx.obsazeni[s]!;
          const j = zaklad + s;
          const ted = pocty.prodejna[j]! + (s < ctx.dozorDo ? pocty.dozor[j]! : 0);
          const nejvys = ted + zbyvaVsech[h]![j]!;
          odhad[4] += ctx.aspon[s] ? Math.max(0, cil - nejvys) : Math.max(0, ted - cil, cil - nejvys);
        }
        for (let s = oo; s < od; s++) if (pocty.celkem[zaklad + s]! + zbyvaVsech[h]![zaklad + s]! < MIN_LIDI) odhad[5] += 1;
      }
      return porovnej(odhad, nej, odhad.length) > 0;
    };
    odZakladu();
    const volby = new Array<number>(n).fill(0);
    let nejlepsi = [...volby];
    let nejSkore: number[] | null = null;
    let odp = 0;
    let uzlu = 0;
    const projdi = (h: number) => {
      if (uzlu > hledani.rozpocetUzlu) return;
      uzlu += 1;
      if (h === n) {
        const sk = skore(ctx, pocty, odp, nejSkore);
        if (sk && (!nejSkore || lepsi(sk, nejSkore) || mensiVolby(volby, nejlepsi))) {
          nejSkore = sk;
          nejlepsi = [...volby];
        }
        return;
      }
      if (h <= poKasarich) odhadKasy(h);
      if (nejSkore && !hledani.bezOrezavani && nelzeZlepsit(h, odp, nejSkore)) return;
      const i = poradi[h]!;
      const role = volni[i]!.rolePlanu;
      for (let o = stejnyPred[h]! >= 0 ? volby[poradi[stejnyPred[h]!]!]! : 0; o < m; o++) {
        volby[i] = o;
        const odpO = odpoledne[i]![o] ? 1 : 0;
        pricti(pocty, role, prinosy[i]![o]!);
        odp += odpO;
        projdi(h + 1);
        pricti(pocty, role, prinosy[i]![o]!, -1);
        odp -= odpO;
      }
    };
    projdi(0);
    return uzlu > hledani.rozpocetUzlu ? null : nejlepsi;
  }

  /**
   * Postupné zlepšování z několika začátků (hladově po jednom člověku a „všichni stejnou šablonu“ pro každou šablonu):
   * mění jednoho člověka, a když to nejde, dva naráz, dokud se skóre (při shodě volby) zlepšuje.
   */
  function postupneZlepsovani(): number[] {
    /** Skóre pro volby (−1 = člověk zatím bez směny). */
    const ohodnot = (volby: number[]) => {
      odZakladu();
      let odp = 0;
      volby.forEach((o, i) => {
        if (o < 0) return;
        pricti(pocty, volni[i]!.rolePlanu, prinosy[i]![o]!);
        if (odpoledne[i]![o]) odp += 1;
      });
      return skore(ctx, pocty, odp);
    };
    /** U lidí `kdo` (jeden nebo dva) zkusí všechny volby a nechá nejlepší; vrátí nové skóre, nebo null, když se nic nezměnilo. */
    const nejlepsiZmena = (volby: number[], kdo: number[], sk: number[] | null): number[] | null => {
      let nejVolby = [...volby];
      let nejSk = sk;
      let zmena = false;
      for (let c = 0; c < m ** kdo.length; c++) {
        let x = c;
        for (let k = kdo.length - 1; k >= 0; k--) {
          volby[kdo[k]!] = x % m;
          x = Math.floor(x / m);
        }
        const s = ohodnot(volby);
        if (!nejSk || lepsi(s, nejSk) || (!lepsi(nejSk, s) && mensiVolby(volby, nejVolby))) {
          nejVolby = [...volby];
          nejSk = s;
          zmena = true;
        }
      }
      for (const i of kdo) volby[i] = nejVolby[i]!;
      return zmena ? nejSk : null;
    };
    const zlepsuj = (volby: number[]) => {
      let sk = ohodnot(volby);
      for (let kolo = 0; kolo < 1000; kolo++) {
        let zmena = false;
        for (let i = 0; i < n; i++) {
          const nove = nejlepsiZmena(volby, [i], sk);
          if (nove) [sk, zmena] = [nove, true];
        }
        if (zmena) continue;
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const nove = nejlepsiZmena(volby, [i, j], sk);
            if (nove) [sk, zmena] = [nove, true];
          }
        }
        if (!zmena) break;
      }
      return sk;
    };
    const hladove = new Array<number>(n).fill(-1);
    for (let i = 0; i < n; i++) nejlepsiZmena(hladove, [i], null);
    let nejlepsi: number[] = [];
    let nejSkore: number[] | null = null;
    for (const volby of [hladove, ...moznosti.map((_, o) => new Array<number>(n).fill(o))]) {
      const sk = zlepsuj(volby);
      if (!nejSkore || lepsi(sk, nejSkore) || (!lepsi(nejSkore, sk) && mensiVolby(volby, nejlepsi))) {
        nejSkore = sk;
        nejlepsi = volby;
      }
    }
    return nejlepsi;
  }
}

/**
 * Návrh týdne Po–Pá (bez svátků) do prázdných dnů: lidé s pevným střídáním dostanou šablonu podle týdne od kotvy,
 * ostatní s rolí KASA / KASA_UCI_SE / PRODEJNA jednu šablonu z `planovacSablony` na celý týden podle skóre.
 * Nikdy nepřepíše vyplněný den ani den s nepřítomností v docházce; dohody (DPP), MIMO_PLAN a DOZOR bez střídání neplánuje.
 * Do `MEZ_KOMBINACI` kombinací a `ROZPOCET_UZLU` uzlů se zkusí všechny, jinak se zlepšuje postupně (`hledani` jen pro testy).
 */
export function navrhniTyden(v: VstupPlanovace, hledani: VolbyHledani = {}): NavrhTydne {
  const ctx = kontext(v);
  const n = v.nastaveni;
  const nove: PlanSmeny[] = [];
  const volneDny = new Map<string, string[]>();
  for (const z of ctx.lide) {
    if (z.rolePlanu === 'MIMO_PLAN' || z.smlouva === 'DPP') continue;
    const dny = ctx.dny.filter((d) => jeVPomeru(z, d) && !ctx.plan.has(klic(z.id, d)) && !ctx.nepritomen.has(klic(z.id, d)));
    if (dny.length === 0) continue;
    if (z.stridaniSmen.length > 0) {
      const s = ctx.sablony.get(z.stridaniSmen[indexStridani(n.planovacKotva, v.pondeli, z.stridaniSmen.length)]!);
      if (s) for (const d of dny) nove.push(smena(z.id, d, s));
    } else if (jeVolny(z)) volneDny.set(z.id, dny);
  }
  const moznosti = n.planovacSablony.map((id) => ctx.sablony.get(id)).filter((s): s is SablonaSmeny => s !== undefined);
  const volni = ctx.lide.filter((z) => volneDny.has(z.id));
  let presny = true;
  if (moznosti.length > 0 && volni.length > 0) {
    const vyber = vyberSmeny(ctx, v, [...v.plan, ...nove], volni, volneDny, moznosti, {
      mezKombinaci: MEZ_KOMBINACI, rozpocetUzlu: ROZPOCET_UZLU, bezOrezavani: false, ...hledani,
    });
    presny = vyber.presny;
    volni.forEach((z, i) => {
      for (const d of volneDny.get(z.id)!) nove.push(smena(z.id, d, moznosti[vyber.volby[i]!]!));
    });
  }
  return { nove, upozorneni: kontrolaTydne({ ...v, plan: [...v.plan, ...nove] }), presny };
}
