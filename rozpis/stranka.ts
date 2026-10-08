// HTML stránky rozpisu (Worker `rozpis`), skládané na serveru přes `html` z hono/html: každá vložená hodnota se escapuje.
// `raw` jen pro konstanty CSS a skriptů v tomto souboru (escapování by rozbilo uvozovky), nikdy pro data.
// Vstupem je jen hotový model `Rozpis` (už bez nepřítomností) a pár textů.
import { html, raw } from 'hono/html';
import { posunDatum } from '../src/core/kalendar';
import type { Rozpis } from '../src/core/rozpis';

export interface VolbyStranky {
  /** Osobní odkaz (karta „Moje směny", zvýrazněný řádek, manifest); null = tablet v prodejně. */
  osobni: { zamestnanecId: string; jmeno: string } | null;
  firma: string;
  /** Čas načtení v Praze, „10:42". */
  aktualizovano: string;
  /** Cesta odkazu bez dotazu, „/r/{token}". */
  odkaz: string;
}

const ZAVRENO = 'zavřeno';

// Na šířku (tablet v prodejně) se tabulka vejde na výšku obrazovky: písmo a výška řádků se řídí počtem lidí (--radku).
// Na mobilu je tabulka posuvná do strany a sloupec jmen zůstává ukotvený vlevo.
const CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111;background:#fff;font-size:17px;line-height:1.25}
/* Záhlaví: firma a nadpis vlevo, šipky vpravo; na úzkém displeji jde nadpis pod šipky přes celou šířku (nezalomí se uvnitř data). */
.hlava{display:grid;grid-template-columns:1fr auto;grid-template-areas:"firma nav" "nadpis nav";align-items:center;column-gap:12px;padding:10px 16px;background:#111;color:#fff}
.firma{grid-area:firma;align-self:end;margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#bbb}
h1{grid-area:nadpis;align-self:start;margin:0;font-size:22px;font-weight:800;letter-spacing:-.01em}
nav{grid-area:nav;display:flex;gap:8px}
nav a{display:inline-flex;align-items:center;justify-content:center;min-width:48px;height:48px;padding:0 12px;border-radius:10px;background:#2a2a2a;color:#fff;text-decoration:none;font-size:28px;font-weight:700}
nav a.dnes-odkaz{font-size:17px;background:#d32f2f}
.moje{margin:12px 12px 4px;padding:12px 14px;border:2px solid #111;border-radius:12px;background:#fff8d6}
.moje h2{margin:0 0 8px;font-size:18px}
.moje ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin:0;padding:0;list-style:none}
.moje li{padding:6px 10px;border-radius:8px;background:#fff;border:1px solid #d6cfa8}
.moje li.dnes{background:#d32f2f;border-color:#d32f2f;color:#fff}
.moje .den{display:block;font-size:14px;font-weight:600}
.moje .cas{display:block;font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
.moje p{margin:0}
.obal{overflow-x:auto;-webkit-overflow-scrolling:touch}
/* Na mobilu sloupec dne pobere nejdelší čas („8:30–12:30") na jeden řádek; delší text („směna 4,5 h") se zalomí, neusekne. */
table{border-collapse:separate;border-spacing:0;width:100%;min-width:780px;table-layout:fixed}
col.c-jmeno{width:102px}
th,td{padding:8px 6px;border-bottom:1px solid #ddd;text-align:center;vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
thead th{padding:6px 4px;border-bottom:2px solid #111;font-weight:700;background:#fff;vertical-align:top}
thead .zkratka{display:block;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#555}
thead .datum{display:block;font-size:18px}
thead .svatek{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;font-size:11px;font-weight:600;line-height:1.2;color:#b71c1c;margin-top:2px}
thead th.dnes{background:#d32f2f;color:#fff}
thead th.dnes .zkratka,thead th.dnes .svatek{color:#fff}
th.jmeno,tbody th{position:sticky;left:0;z-index:1;text-align:left;padding-left:12px;background:#fff;border-right:1px solid #ddd}
tbody th{font-weight:700}
td{padding:8px 4px;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;white-space:normal}
.vikend{background:#f3f3f1}
td.dnes{background:#fdeaea;box-shadow:inset 2px 0 #d32f2f,inset -2px 0 #d32f2f}
td.zavreno{font-weight:500;font-style:italic;color:#777;font-size:15px}
tr.ja th,tr.ja td{background:#fff3b0}
tr.ja td.dnes{background:#ffd98a}
tr.ja th{box-shadow:inset 6px 0 #111}
.nikdo{padding:24px;text-align:center;font-weight:500;color:#555;white-space:normal}
footer{padding:6px 16px;font-size:13px;color:#666}
@media (max-width:600px){
  .hlava{grid-template-areas:"firma nav" "nadpis nadpis";row-gap:6px;padding:8px 12px}
  .firma{align-self:center}
  h1{font-size:20px}
}
@media (min-width:900px) and (orientation:landscape){
  html,body{height:100%}
  body{display:flex;flex-direction:column}
  .hlava{padding:8px 20px}
  h1{font-size:26px}
  .obal{flex:1;min-height:0;overflow:auto}
  table{height:100%;min-width:0}
  col.c-jmeno{width:15%}
  td{white-space:nowrap}
  tbody th,tbody td{padding:0 8px;font-size:clamp(15px,calc((100vh - var(--rezerva)) / var(--radku) * .52),30px)}
  td.zavreno{font-size:clamp(13px,calc((100vh - var(--rezerva)) / var(--radku) * .4),22px)}
  thead .datum{font-size:20px}
  thead .svatek{font-size:12px}
  footer{padding:4px 20px}
}
`;

// Obnovení po 5 minutách a hned po půlnoci (nový den = jiný zvýrazněný sloupec, v pondělí nový týden). Bez sítě se stránka
// nenačítá znovu (zůstala by chybová stránka prohlížeče), zkusí to za minutu.
// Tablet při obnovení přejde na `cil` (adresa bez ?tyden=), aby po prolistování nezůstal viset na jiném týdnu; osobní stránka
// se jen znovu načte.
const obnoveni = (cil: string | null) => `
(function(){
  function obnov(){ if (navigator.onLine === false) { setTimeout(obnov, 60000); return; } ${cil === null ? 'location.reload()' : `location.replace(${jsRetezec(cil)})`}; }
  setTimeout(obnov, 5 * 60 * 1000);
  var ted = new Date();
  var poPulnoci = new Date(ted.getFullYear(), ted.getMonth(), ted.getDate() + 1, 0, 0, 30);
  setTimeout(obnov, poPulnoci.getTime() - ted.getTime());
})();
`;

/** Řetězcový literál do inline skriptu; `<` se escapuje, aby se v `<script>` nedalo ukončit značkou. */
const jsRetezec = (text: string) => JSON.stringify(text).replace(/</g, '\\u003c');

// Chybová stránka: bez sítě i při výpadku zkouší načíst znovu za minutu.
const OBNOVENI_CHYBY = `setTimeout(function(){ location.reload(); }, 60000);`;

// Tablet: obrazovka nemá zhasínat. Zámek prohlížeč pustí, když se stránka skryje, proto se po návratu žádá znovu.
const ZAMEK_OBRAZOVKY = `
(function(){
  function drz(){ if (document.visibilityState !== 'visible' || !navigator.wakeLock) return; navigator.wakeLock.request('screen').catch(function(){}); }
  document.addEventListener('visibilitychange', drz);
  drz();
})();
`;

const NBSP = String.fromCharCode(0xa0);
/** „směna 4,5 h" se v úzkém sloupci zalomí za „směna", ne před „h". */
const bezZlomu = (text: string) => text.replace(/ h$/, NBSP + 'h');

/** Celá stránka rozpisu týdne. */
export function strankaRozpisu(r: Rozpis, v: VolbyStranky) {
  const aktualniTyden = r.dny.some((d) => d.dnes);
  const moje = v.osobni ? r.radky.find((radek) => radek.zamestnanecId === v.osobni!.zamestnanecId) : undefined;
  const mojeSmeny = moje ? r.dny.map((den, i) => ({ den, text: moje.bunky[i]! })).filter((s) => s.text !== '' && s.text !== ZAVRENO) : [];
  const tridaDne = (i: number) => [r.dny[i]!.dnes ? 'dnes' : '', i >= 5 ? 'vikend' : ''].filter(Boolean).join(' ');
  const tridaBunky = (i: number, text: string) => [tridaDne(i), text === ZAVRENO ? 'zavreno' : ''].filter(Boolean).join(' ');

  return html`<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#111111">
<title>${v.osobni ? `Rozpis – ${v.osobni.jmeno}` : `Rozpis směn – ${v.firma}`}</title>
<link rel="icon" href="/icon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${v.osobni ? html`<link rel="manifest" href="${v.odkaz}/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Rozpis">
` : ''}<style>${raw(CSS)}</style>
</head>
<body style="--radku:${Math.max(r.radky.length, 1)};--rezerva:${v.osobni ? 300 : 190}px">
<header class="hlava">
  <p class="firma">${v.firma}</p>
  <h1>${r.nadpis}</h1>
  <nav>
    <a href="${v.odkaz}?tyden=${posunDatum(r.pondeli, -7)}" aria-label="Předchozí týden">‹</a>
    ${aktualniTyden ? '' : html`<a class="dnes-odkaz" href="${v.odkaz}">Dnes</a>`}
    <a href="${v.odkaz}?tyden=${posunDatum(r.pondeli, 7)}" aria-label="Další týden">›</a>
  </nav>
</header>
${v.osobni ? html`<section class="moje">
  <h2>Moje směny</h2>
  ${mojeSmeny.length > 0
    ? html`<ul>${mojeSmeny.map((s) => html`<li${s.den.dnes ? html` class="dnes"` : ''}><span class="den">${s.den.zkratka} ${s.den.datumText}</span><span class="cas">${s.text}</span></li>`)}</ul>`
    : html`<p>Tento týden nemáš žádnou směnu.</p>`}
</section>
` : ''}<main class="obal">
<table>
<colgroup><col class="c-jmeno"><col span="7"></colgroup>
<thead><tr>
  <th class="jmeno" scope="col"></th>
  ${r.dny.map((den, i) => html`<th scope="col"${tridaDne(i) ? html` class="${tridaDne(i)}"` : ''}><span class="zkratka">${den.dnes ? `${den.zkratka} · dnes` : den.zkratka}</span><span class="datum">${den.datumText}</span>${den.svatek ? html`<span class="svatek" title="${den.svatek}">${den.svatek}</span>` : ''}</th>`)}
</tr></thead>
<tbody>
${r.radky.length === 0
  ? html`<tr><td class="nikdo" colspan="8">Na tento týden zatím nikdo nemá směnu.</td></tr>`
  : r.radky.map((radek) => html`<tr${radek.zamestnanecId === v.osobni?.zamestnanecId ? html` class="ja"` : ''}><th scope="row">${radek.jmeno}</th>${radek.bunky.map((text, i) => html`<td${tridaBunky(i, text) ? html` class="${tridaBunky(i, text)}"` : ''}>${bezZlomu(text)}</td>`)}</tr>
`)}
</tbody>
</table>
</main>
<footer>Aktualizováno ${v.aktualizovano}</footer>
<script>${raw(obnoveni(v.osobni ? null : v.odkaz))}${v.osobni ? '' : raw(ZAMEK_OBRAZOVKY)}</script>
</body>
</html>`;
}

/** Stránka pro neplatný, zrušený nebo neznámý odkaz (a cokoli jiného mimo rozpis). */
export function strankaNeplati() {
  return html`<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Odkaz neplatí</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111;background:#fff;padding:24px}p{font-size:22px;font-weight:700;text-align:center;max-width:22em}</style>
</head>
<body><p>Odkaz neplatí. Požádej vedoucího o nový.</p></body>
</html>`;
}

/** Chybová stránka (500): žádné podrobnosti, po minutě se sama načte znovu. */
export function strankaChyby() {
  return html`<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Rozpis se nepodařilo načíst</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111;background:#fff;padding:24px}p{font-size:22px;font-weight:700;text-align:center;max-width:22em}</style>
</head>
<body><p>Rozpis se teď nepodařilo načíst. Zkusím to znovu za chvíli.</p>
<script>${raw(OBNOVENI_CHYBY)}</script>
</body>
</html>`;
}
