// Sdílený kontrakt API mezi Workerem, appkou a jádrem. Měnit jen vědomě.
export type Smlouva = 'HPP' | 'DPP';
export type Invalidita = 'ZADNA' | 'I' | 'II' | 'III';
export type TypDne = 'PRACE' | 'DOVOLENA' | 'NEMOC' | 'SVATEK_ZAVRENO' | 'NAHRADNI_VOLNO' | 'NEPLACENE' | 'ABSENCE';
export type TypPlanu = 'SMENA' | 'VOLNO' | 'DOVOLENA' | 'ZAVRENO' | 'NEMOC';
/** Role v plánu směn: zodpovědný kasař, učí se kasu (zaskočí v nouzi), prodejna, dozor (má směnu, nepočítá se), mimo plán. */
export type RolePlanu = 'KASA' | 'KASA_UCI_SE' | 'PRODEJNA' | 'DOZOR' | 'MIMO_PLAN';

export interface NastaveniFirmy {
  tydenniPracovniDoba: number;          // h/týden, výchozí 40
  stravnePausalHal: number;             // za směnu, výchozí 12950
  stravneProDpp: boolean;               // výchozí true
  priplatekSobotaHal: number;           // výchozí 30000
  priplatekNedeleHal: number;           // výchozí 30000
  priplatekKasaHal: number;             // výchozí 5000
  praceVeSvatek: 'PRIPLATEK' | 'NAHRADNI_VOLNO'; // výchozí PRIPLATEK
  odmenaZaDenPropadaPriNemoci: boolean; // výchozí true
  urovneOdmenyZaDenHal: number[];       // výchozí [8000, 12000, 16000]
  urovneAktivityHal: number[];          // výchozí [6000, 9000]
  odmenyIProDpp: boolean;               // výchozí true
  zaokrouhleniZpZamestnanec: 'TRETINA_NAHORU';
  planovacKasaOd: string;               // 'HH:MM', odkdy hlídat zodpovědné kasaře, výchozí '08:00'
  planovacKasaDo: string;               // výchozí '18:00'; směna končící v tento čas a později je zavírací
  planovacMinKasaru: number;            // výchozí 1
  planovacOtevrenoOd: string;           // otevírací doba Po–Pá (hlídá „aspoň 2 lidé"), výchozí '08:00'
  planovacOtevrenoDo: string;           // výchozí '18:00'
  planovacSablony: string[];            // id šablon, ze kterých plánovač vybírá, výchozí []
  planovacKotva: string;                // pondělí týdne, kdy platí první šablona pevného střídání, výchozí '2026-01-05'
  planovacDozorNaKaseDo: string;        // 'HH:MM', do kdy se dozor (role DOZOR) počítá jako zodpovědný kasař, výchozí '10:00'
  planovacObsazeni: { od: string; do: string; lidi: number; aspon?: boolean }[]; // kolik lidí (kasa, učící se, prodejna; dozor do planovacDozorNaKaseDo) má být v oknech; aspon = jen minimum; výchozí 8–9 přesně 2, 9–18 aspoň 3
}

export const VYCHOZI_NASTAVENI: NastaveniFirmy = {
  tydenniPracovniDoba: 40,
  stravnePausalHal: 12950,
  stravneProDpp: true,
  priplatekSobotaHal: 30000,
  priplatekNedeleHal: 30000,
  priplatekKasaHal: 5000,
  praceVeSvatek: 'PRIPLATEK',
  odmenaZaDenPropadaPriNemoci: true,
  urovneOdmenyZaDenHal: [8000, 12000, 16000],
  urovneAktivityHal: [6000, 9000],
  odmenyIProDpp: true,
  zaokrouhleniZpZamestnanec: 'TRETINA_NAHORU',
  planovacKasaOd: '08:00',
  planovacKasaDo: '18:00',
  planovacMinKasaru: 1,
  planovacOtevrenoOd: '08:00',
  planovacOtevrenoDo: '18:00',
  planovacSablony: [],
  planovacKotva: '2026-01-05',
  planovacDozorNaKaseDo: '10:00',
  planovacObsazeni: [
    { od: '08:00', do: '09:00', lidi: 2 },
    { od: '09:00', do: '18:00', lidi: 3, aspon: true },
  ],
};

export type NastaveniPlanovace = Pick<NastaveniFirmy, 'planovacKasaOd' | 'planovacKasaDo' | 'planovacMinKasaru' | 'planovacOtevrenoOd' | 'planovacOtevrenoDo' | 'planovacSablony' | 'planovacKotva' | 'planovacDozorNaKaseDo' | 'planovacObsazeni'>;
/** Nastavení výpočtu mezd (formulář firmy) — bez plánovače, ten se nastavuje v záložce Směny. */
export type NastaveniVypoctu = Omit<NastaveniFirmy, keyof NastaveniPlanovace>;

export interface Firma { id: string; nazev: string; ico: string | null; adresa: string | null; ucet: string | null; nastaveni: NastaveniFirmy; vytvoreno: string; }
export interface Dite { ztpp: boolean; }
export interface Zamestnanec {
  id: string; firmaId: string; jmeno: string; prijmeni: string; smlouva: Smlouva;
  uvazekMinTydne: number; nastup: string; ukonceni: string | null; prohlaseni: boolean;
  invalidita: Invalidita; ztpp: boolean; deti: Dite[]; statniPojistenec: boolean;
  slevaNaPojistnem: boolean; ucet: string | null; poznamka: string | null; aktivni: boolean;
  rolePlanu: RolePlanu; stridaniSmen: string[];
  /** Číslo řádku v podkladu pro účetního (1–999); bez čísla je zaměstnanec na konci. */
  poradiPodkladu: number | null;
  /** Zda je zaměstnanec v podkladech pro účetního (PDF a Excel); vypnuté ho z nich vyřadí. */
  vPodkladu: boolean;
}
export interface Sazba { id: string; zamestnanecId: string; platiOd: string; hodinovaHal: number; }
export interface ZamestnanecSeSazbami extends Zamestnanec { sazby: Sazba[]; }
export interface Den { zamestnanecId: string; datum: string; typ: TypDne; minuty: number; kasa: boolean; poznamka: string | null; }
export interface MesicniVstup {
  zamestnanecId: string; rok: number; mesic: number; odmenaZaDenHal: number; aktivitaHal: number;
  jineOdmenyHal: number; srazkyHal: number; prumernyVydelekHal: number | null; poznamka: string | null;
}
export interface DovolenaZustatek { zamestnanecId: string; rok: number; prevodMin: number; narokNavicMin: number; }
export interface SablonaSmeny { id: string; firmaId: string; nazev: string; zacatek: string; konec: string; prestavkaMin: number; barva: string | null; }
export interface PlanSmeny { zamestnanecId: string; datum: string; typ: TypPlanu; sablonaId: string | null; minuty: number; }

/** Snímek výsledku jednoho člověka při uzávěrce. `vysledek` je VysledekVypoctu z jádra (serializovaný JSON). */
export interface UzaverkaRadek { zamestnanecId: string; jmeno: string; smlouva: Smlouva; vysledek: unknown; }
export interface Uzaverka { firmaId: string; rok: number; mesic: number; uzavreno: string; vysledky: UzaverkaRadek[]; }

/** Vše, co appka potřebuje pro obrazovku měsíce jedné firmy. */
export interface MesicData {
  firma: Firma;
  rok: number; mesic: number;
  zamestnanci: ZamestnanecSeSazbami[];           // aktivní v daném měsíci (nástup ≤ konec měsíce, ukončení ≥ začátek nebo null)
  dny: Den[];                                    // dny daného a předchozího kalendářního měsíce těchto lidí
  vstupy: MesicniVstup[];                        // vstupy všech měsíců daného čtvrtletí
  uzaverka: Uzaverka | null;                     // uzávěrka tohoto měsíce
  uzaverkyPredchozihoCtvrtleti: Uzaverka[];      // pro výpočet průměrného výdělku
  dppMinutyPredMesicem: Record<string, number>;  // zamestnanecId → minuty PRACE v roce před tímto měsícem (DPP)
  dovolenaRok: Record<string, { cerpanoMin: number; praceMin: number }>; // za celý rok (vč. tohoto měsíce)
  zustatky: DovolenaZustatek[];                  // pro daný rok
  plan: PlanSmeny[];                             // plán směn daného měsíce
  sablony: SablonaSmeny[];
}

export interface Chyba { chyba: KodChyby; zprava?: string; }
export type KodChyby = 'PRISTUP_NENASTAVEN' | 'NEPRIHLASEN' | 'ZAKAZANO' | 'NENALEZENO' | 'NEPLATNY_VSTUP' | 'MESIC_UZAVREN';

/* ---- Endpointy (všechny pod /api, JSON) ----
GET    /api/zdravi                                   → { ok: true }
GET    /api/ja                                       → { email: string }
GET    /api/firmy                                    → Firma[]
POST   /api/firmy            NovaFirma               → Firma
PUT    /api/firmy/:id        NovaFirma               → Firma
DELETE /api/firmy/:id                                → 204 (smaže vše firmy)
GET    /api/firmy/:id/zamestnanci                    → ZamestnanecSeSazbami[] (všichni, i neaktivní)
POST   /api/zamestnanci      NovyZamestnanec         → ZamestnanecSeSazbami
PUT    /api/zamestnanci/:id  NovyZamestnanec         → ZamestnanecSeSazbami (sazby se nahradí celé)
DELETE /api/zamestnanci/:id                          → 204
GET    /api/firmy/:id/mesic/:rok/:mesic              → MesicData
PUT    /api/dny              UlozDny                 → { ok: true }   (409 MESIC_UZAVREN)
PUT    /api/vstupy           MesicniVstup            → MesicniVstup   (409 MESIC_UZAVREN)
PUT    /api/dovolena         DovolenaZustatek        → DovolenaZustatek
POST   /api/firmy/:id/uzaverka/:rok/:mesic           → Uzaverka
DELETE /api/firmy/:id/uzaverka/:rok/:mesic           → 204
GET    /api/firmy/:id/uzaverky?rok=YYYY              → Uzaverka[]
GET    /api/firmy/:id/sablony                        → SablonaSmeny[]
POST   /api/sablony          NovaSablona             → SablonaSmeny
PUT    /api/sablony/:id      NovaSablona             → SablonaSmeny
DELETE /api/sablony/:id                              → 204
PUT    /api/plan             UlozPlan                → { ok: true }
POST   /api/firmy/:id/plan/:rok/:mesic/prevest       → VysledekPrevodu (409 MESIC_UZAVREN)
GET    /api/firmy/:id/odkazy-rozpisu                 → OdkazRozpisu[] (platné; tablety první)
POST   /api/odkazy-rozpisu   NovyOdkazRozpisu        → OdkazRozpisu (osobní odkaz zruší předchozí téhož člověka)
DELETE /api/odkazy-rozpisu/:id                       → 204 (odkaz přestane platit)
GET    /api/zaloha                                   → Zaloha
POST   /api/demo                                     → Firma
*/
export type NovaFirma = { nazev: string; ico?: string | null; adresa?: string | null; ucet?: string | null; nastaveni?: Partial<NastaveniFirmy> };
export type NovyZamestnanec = Omit<Zamestnanec, 'id' | 'aktivni' | 'rolePlanu' | 'stridaniSmen' | 'poradiPodkladu' | 'vPodkladu'> & {
  aktivni?: boolean; rolePlanu?: RolePlanu; stridaniSmen?: string[]; poradiPodkladu?: number | null; vPodkladu?: boolean; sazby: { platiOd: string; hodinovaHal: number }[];
};
export type UlozDny = { zamestnanecId: string; dny: Omit<Den, 'zamestnanecId'>[]; smazat?: string[] };
export type NovaSablona = Omit<SablonaSmeny, 'id'>;
export type UlozPlan = { zamestnanecId: string; polozky: Omit<PlanSmeny, 'zamestnanecId'>[]; smazat?: string[] };
/** Převod plánu do docházky: `preskoceno` = dny, které už v docházce byly (nepřepisují se); `preskocenoDpp` = „zavřeno" u DPP
 *  (dohoda na náhradu za svátek nárok nemá); `mimoPomer` = plán na dny mimo pracovní poměr. VOLNO se nepočítá nikam. */
export interface VysledekPrevodu { vytvoreno: number; preskoceno: number; preskocenoDpp: number; mimoPomer: number; }
/** Tajný odkaz na veřejný rozpis; `zamestnanecId` null = tablet v prodejně. Zrušené odkazy API nevrací. */
export interface OdkazRozpisu { id: string; firmaId: string; zamestnanecId: string | null; token: string; nazev: string; vytvoreno: string }
export type NovyOdkazRozpisu = { firmaId: string; zamestnanecId: string | null };
export const ADRESA_ROZPISU = 'https://rozpis.ukazka.example';
export const odkazRozpisu = (token: string) => `${ADRESA_ROZPISU}/r/${token}`;
export interface Zaloha { verze: 1; vytvoreno: string; tabulky: Record<string, unknown[]>; }
