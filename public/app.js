// Euskadi: quién es quién — interfaz. Lee data.json y cambios.json (generados por scripts/update.mjs).

const $ = (s, el = document) => el.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const iniciales = (n) => n.split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w)).slice(0, 2).map((w) => w[0]).join('');

// ---------- Explicaciones de cargos ----------

const EXPLICA = {
  lehendakari: { t: 'Lehendakari', d: 'Presidente del Gobierno Vasco. Lo elige el Parlamento Vasco. Dirige y coordina el Gobierno, nombra y cesa a los consejeros y es la máxima representación de Euskadi.' },
  vicelehendakari: { t: 'Vicelehendakari', d: 'Sustituye al Lehendakari en su ausencia y le ayuda a coordinar el Gobierno. Además, dirige un departamento como consejero o consejera.' },
  consejero: { t: 'Consejero / Consejera', d: 'Equivale a un ministro: dirige un departamento del Gobierno Vasco, propone leyes y decretos de su área, gestiona su presupuesto y forma parte del Consejo de Gobierno, que se reúne cada semana.' },
  viceconsejero: { t: 'Viceconsejero / Viceconsejera', d: 'Segundo nivel del departamento. Dirige un área concreta (p.ej. Ciencia e Innovación, Transición Energética) bajo la autoridad del consejero y coordina varias direcciones.' },
  secretario: { t: 'Secretaría General', d: 'Órgano de coordinación con rango de viceconsejería, normalmente en Lehendakaritza (Presidencia): coordina proyectos transversales, comunicación o acción exterior.' },
  director: { t: 'Director / Directora', d: 'Responsable de una dirección: ejecuta las políticas en un ámbito concreto, gestiona programas, ayudas y personal técnico. Es el nivel más operativo de los altos cargos.' },
  ente: { t: 'Dirección de ente público', d: 'Dirige una sociedad, agencia u organismo autónomo del Gobierno Vasco (SPRI, EVE, Lanbide, Osakidetza, EITB…), que presta un servicio o gestiona un ámbito con cierta autonomía.' },
  delegacion: { t: 'Delegación de Euskadi', d: 'Representa al Gobierno Vasco en el exterior (Unión Europea, Estados Unidos, Latinoamérica…), promoviendo relaciones institucionales, económicas y culturales.' },
  otro: { t: 'Otros cargos', d: 'Cargos con funciones específicas: autoridades independientes, comisionados, protección de datos, comunicación…' },
};

const EXPLICA_PARL = [
  [/^Parlamentari/i, 'Parlamentario/a', 'Miembro del Parlamento Vasco elegido por uno de los tres territorios. Vota leyes y presupuestos, presenta iniciativas y preguntas, y controla al Gobierno.'],
  [/^Presidenta?$/i, 'Presidencia', 'Dirige los debates y el trabajo del órgano (Parlamento o comisión): fija el orden del día, modera las sesiones y lo representa.'],
  [/^Vicepresident/i, 'Vicepresidencia', 'Sustituye a la presidencia en su ausencia y le ayuda a dirigir el órgano.'],
  [/^Secretari/i, 'Secretaría', 'Da fe de los acuerdos, redacta las actas y ayuda a la presidencia en el desarrollo de las sesiones.'],
  [/^Vocal/i, 'Vocal', 'Miembro de una comisión: participa en la tramitación de leyes de esa materia, comparecencias y votaciones.'],
  [/^Portavoz/i, 'Portavoz', 'Habla en nombre de su grupo parlamentario y lo representa en la Junta de Portavoces, que organiza el calendario de trabajo del Parlamento.'],
  [/^Representante del Parlamento/i, 'Representante del Parlamento', 'Designado por el Parlamento para formar parte de un consejo u organismo externo (EITB, Emakunde, Gogora…).'],
  [/^Lehendakari/i, 'Lehendakari', 'El Lehendakari es también parlamentario.'],
];
const explicaRol = (rol) => EXPLICA_PARL.find(([re]) => re.test(rol || '')) || null;

const ORGANOS = {
  'Mesa del Parlamento Vasco': 'La Mesa es el órgano de gobierno interno del Parlamento: organiza el trabajo, admite a trámite las iniciativas y gestiona la administración de la Cámara.',
  'Junta de Portavoces': 'Reúne a los portavoces de todos los grupos para fijar el orden del día de los plenos y el calendario.',
};

// Orden ideológico aproximado para el hemiciclo (izquierda → derecha)
const ORDEN_HEMICICLO = ['eh-bildu', 'sumar', 'pse-ee', 'eaj-pnv', 'pp', 'vox'];
const ORDEN_NIVEL = ['lehendakari', 'vicelehendakari', 'consejero', 'secretario', 'viceconsejero', 'director', 'ente', 'delegacion', 'otro'];
const NIVELES_FILTRO = [
  ['todos', 'Todos'],
  ['consejo', 'Consejo de Gobierno'],
  ['viceconsejero', 'Viceconsejerías'],
  ['director', 'Direcciones'],
  ['ente', 'Entes públicos'],
  ['delegacion', 'Delegaciones exteriores'],
];

// ---------- Estado ----------

const S = { data: null, cambios: [], tematicas: null, tab: 'gobierno', q: '', gNivel: 'consejo', gDep: '', pGrupo: '', pComision: '', eHelice: '', eTerr: '', eTipo: '', dTerr: '', dNivel: '', tema: '', tPart: '' };

// Sustituye una imagen que no carga por un círculo con iniciales
window.fallbackImg = (el) => {
  const span = document.createElement('span');
  span.className = el.className + ' ph';
  span.style.cssText = el.style.cssText;
  span.textContent = el.dataset.ini;
  el.replaceWith(span);
};

function img(src, nombre, cls = 'avatar', ring) {
  const style = ring ? ` style="--ring:${ring}"` : '';
  if (!src) return `<span class="${cls} ph"${style}>${esc(iniciales(nombre))}</span>`;
  return `<img class="${cls}"${style} src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-ini="${esc(iniciales(nombre))}" onerror="fallbackImg(this)">`;
}

const match = (...campos) => !S.q || campos.some((c) => norm(c || '').includes(norm(S.q)));

// ---------- Gobierno ----------

function renderGobierno() {
  const g = S.data.gobierno;
  if (!g) return ($('#list-gobierno').innerHTML = '<p class="empty">Sin datos.</p>');
  const deps = [...g.departamentos].sort((a, b) => (a.nombre === 'Lehendakaritza' ? -1 : b.nombre === 'Lehendakaritza' ? 1 : a.nombre.localeCompare(b.nombre, 'es')));

  $('#f-gobierno').innerHTML =
    NIVELES_FILTRO.map(([k, t]) => `<button class="chip" data-gnivel="${k}" aria-pressed="${S.gNivel === k}">${t}</button>`).join('') +
    `<span class="sep"></span><select class="chip" id="gdep"><option value="">Todos los departamentos</option>${deps.map((d) => `<option ${S.gDep === d.nombre ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select>`;

  const okNivel = (c) =>
    S.gNivel === 'todos' ||
    (S.gNivel === 'consejo' ? ['lehendakari', 'vicelehendakari', 'consejero'].includes(c.nivel) : S.gNivel === 'viceconsejero' ? ['viceconsejero', 'secretario'].includes(c.nivel) : S.gNivel === 'ente' ? ['ente', 'otro'].includes(c.nivel) : c.nivel === S.gNivel);
  const lista = g.cargos.filter((c) => okNivel(c) && (!S.gDep || c.departamento === S.gDep) && match(c.nombre, c.cargo, c.departamento));

  let html = '';
  if (S.gNivel === 'consejo' && !S.gDep && !S.q) {
    const orden = lista.sort((a, b) => ORDEN_NIVEL.indexOf(a.nivel) - ORDEN_NIVEL.indexOf(b.nivel) || a.cargo.localeCompare(b.cargo, 'es'));
    html = `<div class="grid">${orden.map((c, i) => cardGob(c, i === 0)).join('')}</div>`;
  } else {
    for (const d of deps) {
      const items = lista.filter((c) => c.departamento === d.nombre).sort((a, b) => ORDEN_NIVEL.indexOf(a.nivel) - ORDEN_NIVEL.indexOf(b.nivel) || a.cargo.localeCompare(b.cargo, 'es'));
      if (!items.length) continue;
      html += `<section class="dept"><div class="dept-head"><h2>${esc(d.nombre)}</h2><span>${items.length} cargo${items.length > 1 ? 's' : ''}</span></div>
        <div class="grid">${items.map((c) => cardGob(c, ['lehendakari', 'vicelehendakari', 'consejero'].includes(c.nivel) && S.gNivel !== 'consejo')).join('')}</div></section>`;
    }
  }
  $('#list-gobierno').innerHTML = html || '<p class="empty">No hay resultados.</p>';
}

function cardGob(c, lead) {
  const badge = EXPLICA[c.nivel]?.t;
  return `<button class="card ${lead ? 'lead-card' : ''}" data-open="gob:${c.id}">
    ${img(c.foto, c.nombre)}
    <div class="card-body">
      <div class="card-name">${esc(c.nombre)}</div>
      <div class="card-role">${esc(c.cargo)}</div>
      ${lead && c.descripcion ? `<div class="card-desc">${esc(c.descripcion)}</div>` : ''}
      ${S.gNivel === 'consejo' && c.nivel !== 'lehendakari' ? '' : `<span class="badge">${esc(badge || '')}</span>`}
    </div></button>`;
}

function modalGob(c) {
  const ex = EXPLICA[c.nivel];
  const agentes = (S.data.ecosistema?.agentes || []).filter((a) => a.responsables?.includes(c.id));
  const equipo = c.nivel.match(/lehendakari|consejero/) ? S.data.gobierno.cargos.filter((x) => x.departamento === c.departamento && x.id !== c.id && ['viceconsejero', 'secretario'].includes(x.nivel)) : [];
  return `<div class="m-head">${img(c.foto, c.nombre)}<div><h2>${esc(c.nombre)}</h2><div class="card-role">${esc(c.cargo)}</div>
    ${c.departamento ? `<span class="badge acc">${esc(c.departamento)}</span>` : ''}</div></div>
    ${ex ? `<div class="m-sec"><h3>¿Qué hace este cargo?</h3><div class="explica"><strong>${esc(ex.t)}.</strong> ${esc(ex.d)}</div></div>` : ''}
    ${c.descripcion ? `<div class="m-sec"><h3>Funciones según Irekia</h3><p>${esc(c.descripcion)}</p></div>` : ''}
    ${c.desde ? `<div class="m-sec"><h3>En el cargo desde</h3><p>${fecha(c.desde)}</p></div>` : ''}
    ${equipo.length ? `<div class="m-sec"><h3>Equipo directo</h3><ul class="roles">${equipo.map((x) => `<li><a href="#" data-open="gob:${x.id}">${esc(x.nombre)}</a><small>${esc(x.cargo)}</small></li>`).join('')}</ul></div>` : ''}
    ${agentes.length ? `<div class="m-sec"><h3>Entidad del ecosistema</h3><ul class="roles">${agentes.map((a) => `<li><a href="#" data-open="eco:${a.id}">${esc(a.nombre)}</a><small>${esc(a.tipo)}</small></li>`).join('')}</ul></div>` : ''}
    <div class="links"><a class="btn primary" href="${esc(c.url)}" target="_blank" rel="noopener">Ficha oficial en Irekia ↗</a></div>`;
}

// ---------- Parlamento ----------

const grupoDe = (id) => S.data.parlamento.grupos.find((g) => g.id === id) || { corto: id, nombre: id, color: '#888' };

function rolPrincipal(p) {
  const c = p.cargos;
  const mesa = c.find((x) => x.organo === 'Mesa del Parlamento Vasco');
  if (mesa) return `${mesa.rol} del Parlamento`;
  if (c.some((x) => x.organo === 'Gobierno Vasco' || x.organo === 'Lehendakari')) return 'Lehendakari';
  if (c.some((x) => x.organo === 'Junta de Portavoces')) return 'Portavoz del grupo';
  const pres = c.filter((x) => /^Comisi/.test(x.organo || '') && /^Presidenta?$/.test(x.rol));
  if (pres.length) return `${pres[0].rol} de la ${pres[0].organo}`;
  return c.find((x) => !x.organo)?.rol || 'Parlamentario/a';
}

function renderParlamento() {
  const P = S.data.parlamento;
  if (!P) return;
  const grupos = ORDEN_HEMICICLO.map((id) => P.grupos.find((g) => g.id === id)).filter(Boolean).concat(P.grupos.filter((g) => !ORDEN_HEMICICLO.includes(g.id)));

  // Hemiciclo
  const seats = hemicicloSeats(P.parlamentarios.length);
  const porGrupo = grupos.flatMap((g) => P.parlamentarios.filter((p) => p.grupo === g.id));
  $('#hemiciclo').innerHTML = seats
    .map((s, i) => {
      const p = porGrupo[i];
      const g = grupoDe(p.grupo);
      const dim = S.pGrupo && S.pGrupo !== p.grupo ? 0.18 : 1;
      return `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r}" fill="${g.color}" opacity="${dim}" data-open="parl:${p.id}"><title>${esc(p.nombre)} · ${esc(g.corto)}</title></circle>`;
    })
    .join('') + `<text x="200" y="200" text-anchor="middle" font-size="30" font-weight="700" fill="currentColor">${P.parlamentarios.length}</text><text x="200" y="214" text-anchor="middle" font-size="10" fill="currentColor" opacity=".6">escaños · mayoría absoluta 38</text>`;
  $('#leyenda').innerHTML = grupos
    .map((g) => {
      const n = P.parlamentarios.filter((p) => p.grupo === g.id).length;
      return `<button data-pgrupo="${g.id}" style="${S.pGrupo && S.pGrupo !== g.id ? 'opacity:.45' : ''}"><span class="sw" style="background:${g.color}"></span><span>${esc(g.corto)}<br><small>${esc(g.nombre)}</small></span><b>${n}</b></button>`;
    })
    .join('');

  const comisiones = [...new Set(P.parlamentarios.flatMap((p) => p.cargos.map((c) => c.organo).filter((o) => o && /^Comisi/.test(o))))].sort((a, b) => a.localeCompare(b, 'es'));
  $('#f-parlamento').innerHTML =
    `<button class="chip" data-pgrupo="" aria-pressed="${!S.pGrupo}">Todos los grupos</button>` +
    grupos.map((g) => `<button class="chip" data-pgrupo="${g.id}" aria-pressed="${S.pGrupo === g.id}"><span class="dot" style="background:${g.color}"></span>${esc(g.corto)}</button>`).join('') +
    `<span class="sep"></span><select class="chip" id="pcom"><option value="">Todas las comisiones</option>${comisiones.map((c) => `<option ${S.pComision === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;

  const lista = P.parlamentarios.filter(
    (p) => (!S.pGrupo || p.grupo === S.pGrupo) && (!S.pComision || p.cargos.some((c) => c.organo === S.pComision)) && match(p.nombre, grupoDe(p.grupo).corto, p.profesion, ...p.cargos.map((c) => c.texto)),
  );
  $('#list-parlamento').innerHTML =
    lista
      .map((p) => {
        const g = grupoDe(p.grupo);
        const rolCom = S.pComision ? p.cargos.find((c) => c.organo === S.pComision)?.rol : null;
        return `<button class="card" data-open="parl:${p.id}">${img(p.foto, p.nombre, 'avatar', g.color)}
        <div class="card-body"><div class="card-name">${esc(p.nombre)}</div><div class="card-role">${esc(rolCom ? `${rolCom} de la comisión` : rolPrincipal(p))}</div>
        <span class="badge" style="background:color-mix(in srgb, ${g.color} 16%, transparent)">${esc(g.corto)}</span></div></button>`;
      })
      .join('') || '<p class="empty">No hay resultados.</p>';
}

function hemicicloSeats(n) {
  const rows = 5, R0 = 80, R1 = 185, cx = 200, cy = 195;
  const radii = Array.from({ length: rows }, (_, i) => R0 + ((R1 - R0) * i) / (rows - 1));
  const total = radii.reduce((a, r) => a + r, 0);
  let counts = radii.map((r) => Math.round((n * r) / total));
  counts[rows - 1] += n - counts.reduce((a, b) => a + b, 0);
  const seats = [];
  radii.forEach((r, i) => {
    for (let j = 0; j < counts[i]; j++) {
      const a = Math.PI - (Math.PI * j) / (counts[i] - 1);
      seats.push({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a), a, r: 8 });
    }
  });
  return seats.sort((s, t) => t.a - s.a);
}

function modalParl(p) {
  const g = grupoDe(p.grupo);
  const comisiones = p.cargos.filter((c) => c.organo);
  const vistos = new Set();
  const explicaciones = p.cargos
    .map((c) => explicaRol(c.rol))
    .filter((e) => e && !vistos.has(e[1]) && vistos.add(e[1]));
  return `<div class="m-head">${img(p.foto, p.nombre, 'avatar', g.color)}<div><h2>${esc(p.nombre)}</h2><div class="card-role">${esc(rolPrincipal(p))}</div>
    <span class="badge" style="background:color-mix(in srgb, ${g.color} 18%, transparent)">${esc(g.nombre)}</span></div></div>
    <div class="m-sec"><dl class="kv">
      ${p.alta ? `<dt>En el escaño desde</dt><dd>${fecha(p.alta)}</dd>` : ''}
      ${p.legislaturaActual ? `<dt>Legislaturas</dt><dd>${p.numLegislaturas} (actual: ${esc(p.legislaturaActual)})</dd>` : ''}
      ${p.titulacion ? `<dt>Formación</dt><dd>${esc(p.titulacion)}</dd>` : ''}
      ${p.profesion ? `<dt>Profesión</dt><dd>${esc(p.profesion)}</dd>` : ''}
      ${p.idiomas ? `<dt>Idiomas</dt><dd>${esc(p.idiomas)}</dd>` : ''}
    </dl></div>
    ${comisiones.length ? `<div class="m-sec"><h3>Cargos y comisiones</h3><ul class="roles">${comisiones.map((c) => `<li><strong>${esc(c.rol || '')}</strong> · ${esc(c.organo)}<small>Desde ${fecha(c.desde)}${ORGANOS[c.organo] ? ` — ${esc(ORGANOS[c.organo])}` : ''}</small></li>`).join('')}</ul></div>` : ''}
    ${explicaciones.length ? `<div class="m-sec"><h3>¿Qué significan estos cargos?</h3>${explicaciones.map(([, t, d]) => `<p class="explica"><strong>${esc(t)}:</strong> ${esc(d)}</p>`).join('')}</div>` : ''}
    <div class="links"><a class="btn primary" href="${esc(p.url)}" target="_blank" rel="noopener">Ficha oficial en el Parlamento ↗</a>
    <a class="btn" href="${esc(p.url.replace('.html', '_ini.html'))}" target="_blank" rel="noopener">Iniciativas presentadas ↗</a></div>`;
}

// ---------- Diputaciones Forales ----------

const EXPLICA_FORAL = {
  general: { t: 'Diputado/a General', d: 'Preside la Diputación Foral, el gobierno del territorio histórico. Lo eligen las Juntas Generales (el parlamento del territorio). Nombra a los diputados forales, dirige el Consejo de Gobierno Foral y es responsable último de la Hacienda foral, que recauda los impuestos gracias al Concierto Económico.' },
  diputado: { t: 'Diputado/a foral', d: 'Dirige un departamento de la Diputación, como un consejero pero a escala de territorio: carreteras, servicios sociales, promoción económica, cultura… Forma parte del Consejo de Gobierno Foral, que aprueba los decretos y el presupuesto del territorio.' },
  director: { t: 'Dirección foral', d: 'Gestiona un área concreta del departamento (p. ej. Innovación, Turismo, Hacienda): ejecuta los programas, convoca ayudas y coordina al personal técnico.' },
  gabinete: { t: 'Gabinete', d: 'Equipo de apoyo directo al Diputado/a General: coordinación política, agenda y comunicación.' },
};
const ORDEN_FORAL = ['general', 'diputado', 'gabinete', 'director'];
const territorios = () => S.data.forales?.territorios || [];
const foralPorId = (id) => {
  for (const t of territorios()) {
    const c = t.cargos.find((x) => x.id === id);
    if (c) return { c, t };
  }
  return {};
};

function renderDiputaciones() {
  const T = territorios();
  if (!T.length) return ($('#list-diputaciones').innerHTML = '<p class="empty">Sin datos todavía. Ejecuta npm run update.</p>');
  $('#f-diputaciones').innerHTML =
    `<button class="chip" data-dterr="" aria-pressed="${!S.dTerr}">Las tres</button>` +
    T.map((t) => `<button class="chip" data-dterr="${t.id}" aria-pressed="${S.dTerr === t.id}">${esc(t.corto)}</button>`).join('') +
    `<span class="sep"></span>` +
    [['', 'Todos los cargos'], ['diputados', 'Solo diputados/as']].map(([k, l]) => `<button class="chip" data-dnivel="${k}" aria-pressed="${S.dNivel === k}">${l}</button>`).join('');

  let html = '';
  for (const t of T.filter((t) => !S.dTerr || S.dTerr === t.id)) {
    const ok = (c) => (S.dNivel !== 'diputados' || ['general', 'diputado'].includes(c.nivel)) && match(c.nombre, c.cargo, c.departamento, t.corto);
    const lista = t.cargos.filter(ok);
    if (!lista.length) continue;
    html += `<section class="territorio"><div class="terr-head"><h2>${esc(t.nombre)}</h2><a href="${esc(t.fuente)}" target="_blank" rel="noopener">fuente oficial ↗</a></div>`;
    if (S.dNivel === 'diputados' || S.q) {
      const orden = lista.sort((a, b) => ORDEN_FORAL.indexOf(a.nivel) - ORDEN_FORAL.indexOf(b.nivel));
      html += `<div class="grid">${orden.map((c) => cardForal(c, c.nivel === 'general')).join('')}</div>`;
    } else {
      // Un bloque por departamento: diputado/a y su equipo
      const deps = [...new Set(lista.map((c) => c.departamento))];
      const sinDep = deps.includes(null);
      for (const dep of deps.filter(Boolean).sort((a, b) => rangoDep(t, a) - rangoDep(t, b))) {
        const items = lista.filter((c) => c.departamento === dep).sort((a, b) => ORDEN_FORAL.indexOf(a.nivel) - ORDEN_FORAL.indexOf(b.nivel));
        html += `<div class="dept"><div class="dept-head"><h3>${esc(dep)}</h3><span>${items.length} cargo${items.length > 1 ? 's' : ''}</span></div>
          <div class="grid">${items.map((c) => cardForal(c, ['general', 'diputado'].includes(c.nivel))).join('')}</div></div>`;
      }
      if (sinDep) {
        const items = lista.filter((c) => !c.departamento);
        html += `<div class="dept"><div class="dept-head"><h3>Direcciones generales y gabinete</h3><span>${items.length} cargos</span></div>
          <p class="nota">La web de la Diputación no publica sus directores; se toman de la Guía de Comunicación de euskadi.eus, que puede tardar en recoger los últimos cambios.</p>
          <div class="grid">${items.map((c) => cardForal(c, false)).join('')}</div></div>`;
      }
    }
    html += `</section>`;
  }
  $('#list-diputaciones').innerHTML = html || '<p class="empty">No hay resultados.</p>';
}

// El Diputado/a General primero; luego departamentos por orden de aparición en la web oficial
function rangoDep(t, dep) {
  const c = t.cargos.find((x) => x.departamento === dep && x.nivel === 'general');
  return c ? -1 : t.cargos.findIndex((x) => x.departamento === dep);
}

function cardForal(c, lead) {
  return `<button class="card ${lead ? 'lead-card' : ''}" data-open="foral:${c.id}">
    ${img(c.foto, c.nombre)}
    <div class="card-body">
      <div class="card-name">${esc(c.nombre)}</div>
      <div class="card-role">${esc(c.cargo)}</div>
      ${lead && c.bio ? `<div class="card-desc">${esc(c.bio)}</div>` : ''}
      ${!lead && c.funciones ? `<div class="card-desc">${esc(c.funciones)}</div>` : ''}
    </div></button>`;
}

function modalForal({ c, t }) {
  const ex = EXPLICA_FORAL[c.nivel];
  const dep = t.departamentos.find((d) => d.nombre === c.departamento);
  const equipo = ['general', 'diputado'].includes(c.nivel) ? t.cargos.filter((x) => x.departamento === c.departamento && x.id !== c.id) : [];
  const jefe = c.nivel === 'director' && c.departamento ? t.cargos.find((x) => x.departamento === c.departamento && ['general', 'diputado'].includes(x.nivel)) : null;
  return `<div class="m-head">${img(c.foto, c.nombre)}<div><h2>${esc(c.nombre)}</h2><div class="card-role">${esc(c.cargo)}</div>
    <span class="badge acc">${esc(t.nombre)}</span></div></div>
    ${ex ? `<div class="m-sec"><h3>¿Qué hace este cargo?</h3><div class="explica"><strong>${esc(ex.t)}.</strong> ${esc(ex.d)}</div></div>` : ''}
    ${c.funciones ? `<div class="m-sec"><h3>Funciones de su área</h3><p>${esc(c.funciones)}</p></div>` : ''}
    ${c.bio ? `<div class="m-sec"><h3>Trayectoria</h3>${c.bio.split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
    ${c.partido || c.desde ? `<div class="m-sec"><dl class="kv">${c.partido ? `<dt>Adscripción política</dt><dd>${esc(c.partido)}</dd>` : ''}${c.desde ? `<dt>Nombramiento</dt><dd>${fecha(c.desde)}</dd>` : ''}</dl></div>` : ''}
    ${dep?.descripcion && c.nivel !== 'director' ? `<div class="m-sec"><h3>El departamento</h3><p>${esc(dep.descripcion)}</p></div>` : ''}
    ${jefe ? `<div class="m-sec"><h3>Depende de</h3><ul class="roles"><li><a href="#" data-open="foral:${jefe.id}">${esc(jefe.nombre)}</a><small>${esc(jefe.cargo)}</small></li></ul></div>` : ''}
    ${equipo.length ? `<div class="m-sec"><h3>Equipo del departamento</h3><ul class="roles">${equipo.map((x) => `<li><a href="#" data-open="foral:${x.id}">${esc(x.nombre)}</a><small>${esc(x.cargo)}</small></li>`).join('')}</ul></div>` : ''}
    <div class="links"><a class="btn primary" href="${esc(c.url)}" target="_blank" rel="noopener">Ficha oficial ↗</a>
    ${c.cv ? `<a class="btn" href="${esc(c.cv)}" target="_blank" rel="noopener">Currículum ↗</a>` : ''}</div>
    ${c.fuenteSecundaria ? `<p class="nota">Fuente: Guía de Comunicación de euskadi.eus.</p>` : ''}`;
}

// ---------- Ecosistema ----------

// Grupos del selector de tipos. Los tipos que no aparecen aquí se listan sueltos después.
const FAMILIAS_TIPO = [
  { id: 'universidades', nombre: 'Universidades', tipos: ['Universidad pública', 'Universidad cooperativa', 'Universidad privada', 'Facultad y centro de investigación'] },
  { id: 'fundaciones', nombre: 'Fundaciones', tipos: ['Fundación pública', 'Fundación foral', 'Fundación universitaria', 'Fundación', 'Fundación (cuidados y envejecimiento)'] },
  { id: 'institutos', nombre: 'Institutos y centros de investigación', tipos: ['BERC – Centro de excelencia', 'CIC – Centro de Investigación Cooperativa', 'Instituto de Investigación Sanitaria (IIS)', 'Instituto de investigación', 'Instituto de investigación en servicios de salud', 'Centro de investigación (CSIC-UPV/EHU)'] },
  { id: 'agencias', nombre: 'Agencias', tipos: ['Agencia pública', 'Agencia de innovación (público-privada)', 'Alianza de investigación', 'Agencia foral (BIC Bizkaia)', 'Agencia de desarrollo comarcal'] },
];
const familiaTipo = (valor) => FAMILIAS_TIPO.find((f) => `familia:${f.id}` === valor);

function opcionesTipo(tipos) {
  const opcion = (valor, texto) => `<option value="${esc(valor)}" ${S.eTipo === valor ? 'selected' : ''}>${esc(texto)}</option>`;
  const agrupados = new Set(FAMILIAS_TIPO.flatMap((f) => f.tipos));
  const familias = FAMILIAS_TIPO.filter((f) => f.tipos.some((t) => tipos.includes(t))).map((f) => opcion(`familia:${f.id}`, f.nombre)).join('');
  return familias + tipos.filter((t) => !agrupados.has(t)).map((t) => opcion(t, t)).join('');
}

function renderEcosistema() {
  const E = S.data.ecosistema;
  if (!E) return;
  const H = E.helices;
  $('#helices').innerHTML = Object.entries(H)
    .map(([k, h]) => `<button class="helix" style="--hc:var(--h-${k})" data-ehelice="${k}" aria-pressed="${S.eHelice === k}"><h3>${esc(h.nombre)} <span>${E.agentes.filter((a) => a.helice === k).length}</span></h3><p>${esc(h.descripcion)}</p></button>`)
    .join('');
  const base = E.agentes.filter((a) => !S.eHelice || a.helice === S.eHelice);
  const terrs = [...new Set(base.map((a) => a.territorio))].sort();
  const tipos = [...new Set(base.map((a) => a.tipo))].sort((a, b) => a.localeCompare(b, 'es'));
  $('#f-ecosistema').innerHTML =
    `<select class="chip" id="eterr"><option value="">Todos los territorios</option>${terrs.map((t) => `<option ${S.eTerr === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` +
    `<select class="chip" id="etipo"><option value="">Todos los tipos</option>${opcionesTipo(tipos)}</select>` +
    (S.eHelice || S.eTerr || S.eTipo ? `<button class="chip" data-ereset>Quitar filtros ✕</button>` : '');

  const familia = familiaTipo(S.eTipo);
  const okTipo = (a) => !S.eTipo || (familia ? familia.tipos.includes(a.tipo) : a.tipo === S.eTipo);
  const lista = base.filter((a) => (!S.eTerr || a.territorio === S.eTerr) && okTipo(a) && match(a.nombre, a.siglas, a.tipo, a.descripcion, a.territorio));
  // Al elegir un grupo, las entidades se muestran por subgrupos
  const html = familia
    ? familia.tipos
        .map((t) => {
          const items = lista.filter((a) => a.tipo === t);
          return items.length ? `<section class="dept"><div class="dept-head"><h2>${esc(t)}</h2><span>${items.length} entidad${items.length > 1 ? 'es' : ''}</span></div><div class="grid grid-eco">${items.map(cardEco).join('')}</div></section>` : '';
        })
        .join('')
    : lista.map(cardEco).join('');
  $('#list-ecosistema').innerHTML = html || '<p class="empty">No hay resultados.</p>';
}

function cardEco(a) {
  const gob = S.data.gobierno?.cargos || [];
  const resp = a.responsables.map((id) => gob.find((c) => c.id === id)).filter(Boolean);
  return `<button class="card eco" style="--hc:var(--h-${a.helice})" data-open="eco:${a.id}">
        <div class="eco-top">${logo(a)}<div class="card-body"><div class="card-name">${esc(a.nombre)}</div><div class="card-role">${esc(a.tipo)} · ${esc(a.territorio)}</div></div></div>
        <p class="eco-desc">${esc(a.descripcion)}</p>
        ${resp.length ? `<div class="eco-meta"><div class="mini-people">${resp.slice(0, 5).map((c) => (c.foto ? `<img src="${esc(c.foto)}" alt="" title="${esc(c.nombre)}" loading="lazy">` : `<span title="${esc(c.nombre)}"></span>`)).join('')}</div><small class="card-role">${resp.length} cargo${resp.length > 1 ? 's' : ''} público${resp.length > 1 ? 's' : ''}</small></div>` : ''}
      </button>`;
}

function logo(a) {
  const ini = esc((a.siglas || a.nombre).slice(0, 3).toUpperCase());
  if (!a.icono) return `<span class="eco-logo ph">${ini}</span>`;
  return `<img class="eco-logo" src="${esc(a.icono)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-ini="${ini}" onerror="fallbackImg(this)">`;
}

function modalEco(a) {
  const H = S.data.ecosistema.helices[a.helice];
  const resp = a.responsables.map((id) => S.data.gobierno?.cargos.find((c) => c.id === id)).filter(Boolean);
  return `<div class="m-head" style="--hc:var(--h-${a.helice})">${logo(a)}<div><h2>${esc(a.nombre)}</h2><div class="card-role">${esc(a.tipo)} · ${esc(a.territorio)}</div>
    <span class="badge" style="background:color-mix(in srgb, var(--h-${a.helice}) 16%, transparent)">Hélice: ${esc(H.nombre)}</span></div></div>
    ${a.imagen ? `<img src="${esc(a.imagen)}" alt="" referrerpolicy="no-referrer" style="width:100%;max-height:200px;object-fit:contain;background:#fff;border:1px solid var(--border);border-radius:10px" onerror="this.remove()">` : ''}
    <div class="m-sec"><h3>Qué es</h3><p>${esc(a.descripcion)}</p></div>
    ${a.descripcionWeb ? `<div class="m-sec"><h3>Cómo se presenta en su web</h3><p>${esc(a.descripcionWeb)}</p></div>` : ''}
    <div class="m-sec"><h3>Papel en la cuádruple hélice</h3><p class="explica">${esc(H.descripcion)}</p></div>
    ${resp.length ? `<div class="m-sec"><h3>Responsables públicos (Gobierno Vasco)</h3><ul class="roles">${resp.map((c) => `<li><a href="#" data-open="gob:${c.id}">${esc(c.nombre)}</a><small>${esc(c.cargo)}</small></li>`).join('')}</ul></div>` : ''}
    <div class="links"><a class="btn primary" href="${esc(a.web)}" target="_blank" rel="noopener">Visitar web ↗</a></div>
    ${a.online === false ? `<p class="card-role" style="margin-top:10px">⚠️ La web no respondió en la última comprobación (${fecha(a.comprobado)}).</p>` : ''}`;
}

// ---------- Temáticas ----------

const PARTICIPACION = { participa: 'Toma parte', podria: 'Tomaría parte' };
const NIVELES_TITULAR = ['lehendakari', 'vicelehendakari', 'consejero', 'general', 'diputado'];
const ORDEN_PERSONAS = ['lehendakari', 'vicelehendakari', 'general', 'consejero', 'diputado', 'secretario', 'viceconsejero', 'gabinete', 'director', 'ente', 'delegacion', 'otro'];
const primeroParticipa = (a, b) => (a.participacion === b.participacion ? 0 : a.participacion === 'participa' ? -1 : 1);

// Personas de un departamento según los patrones de cargo definidos en tematicas.json
function personasTema(b) {
  const cargos = b.institucion === 'gv' ? S.data.gobierno?.cargos || [] : territorios().find((t) => t.id === b.institucion)?.cargos || [];
  const patrones = b.cargos.filter((p) => p !== '@titular').map((p) => new RegExp(p, 'i'));
  const conTitular = b.cargos.includes('@titular');
  return cargos
    .filter((c) => (conTitular && c.departamento === b.departamento && NIVELES_TITULAR.includes(c.nivel)) || ((c.departamento === b.departamento || !c.departamento) && patrones.some((re) => re.test(c.cargo))))
    .sort((x, y) => ORDEN_PERSONAS.indexOf(x.nivel) - ORDEN_PERSONAS.indexOf(y.nivel));
}

const bloqueTema = (titulo, participacion, papel, tarjetas, claseGrid = '') =>
  `<div class="dept"><div class="dept-head"><h3>${esc(titulo)}</h3><span class="part ${participacion}">${PARTICIPACION[participacion]}</span></div>${papel ? `<p class="nota">${esc(papel)}</p>` : ''}<div class="grid ${claseGrid}">${tarjetas}</div></div>`;

function renderTematicas() {
  const temas = S.tematicas?.tematicas || [];
  if (!temas.length) return ($('#list-tematicas').innerHTML = '<p class="empty">Sin datos.</p>');
  const tema = temas.find((t) => t.id === S.tema) || temas[0];
  $('#f-tematicas').innerHTML =
    temas.map((t) => `<button class="chip" data-tema="${t.id}" aria-pressed="${t.id === tema.id}">${esc(t.nombre)}</button>`).join('') +
    `<span class="sep"></span>` +
    [['', 'Todas'], ['participa', 'Toman parte'], ['podria', 'Tomarían parte']].map(([k, l]) => `<button class="chip" data-tpart="${k}" aria-pressed="${S.tPart === k}">${l}</button>`).join('');

  const okPart = (x) => !S.tPart || x.participacion === S.tPart;
  const instituciones = [['gv', 'Gobierno Vasco'], ...territorios().map((t) => [t.id, t.nombre])];
  let personas = '';
  for (const [id, nombre] of instituciones) {
    const bloques = tema.departamentos
      .filter((b) => b.institucion === id && okPart(b))
      .sort(primeroParticipa)
      .map((b) => {
        const gente = personasTema(b).filter((c) => match(c.nombre, c.cargo, b.departamento, b.papel));
        return gente.length ? bloqueTema(b.departamento, b.participacion, b.papel, gente.map((c) => (id === 'gv' ? cardGob(c, false) : cardForal(c, false))).join('')) : '';
      })
      .join('');
    if (bloques) personas += `<section class="territorio"><div class="terr-head"><h2>${esc(nombre)}</h2></div>${bloques}</section>`;
  }

  const agentes = S.data.ecosistema?.agentes || [];
  const ecosistema = tema.ecosistema
    .filter(okPart)
    .sort(primeroParticipa)
    .map((g) => {
      const lista = agentes.filter((a) => (g.ids?.includes(a.id) || g.tipos?.includes(a.tipo)) && match(a.nombre, a.siglas, a.tipo, a.descripcion, a.territorio, g.nombre));
      return lista.length ? bloqueTema(g.nombre, g.participacion, '', lista.map(cardEco).join(''), 'grid-eco') : '';
    })
    .join('');

  $('#list-tematicas').innerHTML =
    `<p class="tema-desc">${esc(tema.descripcion)}</p>` +
    (personas || ecosistema
      ? personas + (ecosistema ? `<section class="territorio"><div class="terr-head"><h2>Ecosistema</h2></div>${ecosistema}</section>` : '')
      : '<p class="empty">No hay resultados.</p>');
}

// ---------- Cambios y glosario ----------

function renderCambios() {
  const C = S.cambios.filter((d) => d.cambios.some((c) => match(c.nombre, c.detalle)));
  $('#list-cambios').innerHTML = C.length
    ? C.map(
        (d) => `<div class="cambio-dia"><h3>${fecha(d.fecha)}</h3>${d.cambios
          .filter((c) => match(c.nombre, c.detalle))
          .map((c) => `<div class="cambio"><span class="tag ${c.accion}">${{ alta: 'Alta', baja: 'Baja', cambio: 'Cambio' }[c.accion]}</span><span><strong>${esc(c.nombre)}</strong> · ${{ parlamento: 'Parlamento', gobierno: 'Gobierno Vasco', gipuzkoa: 'Diputación de Gipuzkoa', bizkaia: 'Diputación de Bizkaia', araba: 'Diputación de Álava' }[c.tipo] || c.tipo} — ${esc(c.detalle)}</span></div>`)
          .join('')}</div>`,
      ).join('')
    : '<p class="empty">Todavía no se han detectado cambios. Aparecerán aquí cuando haya nombramientos, ceses o dimisiones.</p>';
}

function renderGlosario() {
  const gob = ORDEN_NIVEL.map((k) => EXPLICA[k]);
  $('#list-glosario').innerHTML =
    `<h2>Gobierno Vasco</h2>` + gob.map((e) => `<div class="gl"><h3>${esc(e.t)}</h3><p>${esc(e.d)}</p></div>`).join('') +
    `<h2>Parlamento Vasco</h2>` + EXPLICA_PARL.slice(0, 7).map(([, t, d]) => `<div class="gl"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('') +
    Object.entries(ORGANOS).map(([t, d]) => `<div class="gl"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('') +
    `<h2>Diputaciones Forales</h2>` + ORDEN_FORAL.map((k) => EXPLICA_FORAL[k]).map((e) => `<div class="gl"><h3>${esc(e.t)}</h3><p>${esc(e.d)}</p></div>`).join('') +
    `<h2>Ecosistema</h2>` + Object.values(S.data.ecosistema?.helices || {}).map((h) => `<div class="gl"><h3>${esc(h.nombre)}</h3><p>${esc(h.descripcion)}</p></div>`).join('') +
    [
      ['BRTA, CIC y BERC', 'Los centros tecnológicos (Tecnalia, Ikerlan…) hacen investigación aplicada para empresas; los CIC son centros de investigación cooperativa en áreas estratégicas; los BERC son centros de excelencia en ciencia básica. Todos forman parte de la Red Vasca de Ciencia, Tecnología e Innovación.'],
      ['BIC', 'Business Innovation Centre: incubadoras que ayudan a crear y hacer crecer empresas innovadoras (BIC Araba, BIC Gipuzkoa, Beaz en Bizkaia).'],
      ['Agencia de desarrollo comarcal', 'Entidad pública promovida por los ayuntamientos de una comarca, a menudo mediante una mancomunidad o una sociedad pública, para impulsar el empleo, el emprendimiento y el tejido empresarial de su territorio. La mayoría se agrupa en Garapen, la Asociación Vasca de Agencias de Desarrollo.'],
      ['Clúster', 'Asociación de empresas de un mismo sector y sus agentes de apoyo para cooperar en innovación, internacionalización y formación.'],
      ['IIS', 'Instituto de Investigación Sanitaria acreditado por el ISCIII: une hospitales, atención primaria y universidad para investigar en salud (Biogipuzkoa, Biobizkaia, Bioaraba).'],
    ].map(([t, d]) => `<div class="gl"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('');
}

function renderFuentes() {
  const d = S.data;
  const hora = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }) : '');
  // Cada error empieza por el nombre de la fuente («Parlamento: …»); así se asigna a su fila
  const errores = (d.errores || []).map((texto) => ({ texto, fuente: texto.split(':')[0].trim(), usado: false }));
  const erroresDe = (...nombres) => errores.filter((e) => nombres.includes(e.fuente)).map((e) => ((e.usado = true), e.texto));
  const terr = (id) => d.forales?.territorios?.find((t) => t.id === id);
  const caidas = (d.ecosistema?.agentes || []).filter((a) => a.online === false);
  const filas = [
    { nombre: 'Gobierno Vasco', web: d.gobierno?.fuente, cuando: d.gobierno?.actualizado, errores: erroresDe('Gobierno') },
    { nombre: 'Parlamento Vasco', web: d.parlamento?.fuente, cuando: d.parlamento?.actualizado, errores: erroresDe('Parlamento') },
    ...[['gipuzkoa', 'Diputación Foral de Gipuzkoa'], ['bizkaia', 'Diputación Foral de Bizkaia'], ['araba', 'Diputación Foral de Álava']].map(([id, nombre]) => ({
      nombre, web: terr(id)?.fuente, cuando: terr(id)?.actualizado, errores: erroresDe(nombre, 'Diputaciones'),
    })),
    {
      nombre: 'Ecosistema de innovación', web: '', cuando: d.ecosistema?.actualizado, errores: erroresDe('Ecosistema'),
      nota: caidas.length
        ? `<details><summary>${caidas.length} webs de entidades no respondieron a la descarga automática</summary><p>Puede que funcionen en el navegador: algunas bloquean las descargas automáticas o tienen mal el certificado. De ellas se muestran los datos anteriores.</p><p>${caidas.map((a) => esc(a.nombre)).join(' · ')}</p></details>`
        : '',
    },
  ];
  const otros = errores.filter((e) => !e.usado).map((e) => e.texto);
  if (otros.length) filas.push({ nombre: 'Otros avisos', errores: otros });

  $('#list-fuentes').innerHTML =
    `<p class="fuentes-gen">Última ejecución de la actualización: <strong>${esc(hora(d.generado))}</strong></p>` +
    filas
      .map((f) => {
        const ok = !f.errores.length;
        const estado = ok
          ? '<span class="tag alta">Correcto</span>'
          : `<span class="tag baja">Error</span>`;
        const cuando = f.cuando ? `Datos actualizados el <strong>${esc(hora(f.cuando))}</strong>` : f.nombre === 'Otros avisos' ? '' : 'Todavía no hay datos de esta fuente';
        const detalle = ok ? '' : `<p class="fuente-error">En la última actualización no se pudo descargar${f.cuando ? '; se siguen mostrando los datos anteriores' : ''}.</p><p class="fuente-tec">Detalle técnico: ${f.errores.map(esc).join('<br>')}</p>`;
        return `<div class="fuente ${ok ? '' : 'con-error'}">
          <div class="fuente-cab"><h3>${esc(f.nombre)}</h3>${estado}</div>
          ${cuando ? `<p>${cuando}</p>` : ''}
          ${f.web ? `<p class="fuente-web"><a href="${esc(f.web)}" target="_blank" rel="noopener">${esc(f.web.replace(/^https?:\/\//, ''))}</a></p>` : ''}
          ${detalle}${f.nota || ''}
        </div>`;
      })
      .join('');
}

// ---------- Navegación ----------

function render() {
  const fn = { gobierno: renderGobierno, parlamento: renderParlamento, diputaciones: renderDiputaciones, ecosistema: renderEcosistema, tematicas: renderTematicas, cambios: renderCambios, fuentes: renderFuentes, glosario: renderGlosario }[S.tab];
  fn();
}

function setTab(tab) {
  S.tab = tab;
  document.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== `tab-${tab}`));
  history.replaceState(null, '', `#${tab}`);
  render();
}

function abrir(ref) {
  const [tipo, id] = ref.split(':');
  const html =
    tipo === 'gob' ? modalGob(S.data.gobierno.cargos.find((c) => c.id === id))
    : tipo === 'parl' ? modalParl(S.data.parlamento.parlamentarios.find((p) => p.id === id))
    : tipo === 'foral' ? modalForal(foralPorId(id))
    : modalEco(S.data.ecosistema.agentes.find((a) => a.id === id));
  $('#modal-body').innerHTML = html;
  const m = $('#modal');
  if (!m.open) m.showModal();
  $('#modal-body').scrollTop = 0;
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-open],[data-tab],[data-gnivel],[data-pgrupo],[data-ehelice],[data-ereset],[data-dterr],[data-dnivel],[data-tema],[data-tpart]');
  if (!t) return;
  e.preventDefault();
  if (t.dataset.open) return abrir(t.dataset.open);
  if (t.dataset.tab) return setTab(t.dataset.tab);
  if (t.dataset.gnivel) { S.gNivel = t.dataset.gnivel; if (S.gNivel === 'consejo') S.gDep = ''; }
  if (t.dataset.pgrupo !== undefined) S.pGrupo = S.pGrupo === t.dataset.pgrupo ? '' : t.dataset.pgrupo;
  if (t.dataset.ehelice) { S.eHelice = S.eHelice === t.dataset.ehelice ? '' : t.dataset.ehelice; S.eTipo = ''; S.eTerr = ''; }
  if (t.dataset.ereset !== undefined) { S.eHelice = S.eTerr = S.eTipo = ''; }
  if (t.dataset.dterr !== undefined) S.dTerr = t.dataset.dterr;
  if (t.dataset.dnivel !== undefined) S.dNivel = t.dataset.dnivel;
  if (t.dataset.tema) S.tema = t.dataset.tema;
  if (t.dataset.tpart !== undefined) S.tPart = t.dataset.tpart;
  render();
});
document.addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'gdep') { S.gDep = e.target.value; if (S.gDep && S.gNivel === 'consejo') S.gNivel = 'todos'; }
  if (id === 'pcom') S.pComision = e.target.value;
  if (id === 'eterr') S.eTerr = e.target.value;
  if (id === 'etipo') S.eTipo = e.target.value;
  render();
});
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') e.target.close(); });
let tq;
$('#q').addEventListener('input', (e) => {
  clearTimeout(tq);
  tq = setTimeout(() => {
    S.q = e.target.value.trim();
    if (S.q && S.tab === 'gobierno' && S.gNivel === 'consejo') S.gNivel = 'todos';
    render();
  }, 150);
});

// ---------- Botón «Actualizar datos» ----------

async function actualizarDatos() {
  const boton = $('#actualizar');
  const avisar = (texto) => { $('#alert').hidden = false; $('#alert').textContent = texto; };

  boton.disabled = true;
  boton.textContent = 'Actualizando…';
  avisar('Descargando los datos oficiales. Tarda unos 2 minutos; no cierres esta página.');
  try {
    const r = await fetch('api/actualizar', { method: 'POST' });
    if (r.status === 404 || r.status === 405) throw new Error('el botón solo funciona con la web abierta mediante «npm run serve»');
    const res = await r.json();
    if (!res.ok) throw new Error(res.error);
    location.reload();
  } catch (err) {
    avisar(`No se pudo actualizar: ${err.message}. Se siguen mostrando los datos anteriores.`);
    boton.disabled = false;
    boton.textContent = 'Actualizar datos';
  }
}
$('#actualizar').addEventListener('click', actualizarDatos);
// Solo tiene sentido con la web abierta en local: la publicada se actualiza sola cada noche
$('#actualizar').hidden = !['localhost', '127.0.0.1'].includes(location.hostname);

(async function init() {
  try {
    const [d, c, t] = await Promise.all([
      fetch('data.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('cambios.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('tematicas.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    S.data = d;
    S.cambios = c;
    S.tematicas = t;
  } catch (err) {
    $('#alert').hidden = false;
    $('#alert').textContent = 'No se pudieron cargar los datos (data.json). Si abres el archivo directamente, usa un servidor local: npm run serve';
    return;
  }
  $('#updated').textContent = `última actualización: ${new Date(S.data.generado).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}`;
  $('#c-gobierno').textContent = S.data.gobierno?.cargos.length || '';
  $('#c-parlamento').textContent = S.data.parlamento?.parlamentarios.length || '';
  $('#c-diputaciones').textContent = territorios().reduce((n, t) => n + t.cargos.length, 0) || '';
  $('#c-ecosistema').textContent = S.data.ecosistema?.agentes.length || '';
  $('#c-tematicas').textContent = S.tematicas?.tematicas?.length || '';
  // Los fallos de descarga se explican en la pestaña «Última actualización»; aquí solo una marca discreta
  $('#c-fuentes').textContent = S.data.errores?.length ? '!' : '';
  $('#c-fuentes').title = S.data.errores?.length ? 'En la última actualización falló alguna fuente' : '';
  const h = location.hash.slice(1);
  setTab(['gobierno', 'parlamento', 'diputaciones', 'ecosistema', 'tematicas', 'cambios', 'fuentes', 'glosario'].includes(h) ? h : 'gobierno');
})();
