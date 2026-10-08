import { QueryClientProvider } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { useState } from 'react';
import { createBrowserRouter, Link, Outlet, RouterProvider, type RouteObject } from 'react-router';
import { useFirmy, useJa, vytvorKlientaDotazu } from './api/dotazy';
import { ApiChyba } from './api/klient';
import { ChybaHlaska } from './components/ChybaHlaska';
import { Nacitani } from './components/Nacitani';
import { PrazdnyStav } from './components/PrazdnyStav';
import { Rozvrzeni } from './components/Rozvrzeni';
import { tridyTlacitka } from './components/Tlacitko';
import { Znak } from './components/Znak';
import { ClovekMesic } from './pages/ClovekMesic';
import { Firma } from './pages/Firma';
import { Lide } from './pages/Lide';
import { Nastaveni } from './pages/Nastaveni';
import { PristupNenastaven } from './pages/PristupNenastaven';
import { PrvniSpusteni } from './pages/PrvniSpusteni';
import { Smeny } from './pages/Smeny';
import { Vice } from './pages/Vice';
import { Vystupy } from './pages/Vystupy';
import { Vyplaty } from './pages/Vyplaty';
import { Zamestnanec } from './pages/Zamestnanec';

function ChybaNaCelouObrazovku({ chyba, onZnovu }: { chyba: unknown; onZnovu: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[36rem] flex-col justify-center gap-6 px-4 py-12">
      <Znak className="size-9" />
      <ChybaHlaska chyba={chyba} onZnovu={onZnovu} />
    </main>
  );
}

const maKod = (dotaz: { error: unknown }, kod: ApiChyba['kod']) => dotaz.error instanceof ApiChyba && dotaz.error.kod === kod;

/**
 * Než se ukáže appka: je nastavený přístup, je uživatel přihlášený a existuje aspoň jedna firma?
 * Přes celou obrazovku jde chyba jen tehdy, když nemáme co ukázat (dotaz nikdy nedoběhl) nebo když se ztratil
 * přístup. Selhání obnovy dat na pozadí (výpadek sítě, 500) appku nepřekryje, zůstanou stará data.
 */
function Brana() {
  const ja = useJa();
  const firmy = useFirmy();
  const znovu = () => {
    // Přihlášení obnoví jen nové načtení stránky (projde znovu přes Cloudflare Access).
    if (maKod(ja, 'NEPRIHLASEN') || maKod(firmy, 'NEPRIHLASEN')) window.location.reload();
    void ja.refetch();
    void firmy.refetch();
  };

  if (maKod(ja, 'PRISTUP_NENASTAVEN') || maKod(firmy, 'PRISTUP_NENASTAVEN')) return <PristupNenastaven onZnovu={znovu} />;
  if (ja.isPending) return <Nacitani celaObrazovka />;
  if (!ja.data || maKod(ja, 'NEPRIHLASEN')) return <ChybaNaCelouObrazovku chyba={ja.error} onZnovu={znovu} />;
  if (firmy.isPending) return <Nacitani celaObrazovka />;
  if (!firmy.data || maKod(firmy, 'NEPRIHLASEN')) return <ChybaNaCelouObrazovku chyba={firmy.error} onZnovu={znovu} />;
  if (firmy.data.length === 0) return <PrvniSpusteni />;
  return <Outlet />;
}

function NenalezenaStranka() {
  return (
    <>
      <title>Stránka neexistuje – Mzdy</title>
      <h1 className="mb-6 text-28 font-semibold">Stránka neexistuje</h1>
      <PrazdnyStav
        ikona={SearchX}
        nadpis="Tahle adresa nikam nevede"
        akce={
          <Link to="/" className={tridyTlacitka('vedlejsi')}>
            Otevřít výplaty
          </Link>
        }
      >
        Možná je v odkazu překlep. Pokračuj přes navigaci.
      </PrazdnyStav>
    </>
  );
}

function ChybaVykresleni() {
  return <ChybaNaCelouObrazovku chyba={null} onZnovu={() => window.location.reload()} />;
}

const trasy: RouteObject[] = [
  {
    element: <Brana />,
    errorElement: <ChybaVykresleni />,
    children: [
      {
        element: <Rozvrzeni />,
        children: [
          { index: true, element: <Vyplaty /> },
          { path: 'clovek/:zamestnanecId', element: <ClovekMesic /> },
          { path: 'lide', element: <Lide /> },
          { path: 'lide/novy', element: <Zamestnanec /> },
          { path: 'lide/:id', element: <Zamestnanec /> },
          { path: 'smeny', element: <Smeny /> },
          { path: 'vystupy', element: <Vystupy /> },
          { path: 'nastaveni', element: <Nastaveni /> },
          { path: 'nastaveni/firma/nova', element: <Firma /> },
          { path: 'nastaveni/firma/:id', element: <Firma /> },
          { path: 'vice', element: <Vice /> },
          { path: '*', element: <NenalezenaStranka /> },
        ],
      },
    ],
  },
];

export function App() {
  const [klient] = useState(vytvorKlientaDotazu);
  const [router] = useState(() => createBrowserRouter(trasy));
  return (
    <QueryClientProvider client={klient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
