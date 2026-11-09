#!/usr/bin/env node
// Actualiza public/data.json con datos oficiales:
//  - Parlamento Vasco (legebiltzarra.eus)
//  - Gobierno Vasco: Lehendakari, consejeros, viceconsejeros, directores (irekia.euskadi.eus)
//  - Agentes del ecosistema (data/ecosistema.json + metadatos de sus webs)
// Registra en public/cambios.json las altas, bajas y cambios de cargo detectados.
// Uso: node scripts/update.mjs [--sin-ecosistema]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tls from 'node:tls';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Las webs de las administraciones vascas usan certificados de Izenpe, que Node no incluye.
// Añadimos su cadena (certs/) más las CA del sistema a las de Node.
{
  const extra = (await readFile(join(ROOT, 'certs', 'izenpe-chain.pem'), 'utf8')).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  let system = [];
  try { system = tls.getCACertificates('system'); } catch {}
  tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('bundled'), ...system, ...extra])]);
}
const OUT = join(ROOT, 'public', 'data.json');
const CHANGES = join(ROOT, 'public', 'cambios.json');
const UA = 'Mozilla/5.0 (compatible; EkosistemaVascoBot/1.0; +https://github.com/)';
const PARL = 'https://www.legebiltzarra.eus';
const IREKIA = 'https://www.irekia.euskadi.eus';

// Umbrales mínimos: si una fuente devuelve menos, se asume fallo y se conservan los datos anteriores.
const MIN_PARLAMENTARIOS = 60;
const MIN_CARGOS_GOBIERNO = 100;

// ---------- utilidades ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { retries = 2, timeout = 25000 } = {}) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      let charset = /charset=([\w-]+)/i.exec(res.headers.get('content-type') || '')?.[1];
      if (!charset) charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.toString('latin1'))?.[1];
      const text = new TextDecoder(normCharset(charset)).decode(buf);
      return { text, url: res.url };
    } catch (err) {
      if (i >= retries) throw new Error(`${url}: ${err.message}`);
      await sleep(1500 * (i + 1));
    }
  }
}

function normCharset(c) {
  c = (c || 'utf-8').toLowerCase();
  return /8859-1|latin1|windows-1252/.test(c) ? 'windows-1252' : 'utf-8';
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
        await sleep(150);
      }
    }),
  );
  return out;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', ordf: 'ª', ordm: 'º', ndash: '–', mdash: '—', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', euro: '€', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…' };
function decode(s = '') {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => (+d >= 128 && +d < 160 ? new TextDecoder('windows-1252').decode(Uint8Array.of(+d)) : String.fromCodePoint(+d)))
    .replace(/&([a-z]+);/gi, (m, n) => {
      if (ENTITIES[n]) return ENTITIES[n];
      const acc = /^([aeiouyAEIOUY])(acute|grave|uml|circ)$/.exec(n);
      if (acc) return (acc[1] + { acute: '́', grave: '̀', uml: '̈', circ: '̂' }[acc[2]]).normalize('NFC');
      return m;
    });
}
const strip = (s = '') => decode(s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const abs = (u, base) => (u ? new URL(decode(u), base).href : null);
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// dd.mm.yyyy o dd-mm-yyyy -> yyyy-mm-dd
const isoDate = (d) => {
  const m = /(\d{2})[.\-/](\d{2})[.\-/](\d{4})/.exec(d || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// "Apellidos, Nombre" -> "Nombre Apellidos"
const nombreNatural = (s) => (s.includes(',') ? s.split(',').map((x) => x.trim()).reverse().join(' ') : s);

// ---------- Parlamento Vasco ----------

const GRUPOS = {
  'GP EA-NV': { id: 'eaj-pnv', nombre: 'EAJ-PNV (Grupo Nacionalistas Vascos)', corto: 'EAJ-PNV', color: '#2E8B3D' },
  'GP EH Bildu': { id: 'eh-bildu', nombre: 'EH Bildu', corto: 'EH Bildu', color: '#00A39A' },
  'GP SV-ES': { id: 'pse-ee', nombre: 'Socialistas Vascos – Euskal Sozialistak (PSE-EE)', corto: 'PSE-EE', color: '#E30613' },
  'GP PV-ETP': { id: 'pp', nombre: 'Popular Vasco – Euskal Talde Popularra (PP)', corto: 'PP', color: '#1D84CE' },
  'GP Mixto-Sumar': { id: 'sumar', nombre: 'Grupo Mixto – Sumar', corto: 'Sumar', color: '#E5007E' },
  'GP Mixto-Vox': { id: 'vox', nombre: 'Grupo Mixto – Vox', corto: 'Vox', color: '#5AC035' },
};
const grupoInfo = (sigla) => GRUPOS[sigla] || { id: slug(sigla), nombre: sigla.replace(/^GP\s*/, 'Grupo '), corto: sigla.replace(/^GP\s*/, ''), color: '#888888' };

async function scrapeParlamento() {
  const { text } = await fetchText(`${PARL}/portal/es/parlamentarios-y-organos/parlamentarios`);
  const rows = [...text.matchAll(/<td class="miembro_persona"[^>]*>\s*<a href="\/fichas\/c_(\d+)\.html"[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td class="miembro_grupo"[^>]*>(?:<a[^>]*>)?([^<]*)(?:<\/a>)?<\/td>\s*<td class="miembro_cargo"[^>]*>([^<]*)<\/td>/g)];
  const lista = rows.map(([, id, nombre, grupo, fechas]) => ({ id, nombreOficial: decode(nombre).trim(), grupo: decode(grupo).trim(), alta: isoDate(fechas) }));
  console.log(`Parlamento: ${lista.length} parlamentarios en la lista`);

  return pool(lista, 4, async (p) => {
    const url = `${PARL}/fichas/c_${p.id}.html`;
    const g = grupoInfo(p.grupo);
    const base = {
      id: `parl-${p.id}`,
      nombre: nombreNatural(p.nombreOficial),
      nombreOficial: p.nombreOficial,
      grupo: g.id,
      alta: p.alta,
      url,
    };
    try {
      const { text: f } = await fetchText(url);
      const foto = /<div class="ficha_foto">\s*<img[^>]+src="([^"]+)"/.exec(f)?.[1];
      const datos = {};
      for (const [, k, v] of f.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) {
        datos[slug(strip(k).replace(/:$/, ''))] = strip(v);
      }
      const legislaturas = [...f.matchAll(/<h3>([^<]*Legislatura)<\/h3>/g)].map((m) => decode(m[1]).trim());
      // Primer bloque <ul> tras el primer título de legislatura = legislatura actual
      const ini = f.search(/<h3>[^<]*Legislatura<\/h3>/);
      const ul = ini >= 0 ? /<ul>([\s\S]*?)<\/ul>/.exec(f.slice(ini))?.[1] || '' : '';
      const cargos = [];
      for (const [, li] of ul.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
        const sustituye = /<p class="sustituto">([\s\S]*?)<\/p>/.exec(li)?.[1];
        const t = strip(li.replace(/<p class="sustituto">[\s\S]*?<\/p>/, ''));
        const m = /^(.*?)\s*\((\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})?\s*\)\s*$/.exec(t);
        if (!m || m[3]) continue; // sólo cargos vigentes
        const rol = strip(/<span class="negrita">([\s\S]*?)<\/span>/.exec(li)?.[1] || '');
        const organo = m[1].includes(':') ? m[1].split(':')[0].trim() : null;
        cargos.push({ texto: m[1], organo, rol: rol || null, desde: isoDate(m[2]), ...(sustituye ? { nota: strip(sustituye) } : {}) });
      }
      return {
        ...base,
        foto: abs(foto, url),
        titulacion: datos.titulacion || null,
        profesion: datos.profesion || null,
        idiomas: datos.idiomas || null,
        legislaturaActual: legislaturas[0] || null,
        numLegislaturas: new Set(legislaturas).size,
        cargos,
      };
    } catch (err) {
      console.warn(`  ! ficha ${p.id}: ${err.message}`);
      return { ...base, foto: null, cargos: [], error: true };
    }
  }).then((parlamentarios) => ({
    fuente: `${PARL}/portal/es/parlamentarios-y-organos/parlamentarios`,
    grupos: Object.values(GRUPOS).filter((g) => parlamentarios.some((p) => p.grupo === g.id)).concat(
      [...new Set(lista.map((p) => p.grupo))].filter((s) => !GRUPOS[s]).map(grupoInfo),
    ),
    parlamentarios: parlamentarios.sort((a, b) => a.nombreOficial.localeCompare(b.nombreOficial, 'es')),
  }));
}

// ---------- Gobierno Vasco (Irekia) ----------

function nivelCargo(c) {
  if (/^Lehendakari$/i.test(c)) return 'lehendakari';
  if (/^Vicelehendakari/i.test(c)) return 'vicelehendakari';
  if (/^Consejer[oa] /i.test(c)) return 'consejero';
  if (/^Viceconsejer/i.test(c)) return 'viceconsejero';
  if (/^Secretari[oa] General/i.test(c)) return 'secretario';
  if (/^Director[a]? General|Gerente|^Presidenta? /i.test(c)) return 'ente';
  if (/^Director/i.test(c)) return 'director';
  if (/^Delegad[oa] de Euskadi/i.test(c)) return 'delegacion';
  return 'otro';
}

async function scrapeGobierno() {
  const { text } = await fetchText(`${IREKIA}/es/politicians`);
  const bloques = text.split(/<div class='grid_item politician/).slice(1);
  const lista = bloques
    .map((b) => {
      const m = /href="\/es\/politicians\/(\d+)-([^"]+)">([^<]+)<\/a>/.exec(b);
      if (!m) return null;
      const foto = /<img class="avatar[^"]*"[^>]+src="([^"]+)"/.exec(b)?.[1];
      const cargo = strip(/<div class='position'>([\s\S]*?)<\/div>/.exec(b)?.[1] || '');
      return { id: m[1], slug: m[2], nombre: decode(m[3]).replace(/\s+/g, ' ').trim(), cargo, foto };
    })
    .filter(Boolean);
  console.log(`Gobierno: ${lista.length} cargos en Irekia`);

  const cargos = await pool(lista, 4, async (p) => {
    const url = `${IREKIA}/es/politicians/${p.id}-${p.slug}`;
    // Foto a tamaño completo (sin el prefijo de miniatura)
    const foto = p.foto && !/default/.test(p.foto) ? abs(p.foto.replace(/thumb_70_/, ''), IREKIA) : null;
    const base = { id: `gv-${p.id}`, nombre: p.nombre, cargo: p.cargo, nivel: nivelCargo(p.cargo), foto, url };
    try {
      const { text: d } = await fetchText(url);
      const area = /<span class="area"><a href="\/es\/departments\/(\d+)[^"]*">([^<]+)<\/a>/.exec(d);
      const roles = [...d.matchAll(/<td class="role_name">([\s\S]*?)<\/td>\s*<td class="dates">([\s\S]*?)<\/td>/g)].map(([, r, f]) => {
        const fechas = strip(f).match(/\d{2}-\d{2}-\d{4}/g) || [];
        return { cargo: strip(r), desde: isoDate(fechas[0]), hasta: isoDate(fechas[1]) };
      });
      const vigente = roles.find((r) => r.cargo === p.cargo) || roles.find((r) => !r.hasta) || null;
      const descripcion = strip(/<div class='text'>([\s\S]*?)<\/div>/.exec(d)?.[1] || '') || null;
      const email = /mailto:([^"?]+)/.exec(d)?.[1] || null;
      return {
        ...base,
        departamento: area ? decode(area[2]).trim() : null,
        departamentoId: area ? area[1] : null,
        desde: vigente?.desde || null,
        descripcion,
        email,
      };
    } catch (err) {
      console.warn(`  ! cargo ${p.id}: ${err.message}`);
      return { ...base, departamento: null, error: true };
    }
  });

  const deps = new Map();
  for (const c of cargos) if (c.departamento && !deps.has(c.departamento)) deps.set(c.departamento, { id: c.departamentoId, nombre: c.departamento });
  return {
    fuente: `${IREKIA}/es/politicians`,
    departamentos: [...deps.values()],
    cargos,
  };
}

// ---------- Diputaciones Forales ----------
// Cada Diputación publica su equipo de forma distinta, así que hay un extractor por territorio.
// niveles: 'general' (Diputado/a General), 'diputado' (diputado/a foral), 'director', 'gabinete'

const GIPUZKOA = 'https://www.gipuzkoa.eus';
const ARABA_IREKIA = 'https://irekia.araba.eus';
const BIZKAIA = 'https://www.bizkaia.eus';
const EUSKADI_GUIA = 'https://www.euskadi.eus';

function nivelForal(cargo) {
  if (/Diputad[oa] General/i.test(cargo) && !/Teniente|Gabinete|Jefe|Jefa/i.test(cargo)) return 'general';
  if (/Diputad[oa]/i.test(cargo) && !/Gabinete/i.test(cargo)) return 'diputado';
  if (/Gabinete|Asesor/i.test(cargo)) return 'gabinete';
  return 'director';
}

async function scrapeGipuzkoa() {
  const { text } = await fetchText(`${GIPUZKOA}/es/diputacion`);
  const deps = [...new Set([...text.matchAll(/href="(\/es\/diputacion\/[a-z0-9-]+)" rel="nofollow" tabindex/g)].map((m) => m[1]))];
  const departamentos = [];
  const cargos = [];
  await pool(deps, 3, async (path) => {
    const url = GIPUZKOA + path;
    const { text: h } = await fetchText(url);
    const titulo = strip(/<title>([^<]*)/.exec(h)?.[1] || '').replace(/\s*-\s*Departamento.*$/, '');
    const texto = strip(h.replace(/<style[\s\S]*?<\/style>/g, ''));
    const descripcion = /El departamento\s+(.*?)\s+Ver la agenda/.exec(texto)?.[1] || null;
    departamentos.push({ nombre: titulo, descripcion, url });

    const izena = /diputatua-izena">([\s\S]*?)<\/div>/.exec(h)?.[1];
    if (izena) {
      const cargo = strip(/<p[^>]*>([\s\S]*?)<\/p>/.exec(izena)?.[1] || '');
      const bioBloque = /izfe-bg-blue[\s\S]*?(<p class="text-white[\s\S]*?)<\/div>/.exec(h)?.[1] || '';
      const bio = [...bioBloque.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => strip(m[1])).filter(Boolean).join('\n\n');
      cargos.push({
        id: `gip-${slug(path.split('/').pop())}`,
        nombre: strip(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(izena)?.[1] || ''),
        cargo,
        nivel: nivelForal(cargo),
        departamento: titulo,
        foto: abs(/<img class="diputatua-img" src="([^"]+)"/.exec(h)?.[1], url),
        bio: bio || null,
        cv: abs(/<a href="([^"]+\.pdf[^"]*)"/.exec(izena)?.[1], url),
        url,
      });
    }
    // Directores: bloques <div id="directora|director"> seguidos de la descripción del área
    for (const m of h.matchAll(/<div id="director[a]?"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>\s*)?<p class="text-black">([\s\S]*?)<\/p>/g)) {
      const ps = [...m[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((x) => strip(x[1]));
      if (ps.length < 2) continue;
      cargos.push({
        id: `gip-${slug(ps[0])}`,
        nombre: ps[0],
        cargo: ps[1],
        nivel: nivelForal(ps[1]),
        departamento: titulo,
        foto: null,
        funciones: strip(m[2]) || null,
        cv: abs(/<a href="([^"]+)"/.exec(m[1])?.[1], url),
        url,
      });
    }
  });
  return { departamentos, cargos };
}

async function scrapeAraba() {
  const { text } = await fetchText(`${ARABA_IREKIA}/departamentos1`);
  const lista = [...text.matchAll(/<img src="([^"]+)"><\/div>\s*<h3><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/h3>\s*<h4>([^<]+)<\/h4>/g)].map((m) => ({ foto: m[1], path: m[2], dep: decode(m[3]).trim(), nombre: decode(m[4]).trim() }));
  const departamentos = [];
  const cargos = [];
  await pool(lista, 3, async (d) => {
    const url = abs(d.path, ARABA_IREKIA);
    let h = '';
    try {
      ({ text: h } = await fetchText(url));
    } catch (err) {
      console.warn(`  ! Araba ${d.dep}: ${err.message}`);
    }
    const funciones = [...(/<ul class="list links">([\s\S]*?)<\/ul>/.exec(h)?.[1] || '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => strip(m[1]).replace(/[,.;]$/, '')).filter((f) => !/^las demás/.test(f));
    const esGeneral = /diputado-general/.test(d.path);
    departamentos.push({ nombre: esGeneral ? 'Diputado General' : d.dep, descripcion: funciones.length ? `Funciones: ${funciones.join('; ')}.` : null, url });
    const cargo = strip(/<h5>([\s\S]*?)<\/h5>/.exec(h)?.[1] || '') || (esGeneral ? 'Diputado General' : `Diputado/a Foral de ${d.dep}`);
    const nota = /<p class="note">([\s\S]*?)<\/p>/.exec(h)?.[1];
    const partido = strip(/Adscripci[oó]n pol[ií]tica:<\/strong>([\s\S]*?)<\/p>/.exec(h)?.[1] || '') || null;
    const fotoGrande = /<h3>El equipo<\/h3>\s*<div>\s*<img src="([^"]+)"/.exec(h)?.[1];
    cargos.push({
      id: `ara-${slug(d.nombre)}`,
      nombre: d.nombre,
      cargo,
      nivel: esGeneral ? 'general' : nivelForal(cargo) === 'director' ? 'diputado' : nivelForal(cargo),
      departamento: esGeneral ? 'Diputado General' : d.dep,
      foto: abs(fotoGrande || d.foto, ARABA_IREKIA),
      bio: nota ? nota.split(/<br\s*\/?>/).map(strip).filter(Boolean).join(' · ') : null,
      partido,
      url,
    });
    for (const [, li] of (/<h3>Direcciones de [áa]rea<\/h3>\s*<ul class="list">([\s\S]*?)<\/ul>/.exec(h)?.[1] || '').matchAll(/<li>([\s\S]*?)<\/li>/g)) {
      const head = strip(/<strong>([\s\S]*?)<\/strong>/.exec(li)?.[1] || '');
      // La fecha de nombramiento aparece unas veces junto al cargo y otras junto al nombre
      const fecha = /nombramiento:?\s*([\d/]+)/.exec(strip(li))?.[1];
      const limpiar = (t) => t.replace(/\s*\(nombramiento:?[^)]*\)/, '').replace(/[\s:-]+$/, '').trim();
      const nombre = limpiar(strip(li.replace(/<strong>[\s\S]*?<\/strong>/, '').replace(/<a[\s\S]*$/, '')));
      if (!nombre) continue;
      cargos.push({
        id: `ara-${slug(nombre)}`,
        nombre,
        cargo: limpiar(head),
        nivel: 'director',
        departamento: esGeneral ? 'Diputado General' : d.dep,
        foto: null,
        desde: isoDate(fecha),
        cv: abs(/<a href="([^"]+)"[^>]*>\s*Descargar CV/.exec(li)?.[1], url),
        url,
      });
    }
  });
  return { departamentos, cargos };
}

async function scrapeBizkaia() {
  const { text } = await fetchText(`${BIZKAIA}/es/conoce-la-diputacion`);
  // Algunas tarjetas no enlazan al perfil de transparencia
  const lista = [...text.matchAll(/<div class="bipoinner">\s*(?:<a href='([^']+)'[^>]*>)?\s*<img src="([^"]+)"[^>]*>\s*<div class="bipo_cargo_equipo[^"]*"[^>]*>\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)];
  const vistos = new Set();
  const cargos = (
    await pool(lista, 3, async ([, perfil, foto, nombre, cargo]) => {
      nombre = strip(nombre);
      if (vistos.has(nombre)) return null;
      vistos.add(nombre);
      cargo = strip(cargo).replace(/ del Departamento de /, ' de ');
      let bio = null;
      if (perfil) try {
        const { text: p } = await fetchText(perfil);
        const sec = /bipo_introPublicidadIntroFoto[\s\S]*?<div class="container section">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/.exec(p)?.[1] || '';
        bio = [...sec.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => strip(m[1])).filter(Boolean).join('\n\n') || null;
      } catch (err) {
        console.warn(`  ! Bizkaia perfil ${nombre}: ${err.message}`);
      }
      const dep = /Diputad[oa] General/i.test(cargo) ? 'Diputada General' : cargo.replace(/^Diputad[oa] Foral (del |de )?/i, '');
      return { id: `biz-${slug(nombre)}`, nombre, cargo, nivel: nivelForal(cargo), departamento: dep, foto: abs(foto, BIZKAIA), bio, url: perfil || `${BIZKAIA}/es/conoce-la-diputacion` };
    })
  ).filter(Boolean);

  // Directores: la web foral no los lista, se toman de la Guía de Comunicación de euskadi.eus (sólo cargos vigentes)
  try {
    const guia = await guiaEuskadi('diputacion-foral-de-bizkaia');
    for (const g of guia) {
      if (cargos.some((c) => slug(c.nombre) === slug(g.nombre)) || g.nivel === 'general' || g.nivel === 'diputado') continue;
      cargos.push({ ...g, id: `biz-${slug(g.nombre)}`, departamento: null, fuenteSecundaria: true });
    }
  } catch (err) {
    console.warn(`  ! Bizkaia guía: ${err.message}`);
  }
  const departamentos = cargos.filter((c) => c.nivel === 'general' || c.nivel === 'diputado').map((c) => ({ nombre: c.departamento, descripcion: null, url: c.url }));
  return { departamentos, cargos };
}

// Guía de Comunicación del Gobierno Vasco: directorio de cargos por entidad. Se descartan los cargos con fecha de fin.
async function guiaEuskadi(entidad) {
  const { text } = await fetchText(`${EUSKADI_GUIA}/${entidad}/r61-vedorok/es/`);
  const sec = /id="cargos"([\s\S]*?)(?:<div class="tab-pane|$)/.exec(text)?.[1] || '';
  const out = [];
  for (const m of sec.matchAll(/<img src="([^"]+)"[\s\S]*?<a href="([^"]+)" class="name">([^<]+)<\/a><div class="position">([\s\S]*?)<\/div>/g)) {
    const pos = strip(m[4]);
    const fechas = /\((\d{2}\/\d{2}\/\d{4})?\s*-\s*(\d{2}\/\d{2}\/\d{4})?\s*\)/.exec(pos);
    if (fechas?.[2]) continue;
    const cargo = pos.replace(/^\([^)]*\)\s*/, '');
    out.push({
      nombre: decode(m[3]).replace(/\s+/g, ' ').trim(),
      cargo,
      nivel: nivelForal(cargo),
      foto: /noPicture/.test(m[1]) ? null : abs(m[1], EUSKADI_GUIA),
      desde: isoDate(fechas?.[1]),
      url: abs(m[2], EUSKADI_GUIA),
    });
  }
  return [...new Map(out.map((o) => [o.nombre, o])).values()];
}

const TERRITORIOS = [
  { id: 'gipuzkoa', nombre: 'Diputación Foral de Gipuzkoa', corto: 'Gipuzkoa', web: `${GIPUZKOA}/es/diputacion`, scrape: scrapeGipuzkoa, min: 8 },
  { id: 'bizkaia', nombre: 'Diputación Foral de Bizkaia', corto: 'Bizkaia', web: `${BIZKAIA}/es/conoce-la-diputacion`, scrape: scrapeBizkaia, min: 8 },
  { id: 'araba', nombre: 'Diputación Foral de Álava', corto: 'Araba', web: `${ARABA_IREKIA}/departamentos1`, scrape: scrapeAraba, min: 8 },
];

async function scrapeForales(prev) {
  const territorios = [];
  const errores = [];
  for (const t of TERRITORIOS) {
    const anterior = prev?.territorios?.find((x) => x.id === t.id);
    try {
      const r = await t.scrape();
      const diputados = r.cargos.filter((c) => c.nivel === 'general' || c.nivel === 'diputado').length;
      if (diputados < t.min) throw new Error(`sólo ${diputados} diputados`);
      console.log(`${t.nombre}: ${diputados} diputados, ${r.cargos.length} cargos`);
      territorios.push({ id: t.id, nombre: t.nombre, corto: t.corto, fuente: t.web, ...r, actualizado: new Date().toISOString() });
    } catch (err) {
      errores.push(`${t.nombre}: ${err.message}`);
      if (anterior) territorios.push(anterior);
    }
  }
  return { territorios, errores };
}

// ---------- Ecosistema ----------

async function scrapeEcosistema(gobierno) {
  const cat = JSON.parse(await readFile(join(ROOT, 'data', 'ecosistema.json'), 'utf8'));
  const agentes = await pool(cat.agentes, 6, async (a) => {
    const responsables = (gobierno?.cargos || [])
      .filter((c) => (a.claves || []).some((k) => c.cargo.toLowerCase().includes(k.toLowerCase())))
      .map((c) => c.id);
    let meta = { online: false };
    try {
      const { text: h, url } = await fetchText(a.web, { retries: 1, timeout: 15000 });
      const m = (re) => decode(re.exec(h)?.[1] || '').trim() || null;
      const ogImage = m(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || m(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      const linkHref = (rel) => m(new RegExp(`<link[^>]+rel=["'](?:${rel})["'][^>]+href=["']([^"']+)`, 'i')) || m(new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:${rel})["']`, 'i'));
      // Preferimos el icono de mayor tamaño (apple-touch-icon) al favicon
      const icon = linkHref('apple-touch-icon(?:-precomposed)?') || linkHref('icon|shortcut icon');
      meta = {
        online: true,
        titulo: m(/<title[^>]*>([\s\S]*?)<\/title>/i),
        descripcionWeb: m(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || m(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i),
        imagen: ogImage ? abs(ogImage, url) : null,
        icono: icon ? abs(icon, url) : null,
      };
    } catch (err) {
      console.warn(`  ! web ${a.id}: ${err.message}`);
    }
    return { ...a, ...meta, responsables, comprobado: new Date().toISOString() };
  });
  return { helices: cat.helices, agentes };
}

// ---------- Detección de cambios ----------

function diff(prev, next, tipo) {
  const out = [];
  const corto = Object.fromEntries(Object.values(GRUPOS).map((g) => [g.id, g.corto]));
  const etiqueta = (x) => x.cargo || (x.grupo ? `Parlamentario/a · ${corto[x.grupo] || x.grupo}` : '');
  const key = (x) => x.id;
  const P = new Map((prev || []).map((x) => [key(x), x]));
  const N = new Map((next || []).map((x) => [key(x), x]));
  for (const [k, n] of N) {
    const p = P.get(k);
    if (!p) out.push({ tipo, accion: 'alta', id: k, nombre: n.nombre, detalle: etiqueta(n) });
    else if (etiqueta(p) !== etiqueta(n)) out.push({ tipo, accion: 'cambio', id: k, nombre: n.nombre, detalle: `${etiqueta(p)} → ${etiqueta(n)}` });
  }
  for (const [k, p] of P) if (!N.has(k)) out.push({ tipo, accion: 'baja', id: k, nombre: p.nombre, detalle: etiqueta(p) });
  return out;
}

// ---------- main ----------

async function readJSON(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const sinEco = process.argv.includes('--sin-ecosistema');
  const soloForales = process.argv.includes('--solo-forales'); // para pruebas rápidas
  const prev = await readJSON(OUT, {});
  const errores = [];

  let parlamento = prev.parlamento;
  if (!soloForales) try {
    const p = await scrapeParlamento();
    if (p.parlamentarios.length < MIN_PARLAMENTARIOS) throw new Error(`sólo ${p.parlamentarios.length} parlamentarios`);
    parlamento = { ...p, actualizado: new Date().toISOString() };
  } catch (err) {
    errores.push(`Parlamento: ${err.message}`);
  }

  let gobierno = prev.gobierno;
  if (!soloForales) try {
    const g = await scrapeGobierno();
    if (g.cargos.length < MIN_CARGOS_GOBIERNO) throw new Error(`sólo ${g.cargos.length} cargos`);
    gobierno = { ...g, actualizado: new Date().toISOString() };
  } catch (err) {
    errores.push(`Gobierno: ${err.message}`);
  }

  let ecosistema = prev.ecosistema;
  let forales = prev.forales;
  try {
    const f = await scrapeForales(prev.forales);
    if (f.territorios.length) forales = { territorios: f.territorios };
    errores.push(...f.errores);
  } catch (err) {
    errores.push(`Diputaciones: ${err.message}`);
  }

  if (!sinEco && !soloForales) {
    try {
      ecosistema = { ...(await scrapeEcosistema(gobierno)), actualizado: new Date().toISOString() };
    } catch (err) {
      errores.push(`Ecosistema: ${err.message}`);
    }
  }

  const cambiosHoy = [
    ...(prev.parlamento ? diff(prev.parlamento.parlamentarios, parlamento?.parlamentarios, 'parlamento') : []),
    ...(prev.gobierno ? diff(prev.gobierno.cargos, gobierno?.cargos, 'gobierno') : []),
    ...(forales?.territorios || []).flatMap((t) => {
      const antes = prev.forales?.territorios?.find((x) => x.id === t.id);
      return antes ? diff(antes.cargos, t.cargos, t.id) : [];
    }),
  ];

  await mkdir(dirname(OUT), { recursive: true });
  const data = { generado: new Date().toISOString(), errores, parlamento, gobierno, forales, ecosistema };
  await writeFile(OUT, JSON.stringify(data, null, 1));

  if (cambiosHoy.length) {
    const hist = await readJSON(CHANGES, []);
    hist.unshift({ fecha: new Date().toISOString().slice(0, 10), cambios: cambiosHoy });
    await writeFile(CHANGES, JSON.stringify(hist.slice(0, 365), null, 1));
  } else if (!(await readJSON(CHANGES, null))) {
    await writeFile(CHANGES, '[]');
  }

  console.log(`\nParlamentarios: ${parlamento?.parlamentarios?.length ?? 0} · Cargos GV: ${gobierno?.cargos?.length ?? 0} · Cargos forales: ${forales?.territorios?.reduce((n, t) => n + t.cargos.length, 0) ?? 0} · Agentes: ${ecosistema?.agentes?.length ?? 0}`);
  console.log(`Cambios detectados: ${cambiosHoy.length}`);
  if (errores.length) {
    console.error('Errores:\n - ' + errores.join('\n - '));
    if (!parlamento || !gobierno) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
