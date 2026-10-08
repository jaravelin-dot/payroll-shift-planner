import { Copy, ExternalLink, Link2, MessageCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { odkazRozpisu, type OdkazRozpisu, type Zamestnanec } from '../../shared/api';
import { useOdkazyRozpisu, useVytvorOdkazRozpisu, useZamestnanci, useZrusOdkazRozpisu } from '../api/dotazy';
import { ChybaHlaska } from './ChybaHlaska';
import { Nacitani } from './Nacitani';
import { Sekce } from './Sekce';
import { SpodniPanel } from './SpodniPanel';
import { Tlacitko, tridyTlacitka } from './Tlacitko';

/** Zpráva do WhatsAppu osobě; výběr kontaktu udělá WhatsApp (`wa.me` bez čísla). */
function adresaWhatsApp(jmeno: string, token: string): string {
  const text = `Ahoj ${jmeno}, tady je tvůj rozpis směn: ${odkazRozpisu(token)} — ulož si ho na plochu telefonu.`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

const DOBA_HLASKY_MS = 2500;

type Potvrzeni = { druh: 'zrusit' | 'novy'; odkaz: OdkazRozpisu; clovek: Zamestnanec | null };

/** Řádek se jménem a tlačítky; na mobilu jdou tlačítka pod jméno a zalamují se. */
function Radek({ nazev, children }: { nazev: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="min-w-0 truncate text-15 font-semibold">{nazev}</span>
      <span className="-ml-4 flex flex-wrap items-center sm:ml-0 sm:shrink-0 sm:justify-end">{children}</span>
    </li>
  );
}

/**
 * Správa tajných odkazů na veřejný rozpis (Worker `rozpis`): tablet v prodejně a osobní odkaz každého aktivního člověka.
 * Zrušení i nový osobní odkaz se nejdřív potvrdí, starý odkaz totiž hned přestane platit.
 */
export function OdkazyRozpisu({ firmaId, dnes }: { firmaId: string; dnes: string }) {
  const dotaz = useOdkazyRozpisu(firmaId);
  // Všichni lidé firmy, ne jen ti z vybraného měsíce: odkaz má jít vytvořit i člověku, který v měsíci ještě nebo už není.
  const lideDotaz = useZamestnanci(firmaId);
  const vytvor = useVytvorOdkazRozpisu();
  const zrus = useZrusOdkazRozpisu();
  const [potvrzeni, nastavPotvrzeni] = useState<Potvrzeni | null>(null);
  const [hlaska, nastavHlasku] = useState<string | null>(null);

  useEffect(() => {
    if (!hlaska) return;
    const casovac = setTimeout(() => nastavHlasku(null), DOBA_HLASKY_MS);
    return () => clearTimeout(casovac);
  }, [hlaska]);

  const odkazy = dotaz.data ?? [];
  const tablety = odkazy.filter((o) => o.zamestnanecId === null);
  const odkazLidi = new Map(odkazy.flatMap((o) => (o.zamestnanecId ? [[o.zamestnanecId, o] as const] : [])));
  // Osobní odkaz neaktivního člověka nebo po ukončení Worker stejně nepustí, takže se nabízejí jen lidé, kterým by fungoval.
  const aktivni = (lideDotaz.data ?? [])
    .filter((z) => z.aktivni && (z.ukonceni === null || z.ukonceni >= dnes))
    .sort((a, b) => a.jmeno.localeCompare(b.jmeno, 'cs') || a.prijmeni.localeCompare(b.prijmeni, 'cs'));

  const kopiruj = async (odkaz: OdkazRozpisu) => {
    try {
      await navigator.clipboard.writeText(odkazRozpisu(odkaz.token));
      nastavHlasku('Zkopírováno');
    } catch {
      // Schránka bývá zakázaná (nezabezpečená stránka, odmítnuté oprávnění).
      nastavHlasku('Odkaz se nepodařilo zkopírovat.');
    }
  };

  const potvrd = () => {
    if (!potvrzeni) return;
    const hotovo = { onSuccess: () => nastavPotvrzeni(null) };
    if (potvrzeni.druh === 'zrusit') zrus.mutate({ id: potvrzeni.odkaz.id, firmaId }, hotovo);
    else vytvor.mutate({ firmaId, zamestnanecId: potvrzeni.odkaz.zamestnanecId }, hotovo);
  };
  const zavriPotvrzeni = () => {
    nastavPotvrzeni(null);
    zrus.reset();
    vytvor.reset();
  };

  const kopirovat = (odkaz: OdkazRozpisu, nazev: string) => (
    <Tlacitko varianta="tiche" ikona={Copy} onClick={() => void kopiruj(odkaz)} aria-label={`Kopírovat odkaz: ${nazev}`}>
      Kopírovat
    </Tlacitko>
  );
  const zrusit = (odkaz: OdkazRozpisu, clovek: Zamestnanec | null, nazev: string) => (
    <Tlacitko varianta="nebezpecneTiche" ikona={Trash2} onClick={() => nastavPotvrzeni({ druh: 'zrusit', odkaz, clovek })} aria-label={`Zrušit odkaz: ${nazev}`}>
      Zrušit
    </Tlacitko>
  );

  const nazevPotvrzeni = potvrzeni?.clovek ? `${potvrzeni.clovek.jmeno} ${potvrzeni.clovek.prijmeni}` : potvrzeni?.odkaz.nazev;
  const chybaPotvrzeni = zrus.error ?? vytvor.error;

  return (
    <Sekce nadpis="Rozpis pro zaměstnance" popis="Tajné odkazy na rozpis týdne. Kdo odkaz zná, vidí rozpis bez přihlášení, jen směny a zavřeno (bez nemoci a dovolené).">
      {dotaz.isPending && <Nacitani text="Načítám odkazy…" />}
      {dotaz.error && <ChybaHlaska chyba={dotaz.error} onZnovu={() => void dotaz.refetch()} />}

      {dotaz.data && (
        <>
          <div className="flex flex-col gap-3">
            <h3 className="text-15 font-semibold">Tablety</h3>
            {tablety.length > 0 ? (
              <ul className="divide-y divide-linka">
                {tablety.map((o) => (
                  <Radek key={o.id} nazev={o.nazev}>
                    {kopirovat(o, o.nazev)}
                    <a href={odkazRozpisu(o.token)} target="_blank" rel="noopener noreferrer" aria-label={`Otevřít: ${o.nazev}`} className={tridyTlacitka('tiche')}>
                      <ExternalLink aria-hidden className="size-[18px]" />
                      Otevřít
                    </a>
                    {zrusit(o, null, o.nazev)}
                  </Radek>
                ))}
              </ul>
            ) : (
              <p className="text-15 text-tlumeny">Zatím žádný odkaz. Tablet v prodejně ho otevře jednou a rozpis si sám obnovuje.</p>
            )}
            <div>
              <Tlacitko
                varianta="vedlejsi"
                ikona={Plus}
                nacita={vytvor.isPending && vytvor.variables?.zamestnanecId === null}
                onClick={() => vytvor.mutate({ firmaId, zamestnanecId: null })}
              >
                Přidat odkaz pro tablet
              </Tlacitko>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-15 font-semibold">Lidé</h3>
            {lideDotaz.isPending && <Nacitani text="Načítám lidi…" />}
            {lideDotaz.error && <ChybaHlaska chyba={lideDotaz.error} onZnovu={() => void lideDotaz.refetch()} />}
            {lideDotaz.data && (aktivni.length > 0 ? (
              <ul className="divide-y divide-linka">
                {aktivni.map((z) => {
                  const nazev = `${z.jmeno} ${z.prijmeni}`;
                  const o = odkazLidi.get(z.id);
                  return (
                    <Radek key={z.id} nazev={nazev}>
                      {o ? (
                        <>
                          {kopirovat(o, nazev)}
                          <a
                            href={adresaWhatsApp(z.jmeno, o.token)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Poslat do WhatsAppu: ${nazev}`}
                            className={tridyTlacitka('tiche')}
                          >
                            <MessageCircle aria-hidden className="size-[18px]" />
                            Poslat do WhatsAppu
                          </a>
                          <Tlacitko varianta="tiche" ikona={RefreshCw} onClick={() => nastavPotvrzeni({ druh: 'novy', odkaz: o, clovek: z })} aria-label={`Nový odkaz: ${nazev}`}>
                            Nový odkaz
                          </Tlacitko>
                          {zrusit(o, z, nazev)}
                        </>
                      ) : (
                        <Tlacitko
                          varianta="tiche"
                          ikona={Link2}
                          nacita={vytvor.isPending && vytvor.variables?.zamestnanecId === z.id}
                          onClick={() => vytvor.mutate({ firmaId, zamestnanecId: z.id })}
                          aria-label={`Vytvořit odkaz: ${nazev}`}
                        >
                          Vytvořit odkaz
                        </Tlacitko>
                      )}
                    </Radek>
                  );
                })}
              </ul>
            ) : (
              <p className="text-15 text-tlumeny">Zatím tu nikdo není. Přidej lidi v sekci Lidé.</p>
            ))}
          </div>
        </>
      )}

      <p role="status" className="min-h-5 text-15 font-medium text-tlumeny">
        {hlaska}
      </p>
      {(vytvor.error || zrus.error) && !potvrzeni && <ChybaHlaska chyba={vytvor.error ?? zrus.error} />}

      <SpodniPanel
        otevreno={!!potvrzeni}
        onZavrit={zavriPotvrzeni}
        nadpis={potvrzeni?.druh === 'novy' ? 'Vytvořit nový odkaz?' : 'Zrušit odkaz?'}
        paticka={
          <>
            <Tlacitko
              varianta={potvrzeni?.druh === 'novy' ? 'hlavni' : 'nebezpecne'}
              ikona={potvrzeni?.druh === 'novy' ? RefreshCw : Trash2}
              nacita={zrus.isPending || vytvor.isPending}
              onClick={potvrd}
            >
              {potvrzeni?.druh === 'novy' ? 'Vytvořit nový odkaz' : 'Zrušit odkaz'}
            </Tlacitko>
            <Tlacitko varianta="vedlejsi" onClick={zavriPotvrzeni}>
              Zpět
            </Tlacitko>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-15">
          {potvrzeni?.druh === 'novy' ? (
            <p>Starý odkaz, který {nazevPotvrzeni} má, hned přestane platit. Nový je potřeba poslat znovu.</p>
          ) : (
            <p>Odkaz {nazevPotvrzeni} hned přestane platit. Kdo ho má uložený, uvidí „Odkaz neplatí“.</p>
          )}
          {chybaPotvrzeni && <ChybaHlaska chyba={chybaPotvrzeni} />}
        </div>
      </SpodniPanel>
    </Sekce>
  );
}
