/** Zákonné parametry jednoho roku. Peníze v celých Kč (`…Kc`) nebo haléřích (`…Hal`), sazby v promile. */
export interface ParametryRoku {
  readonly rok: number;
  /** Texty o hodnotách, které ještě nejsou závazně vyhlášené; appka u nich ukáže varování. */
  readonly predbezne: readonly string[];
  /** Minimální mzda měsíčně při 40 h týdně, § 111 ZP. */
  readonly minMzdaMesicKc: number;
  /** Minimální mzda za hodinu při 40 h týdně, § 111 ZP. */
  readonly minMzdaHodHal: number;
  /** Průměrná mzda pro pojistné i daň, § 21g ZDP, § 23b z. 589/1992 Sb. */
  readonly prumernaMzdaKc: number;
  /** Měsíční hranice 23% sazby zálohy (3× průměrná mzda), § 38h odst. 2 ZDP. */
  readonly hraniceDan23Kc: number;
  /** Sociální pojištění zaměstnance 7,1 %, § 7 odst. 1 písm. d) z. 589/1992 Sb. */
  readonly spZamPromile: 71;
  /** Sociální pojištění zaměstnavatele 24,8 %, § 7 odst. 1 písm. a) z. 589/1992 Sb. */
  readonly spFirmaPromile: 248;
  /** Zdravotní pojištění celkem 13,5 % (1/3 zaměstnanec, 2/3 zaměstnavatel), § 2 z. 592/1992 Sb. */
  readonly zpCelkemPromile: 135;
  /** Hranice příjmu z DPP, od které vzniká pojištění, § 7a z. 187/2006 Sb. */
  readonly hraniceDppKc: number;
  /** Rozhodný příjem pro zaměstnání malého rozsahu, § 6 odst. 4 písm. b) ZDP. */
  readonly rozhodnyPrijemKc: number;
  /** Měsíční sleva na poplatníka, § 35ba odst. 1 písm. a) ZDP. */
  readonly slevaPoplatnikKc: number;
  /** Měsíční sleva při invaliditě I. a II. stupně (210 Kč), § 35ba odst. 1 písm. c) ZDP. */
  readonly slevaInvaliditaIaIIKc: number;
  /** Měsíční sleva při invaliditě III. stupně (420 Kč), § 35ba odst. 1 písm. d) ZDP. */
  readonly slevaInvaliditaIIIKc: number;
  /** Měsíční sleva pro držitele ZTP/P, § 35ba odst. 1 písm. e) ZDP. */
  readonly slevaZtppKc: number;
  /** Měsíční zvýhodnění na 1., 2. a 3. a další dítě, § 35c odst. 1 ZDP. */
  readonly zvyhodneniDetiKc: readonly [number, number, number];
  /** Minimální měsíční příjem pro vyplacení daňového bonusu (½ min. mzdy), § 35d odst. 4 ZDP. */
  readonly minPrijemBonusKc: number;
  /** Nejnižší vyplácený měsíční daňový bonus, § 35d odst. 4 ZDP. */
  readonly minBonusKc: number;
  /** Osvobozený příspěvek na stravování za směnu, § 6 odst. 9 písm. b) ZDP. */
  readonly stravneLimitHal: number;
  /** Redukční hranice průměrného hodinového výdělku pro náhradu za nemoc (90 / 60 / 30 %), § 192 ZP. */
  readonly redukcniHraniceHal: readonly [number, number, number];
  /** Strop úhrnu vyměřovacích základů pro slevu na pojistném (1,5× průměrná mzda), § 7a–7c z. 589/1992 Sb. */
  readonly slevaPojistneStropKc: number;
  /** Strop vyměřovacího základu na odpracovanou hodinu pro slevu na pojistném, § 7a–7c z. 589/1992 Sb. */
  readonly slevaPojistneKcHod: number;
  /** Limit hodin DPP u jednoho zaměstnavatele za kalendářní rok, § 75 ZP. */
  readonly dppLimitHodin: number;
}
