// Průchod appkou proti postavené verzi (vite preview, CSP z public/_headers): firma → člověk → docházka → účtenka →
// výstupy (PDF pásky a Excel bez chyb CSP) → uzávěrka → karta jen ke čtení. Snímky hlavních obrazovek jdou do
// docs/snimky/final-*-1280.png (PC) a final-*-390.png (iPhone 14). Firma testu se na konci smaže.
import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { denVTydnu, dnyMesice, jeSvatek } from '../src/core/kalendar';

const ted = new Date();
const ROK = ted.getFullYear();
const MESIC = ted.getMonth() + 1;
const PRVNI_DEN = dnyMesice(ROK, MESIC)[0]!;
/** První čtyři pracovní dny aktuálního měsíce (bez víkendů a svátků): 3× Práce, 1× Dovolená. */
const PRACOVNI = dnyMesice(ROK, MESIC).filter((d) => denVTydnu(d) <= 5 && !jeSvatek(d)).slice(0, 4);

let firmaId: string | null = null;

test.afterEach(async ({ request }) => {
  if (firmaId) await request.delete(`/api/firmy/${firmaId}`, { headers: { 'Content-Type': 'application/json' } });
  firmaId = null;
});

/** Políčko dne v docházkové kartě („Čtvrtek 1. října: …"). */
const policko = (page: Page, datum: string) =>
  page.getByRole('group', { name: /^Docházka, / }).getByRole('button', { name: new RegExp(`^\\S+ ${Number(datum.slice(8))}\\. `) });

/** Uložení v panelu dne a počkat na odpověď serveru (ať další krok nepřeruší rozdělané uložení). */
async function ulozDen(page: Page) {
  const panel = page.getByRole('dialog');
  const [odpoved] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/dny') && r.request().method() === 'PUT'),
    panel.getByRole('button', { name: 'Uložit', exact: true }).click(),
  ]);
  expect(odpoved.status()).toBe(200);
  await expect(panel).toBeHidden();
}

async function stazeno(stahovani: Promise<Download>, klik: Promise<void>): Promise<{ data: Buffer; nazev: string }> {
  const [soubor] = await Promise.all([stahovani, klik]);
  const cesta = await soubor.path();
  return { data: await readFile(cesta), nazev: soubor.suggestedFilename() };
}

test('firma → člověk → docházka → výstupy → uzávěrka', async ({ page }, info) => {
  const sirka = info.project.name === 'desktop' ? 1280 : 390;
  const snimek = (nazev: string) => page.screenshot({ path: `docs/snimky/final-${nazev}-${sirka}.png`, fullPage: true });
  // Porušení CSP (např. eval v knihovně PDF nebo Excelu) prohlížeč hlásí do konzole; test na něm musí spadnout.
  const chybyCsp: string[] = [];
  page.on('console', (zprava) => {
    if (zprava.type() === 'error' && /Content[ -]Security[ -]Policy/i.test(zprava.text())) chybyCsp.push(zprava.text());
  });
  page.on('pageerror', (chyba) => {
    if (/Content[ -]Security[ -]Policy|unsafe-eval|EvalError/i.test(String(chyba))) chybyCsp.push(String(chyba));
  });

  // --- Firma ---
  const nazevFirmy = `E2E ${Date.now()} ${info.project.name}`;
  const odpovedStranky = await page.goto('/');
  // Stránky musí nést CSP z public/_headers, jinak by kontrola chyb CSP nic neověřovala.
  expect(odpovedStranky?.headers()['content-security-policy']).toContain("default-src 'self'");
  const prvniSpusteni = page.getByRole('heading', { name: 'Začneme firmou' });
  await expect(prvniSpusteni.or(page.getByRole('heading', { name: 'Výplaty', level: 1 }))).toBeVisible();
  if (await prvniSpusteni.isVisible()) {
    // Lokální databáze bez firem: první spuštění.
    await page.getByRole('button', { name: 'Založit firmu' }).click();
    await page.getByLabel('Název firmy').fill(nazevFirmy);
    await page.getByRole('button', { name: 'Založit firmu' }).click();
    await expect(page.getByRole('heading', { name: 'Výplaty', level: 1 })).toBeVisible();
  } else {
    await page.goto('/nastaveni/firma/nova');
    await page.getByLabel('Název firmy').fill(nazevFirmy);
    await page.getByRole('button', { name: 'Uložit', exact: true }).click();
    await expect(page.getByText('Firma založena')).toBeVisible();
  }
  const firmy = (await (await page.request.get('/api/firmy')).json()) as { id: string; nazev: string }[];
  firmaId = firmy.find((f) => f.nazev === nazevFirmy)!.id;
  const kontext = `?firma=${firmaId}&rok=${ROK}&mesic=${MESIC}`;
  await page.goto(`/nastaveni${kontext}`);
  await expect(page.getByRole('heading', { name: 'Nastavení', level: 1 })).toBeVisible();
  await snimek('nastaveni');

  // --- Člověk: HPP, 160 Kč/h, 40 h týdně, s prohlášením, od 1. dne měsíce ---
  await page.goto(`/lide/novy${kontext}`);
  await page.getByLabel('Jméno', { exact: true }).fill('Eva');
  await page.getByLabel('Příjmení', { exact: true }).fill('Testová');
  await expect(page.getByRole('radio', { name: 'HPP' })).toBeChecked(); // výchozí smlouva
  await page.getByLabel('Úvazek').fill('40');
  await page.getByLabel('Nástup').fill(PRVNI_DEN);
  await expect(page.getByLabel('Platí od')).toHaveValue(PRVNI_DEN);
  await page.getByLabel('Hodinová sazba').fill('160');
  const prohlaseni = page.getByRole('switch', { name: /Podepsané prohlášení poplatníka/ });
  await prohlaseni.click();
  await expect(prohlaseni).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lidé', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Eva Testová/ })).toBeVisible();
  await snimek('lide');

  // --- Aktuální měsíc: 3 dny Práce 8 h, 1 den Dovolená 8 h ---
  await page.goto(`/${kontext}`);
  await page.getByRole('link', { name: /^Eva Testová/ }).click();
  await expect(page.getByRole('heading', { name: 'Eva Testová', level: 1 })).toBeVisible();
  const kVyplate = page.getByTestId('k-vyplate').locator('data');
  const castka = async () => Number(await kVyplate.getAttribute('value'));

  for (const [i, datum] of PRACOVNI.slice(0, 3).entries()) {
    await policko(page, datum).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('radio', { name: /Práce/ })).toBeChecked();
    await expect(panel.getByLabel('Hodiny', { exact: true })).toHaveValue('8');
    if (i === 0) await snimek('panel-dne');
    await ulozDen(page);
    await expect(policko(page, datum)).toHaveAccessibleName(/: práce 8 h$/);
  }
  await expect.poll(castka).toBeGreaterThan(0);
  const poTrechDnech = await castka();

  await policko(page, PRACOVNI[3]!).click();
  const panel = page.getByRole('dialog');
  // Přepínač typu je skrytý radio uvnitř štítku; klepne se na štítek jako prstem.
  await panel.locator('label').filter({ hasText: 'Dovolená' }).click();
  await expect(panel.getByRole('radio', { name: /Dovolená/ })).toBeChecked();
  await panel.getByRole('button', { name: '8 h', exact: true }).click();
  await ulozDen(page);
  await expect(policko(page, PRACOVNI[3]!)).toHaveAccessibleName(/: dovolená 8 h$/);
  await expect.poll(castka).not.toBe(poTrechDnech);
  expect(await castka()).toBeGreaterThan(poTrechDnech);
  await snimek('clovek');

  // --- Výplaty a Výstupy: páska PDF a Excel ---
  await page.getByRole('link', { name: 'Zpět na výplaty' }).click();
  await expect(page.getByRole('region', { name: 'Součty za firmu' })).toBeVisible();
  await snimek('vyplaty');
  await page.getByRole('main').getByRole('link', { name: 'Výstupy' }).click();
  await expect(page.getByRole('heading', { name: 'Výstupy', level: 1 })).toBeVisible();

  const pdf = await stazeno(page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('button', { name: 'Páska PDF: Eva Testová' }).click());
  expect(pdf.nazev).toMatch(/\.pdf$/);
  expect(pdf.data.length).toBeGreaterThan(5 * 1024);
  expect(pdf.data.subarray(0, 5).toString('latin1')).toBe('%PDF-');

  const excel = await stazeno(page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('button', { name: 'Stáhnout Excel' }).click());
  expect(excel.nazev).toMatch(/\.xlsx$/);
  expect(excel.data.length).toBeGreaterThan(5 * 1024);
  expect(excel.data.subarray(0, 2).toString('latin1')).toBe('PK'); // xlsx je ZIP
  await snimek('vystupy');
  expect(chybyCsp, 'chyby CSP při tvorbě PDF a Excelu').toEqual([]);

  // --- Uzávěrka: pak je karta jen ke čtení ---
  await page.goto(`/${kontext}`);
  await page.getByRole('button', { name: 'Uzavřít měsíc' }).click();
  const potvrzeni = page.getByRole('dialog', { name: /^Uzavřít / });
  await expect(potvrzeni).toBeVisible();
  await snimek('uzavrit');
  await potvrzeni.getByRole('button', { name: 'Uzavřít měsíc' }).click();
  await expect(page.getByText(/^Uzavřeno \d/)).toBeVisible();
  // Součet ze snímku serveru sedí s appkou: žádné upozornění na rozdíl.
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('link', { name: /^Eva Testová/ }).click();
  await expect(page.getByText('Měsíc je uzavřený, docházka jde jen prohlížet.')).toBeVisible();
  await expect(policko(page, PRACOVNI[0]!)).toHaveAttribute('aria-disabled', 'true');
  // aria-disabled Playwright sám neklikne; uživatel na den klepnout může, panel se ale nesmí otevřít.
  await policko(page, PRACOVNI[0]!).click({ force: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Zadat nemoc' })).toHaveCount(0);
  await snimek('uzavreno');

  await page.goto(`/smeny${kontext}`);
  await expect(page.getByRole('heading', { name: 'Směny', level: 1 })).toBeVisible();
  await snimek('smeny');

  expect(chybyCsp, 'chyby CSP během celého průchodu').toEqual([]);
});
