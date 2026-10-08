import { ChevronLeft, UserX } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { useZamestnanci } from '../api/dotazy';
import { ChybaHlaska } from '../components/ChybaHlaska';
import { FormularZamestnance } from '../components/FormularZamestnance';
import { Nacitani } from '../components/Nacitani';
import type { StavOznameni } from '../components/Oznameni';
import { PrazdnyStav } from '../components/PrazdnyStav';
import { Stitek } from '../components/Stitek';
import { tridyTlacitka } from '../components/Tlacitko';
import { useVyber } from '../stav/vyber';

/** Formulář člověka: `/lide/novy` zakládá, `/lide/:id` upravuje. */
export function Zamestnanec() {
  const { id } = useParams();
  const vyber = useVyber();
  const navigate = useNavigate();
  const lide = useZamestnanci(id ? vyber.firmaId : undefined);
  const zpet = vyber.odkaz('/lide');
  const hotovo = (oznameni: string) => void navigate(zpet, { state: { oznameni } satisfies StavOznameni });

  const zpetOdkaz = (
    <Link to={zpet} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg pr-3 pl-1 text-15 font-medium text-tlumeny transition-colors hover:text-inkoust">
      <ChevronLeft aria-hidden className="size-5" />
      Lidé
    </Link>
  );

  if (!vyber.firma) return <Nacitani />;

  if (id) {
    if (lide.isPending) return <Nacitani />;
    if (!lide.data) return <ChybaHlaska chyba={lide.error} onZnovu={() => void lide.refetch()} />;
  }
  const zamestnanec = id ? lide.data?.find((z) => z.id === id) : undefined;

  if (id && !zamestnanec) {
    return (
      <>
        <title>Člověk nenalezen – Mzdy</title>
        {zpetOdkaz}
        <h1 className="mt-2 mb-6 text-28 font-semibold">Člověk nenalezen</h1>
        <PrazdnyStav
          ikona={UserX}
          nadpis="Tenhle člověk tu není"
          akce={
            <Link to={zpet} className={tridyTlacitka('vedlejsi')}>
              Zpět na lidi
            </Link>
          }
        >
          Ve firmě {vyber.firma.nazev} takový člověk není. Možná je smazaný, nebo patří k jiné firmě.
        </PrazdnyStav>
      </>
    );
  }

  const nadpis = zamestnanec ? `${zamestnanec.jmeno} ${zamestnanec.prijmeni}` : 'Nový člověk';
  return (
    <>
      <title>{`${nadpis} – Mzdy`}</title>
      {zpetOdkaz}
      <header className="mt-2 mb-6 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-28 font-semibold">{nadpis}</h1>
          {zamestnanec && !zamestnanec.aktivni && <Stitek ton="neutralni">Bývalý</Stitek>}
        </div>
        <p className="text-15 text-tlumeny">{vyber.firma.nazev}</p>
      </header>
      {/* Klíč: po přepnutí na jiného člověka nebo firmu začne formulář znovu z jeho údajů. */}
      <FormularZamestnance key={`${vyber.firma.id}-${zamestnanec?.id ?? 'novy'}`} firma={vyber.firma} zamestnanec={zamestnanec} onHotovo={hotovo} />
    </>
  );
}
