import { Building2, ChevronLeft } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { Firma as FirmaTyp } from '../../shared/api';
import { useFirmy } from '../api/dotazy';
import { FormularFirmy } from '../components/FormularFirmy';
import type { StavOznameni } from '../components/Oznameni';
import { PrazdnyStav } from '../components/PrazdnyStav';
import { tridyTlacitka } from '../components/Tlacitko';
import { useVyber, zapamatujFirmu } from '../stav/vyber';

/** Úprava firmy a jejích pravidel výpočtu (`/nastaveni/firma/:id`) nebo založení nové (`/nastaveni/firma/nova`). */
export function Firma() {
  const { id } = useParams();
  const { data: firmy = [] } = useFirmy();
  const vyber = useVyber();
  const [parametry] = useSearchParams();
  const navigate = useNavigate();
  const firma = id ? firmy.find((f) => f.id === id) : undefined;

  /** Zpět na Nastavení s hláškou; `firmaId` přepíše vybranou firmu v adrese (`null` = vynechat). */
  const zpet = (oznameni: string, firmaId?: string | null) => {
    const kontext = new URLSearchParams(parametry);
    if (firmaId === null) kontext.delete('firma');
    else if (firmaId) kontext.set('firma', firmaId);
    const search = kontext.toString();
    void navigate({ pathname: '/nastaveni', search: search ? `?${search}` : '' }, { state: { oznameni } satisfies StavOznameni });
  };

  const ulozeno = (ulozena: FirmaTyp, nova: boolean) => {
    if (!nova) return zpet('Uloženo');
    // S novou firmou se nejspíš bude hned pracovat, proto se na ni appka přepne.
    zapamatujFirmu(ulozena.id);
    zpet('Firma založena', ulozena.id);
  };

  // Smazaná firma nesmí zůstat vybraná v adrese; výběr pak spadne na jinou firmu.
  const smazano = () => zpet('Firma smazána', vyber.firmaId === id ? null : undefined);

  const zpetOdkaz = (
    <Link
      to={vyber.odkaz('/nastaveni')}
      className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg pr-3 pl-1 text-15 font-medium text-tlumeny transition-colors hover:text-inkoust"
    >
      <ChevronLeft aria-hidden className="size-5" />
      Nastavení
    </Link>
  );

  if (id && !firma) {
    return (
      <>
        <title>Firma nenalezena – Mzdy</title>
        {zpetOdkaz}
        <h1 className="mt-2 mb-6 text-28 font-semibold">Firma nenalezena</h1>
        <PrazdnyStav
          ikona={Building2}
          nadpis="Tahle firma tu není"
          akce={
            <Link to={vyber.odkaz('/nastaveni')} className={tridyTlacitka('vedlejsi')}>
              Zpět do Nastavení
            </Link>
          }
        >
          Možná už je smazaná. Firmy najdeš v Nastavení.
        </PrazdnyStav>
      </>
    );
  }

  const nadpis = firma?.nazev ?? 'Nová firma';
  return (
    <>
      <title>{`${nadpis} – Mzdy`}</title>
      {zpetOdkaz}
      <header className="mt-2 mb-6 flex flex-col gap-1">
        <h1 className="text-28 font-semibold break-words">{nadpis}</h1>
        <p className="text-15 text-tlumeny">
          {firma ? 'Údaje firmy a pravidla, podle kterých appka počítá výplaty.' : 'Pravidla výpočtu jsou předvyplněná obvyklými hodnotami, uprav je podle firmy.'}
        </p>
      </header>
      <FormularFirmy key={firma?.id ?? 'nova'} firma={firma} onUlozeno={ulozeno} onSmazano={smazano} />
    </>
  );
}
