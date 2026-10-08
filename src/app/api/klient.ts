import type { KodChyby } from '../../shared/api';

/** `SIT` = požadavek vůbec neodešel; `NEZNAMA` = server odpověděl chybou bez kódu (např. 500). */
export type KodChybyApi = KodChyby | 'SIT' | 'NEZNAMA';

const ZPRAVY: Record<KodChybyApi, string> = {
  PRISTUP_NENASTAVEN: 'Přihlašování do appky ještě není nastavené.',
  NEPRIHLASEN: 'Přihlášení vypršelo. Obnov stránku.',
  ZAKAZANO: 'Tenhle e-mail nemá do appky přístup. Přihlas se povolenou adresou.',
  NENALEZENO: 'Záznam se nenašel. Možná už je smazaný, obnov stránku.',
  NEPLATNY_VSTUP: 'Některý údaj nesedí. Zkontroluj formulář.',
  MESIC_UZAVREN: 'Měsíc je uzavřený. Nejdřív ho otevři.',
  // Offline ukládání appka nemá, proto hláška nic neslibuje.
  SIT: 'Bez připojení. Zkontroluj síť a zkus to znovu.',
  NEZNAMA: 'Server teď nefunguje, jak má. Zkus to za chvíli znovu.',
};

const KODY = new Set<string>(Object.keys(ZPRAVY));

export class ApiChyba extends Error {
  readonly status: number;
  readonly kod: KodChybyApi;
  readonly zprava: string;

  constructor(status: number, kod: KodChybyApi, zprava?: string) {
    const text = zprava ?? (kod === 'NEZNAMA' ? `${ZPRAVY.NEZNAMA} (chyba ${status})` : ZPRAVY[kod]);
    super(text);
    this.name = 'ApiChyba';
    this.status = status;
    this.kod = kod;
    this.zprava = text;
  }
}

async function chybaZOdpovedi(odpoved: Response): Promise<ApiChyba> {
  let telo: unknown = null;
  try {
    telo = await odpoved.json();
  } catch {
    // Tělo není JSON (např. 500 z běhového prostředí).
  }
  if (telo && typeof telo === 'object' && 'chyba' in telo && typeof telo.chyba === 'string' && KODY.has(telo.chyba)) {
    const kod = telo.chyba as KodChyby;
    // Server posílá vlastní text jen u NEPLATNY_VSTUP; ostatní kódy mají text appky.
    const zprava = kod === 'NEPLATNY_VSTUP' && 'zprava' in telo && typeof telo.zprava === 'string' ? telo.zprava : undefined;
    return new ApiChyba(odpoved.status, kod, zprava);
  }
  return new ApiChyba(odpoved.status, 'NEZNAMA');
}

/**
 * JSON požadavek na `/api` + `cesta`. Ne-2xx odpověď i výpadek sítě vyhodí `ApiChyba` s českou zprávou.
 * Přesměrování se nesleduje: Cloudflare Access po vypršení přihlášení přesměruje na svou přihlašovací
 * stránku a sledování by skončilo chybou CORS, která by vypadala jako výpadek sítě.
 */
export async function api<T>(cesta: string, init?: RequestInit): Promise<T> {
  let odpoved: Response;
  try {
    odpoved = await fetch('/api' + cesta, {
      ...init,
      credentials: 'same-origin',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) },
    });
  } catch {
    throw new ApiChyba(0, 'SIT');
  }
  if (odpoved.type === 'opaqueredirect') throw new ApiChyba(odpoved.status, 'NEPRIHLASEN');
  if (!odpoved.ok) throw await chybaZOdpovedi(odpoved);
  if (odpoved.status === 204) return undefined as T;
  return (await odpoved.json()) as T;
}
