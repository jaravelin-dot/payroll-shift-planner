// Vykreslí PNG ikony z public/ikona.svg do public/icons/ (spuštění: npm run ikony).
// Výsledné PNG jsou v gitu, skript je potřeba jen při změně motivu.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const INKOUST = '#16202B';
const koren = (cesta) => fileURLToPath(new URL(`../${cesta}`, import.meta.url));
const svg = await readFile(koren('public/ikona.svg'));

/** Čtvercový PNG z SVG v dané velikosti (pozadí průhledné v rozích zaoblení). */
const vykresli = (velikost) =>
  sharp(svg, { density: 384 }).resize(velikost, velikost).png().toBuffer();

/**
 * PNG na plném inkoustovém pozadí: motiv zabere `podil` šířky, zbytek je inkoust.
 * Maskovatelná ikona: podíl 0,8 = bezpečná zóna 80 %. apple-touch-icon: 1 (iOS si rohy zaoblí
 * sám a průhlednost vyplní černou, proto plné pozadí bez průhledných rohů).
 */
async function naInkoustu(velikost, podil) {
  const motiv = Math.round(velikost * podil);
  const okraj = Math.floor((velikost - motiv) / 2);
  return sharp({ create: { width: velikost, height: velikost, channels: 4, background: INKOUST } })
    .composite([{ input: await vykresli(motiv), left: okraj, top: okraj }])
    .png()
    .toBuffer();
}

await mkdir(koren('public/icons'), { recursive: true });

const soubory = {
  'icon-192.png': await vykresli(192),
  'icon-512.png': await vykresli(512),
  'maskable-512.png': await naInkoustu(512, 0.8),
  'apple-touch-icon.png': await naInkoustu(180, 1),
};

for (const [nazev, data] of Object.entries(soubory)) {
  await writeFile(koren(`public/icons/${nazev}`), data);
  console.log(`public/icons/${nazev}`);
}
