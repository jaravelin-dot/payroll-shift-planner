import { CircleCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

/** Stav navigace, kterým stránka po uložení předá krátkou hlášku další stránce (např. „Uloženo"). */
export type StavOznameni = { oznameni?: string };

const DOBA_MS = 4000;

/**
 * Krátká hláška po akci (uloženo, smazáno), kterou sem poslala předchozí stránka ve stavu navigace.
 * Oblast `status` je na stránce od začátku a text se do ní vloží až po vykreslení, aby ho čtečka ohlásila.
 * Po zobrazení se hláška ze stavu historie smaže (po obnovení stránky se neukáže znovu) a za 4 s zmizí.
 */
export function Oznameni() {
  const location = useLocation();
  const navigate = useNavigate();
  const prichozi = (location.state as StavOznameni | null)?.oznameni ?? null;
  const [text, nastavText] = useState<string | null>(null);

  useEffect(() => {
    if (!prichozi) return;
    nastavText(prichozi);
    void navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [prichozi, navigate, location.pathname, location.search]);

  useEffect(() => {
    if (!text) return;
    const casovac = setTimeout(() => nastavText(null), DOBA_MS);
    return () => clearTimeout(casovac);
  }, [text]);

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex justify-center lg:inset-x-auto lg:right-8 lg:bottom-8"
    >
      {text && (
        <p className="flex animate-pozadi items-center gap-2 rounded-lg bg-inkoust py-3 pr-5 pl-4 text-15 font-medium text-karta">
          <CircleCheck aria-hidden className="size-[18px] shrink-0" />
          {text}
        </p>
      )}
    </div>
  );
}
