import { RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tlacitko } from '../components/Tlacitko';
import { Znak } from '../components/Znak';

const Kod = ({ children }: { children: ReactNode }) => <code className="rounded bg-papir px-1 py-0.5 font-sans text-15 font-medium box-decoration-clone">{children}</code>;
const Volba = ({ children }: { children: ReactNode }) => <strong className="font-semibold">{children}</strong>;

const KROKY: ReactNode[] = [
  <>V Cloudflare dashboardu otevři <Volba>Workers & Pages › mzdy › Settings › Domains & Routes</Volba>.</>,
  <>U řádku <Volba>workers.dev</Volba> klikni na <Volba>Enable Cloudflare Access</Volba>.</>,
  <>V pravidlech přístupu přidej e-maily, které mají mít do appky přístup.</>,
  <>V Zero Trust › Access › Applications › mzdy zkopíruj <Volba>Application Audience (AUD) Tag</Volba> a team domain (tvar <Kod>tvuj-tym.cloudflareaccess.com</Kod>).</>,
  <>Ulož je jako secrets Workeru: <Kod>npx wrangler secret put ACCESS_AUD</Kod> (hodnota je AUD Tag) a <Kod>npx wrangler secret put ACCESS_TEAM_DOMAIN</Kod> (hodnota je team domain).</>,
  <>Obnov tuhle stránku a přihlas se kódem z e-mailu.</>,
];

/** API vrací 503 PRISTUP_NENASTAVEN: Worker bez nastaveného Cloudflare Access nepustí nikoho (fail-closed). */
export function PristupNenastaven({ onZnovu }: { onZnovu: () => void }) {
  return (
    <div className="min-h-dvh px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-12 sm:px-8 lg:pt-16">
      <title>Přihlašování není nastavené – Mzdy</title>
      <div className="mx-auto max-w-[44rem]">
        <header className="flex items-center gap-2.5">
          <Znak />
          <span className="text-17 font-semibold">Mzdy</span>
        </header>

        <main className="mt-10 lg:mt-16">
          <h1 className="text-28 font-semibold sm:text-40">Přihlašování ještě není nastavené</h1>
          <p className="mt-4 text-17 text-tlumeny">
            Appka pouští dovnitř jen povolené e-maily přes Cloudflare Access. Dokud ho nezapneš, data zůstanou zamčená pro všechny, i pro tebe.
          </p>

          <ol className="mt-8 divide-y divide-linka rounded-xl border border-linka bg-karta">
            {KROKY.map((krok, i) => (
              <li key={i} className="flex gap-4 px-4 py-4 sm:px-5">
                <span aria-hidden className="w-5 shrink-0 text-15 font-semibold text-tlumeny tabular-nums">
                  {i + 1}.
                </span>
                <p className="min-w-0 text-15">{krok}</p>
              </li>
            ))}
          </ol>

          <div className="mt-8">
            <Tlacitko ikona={RotateCw} onClick={onZnovu}>
              Zkusit znovu
            </Tlacitko>
          </div>
        </main>
      </div>
    </div>
  );
}
