/* Familia Rojiblanca 26/27 — interfaz.
   El servidor es quien manda: aquí solo se pinta. El PIN y la hora de cierre se
   comprueban en la base de datos, así que tocar esta página no sirve de nada. */

const S = {
  token:      localStorage.getItem("fr_token") || null,
  adminToken: localStorage.getItem("fr_admin") || null,
  estado:     null,   // api_estado con la sesión del participante
  estadoAdm:  null,   // api_estado con la sesión de admin (incluye jugadores dados de baja)
  skew:       0,      // diferencia entre el reloj del servidor y el del móvil
  sesion:     null,
  picks:      [],     // mi once en edición
  guardado:   [],     // mi once tal y como está en la base de datos
  jornadaMia: null,
  jornadaVer: null,
  adminOnce:  [],
  adminConv:  [],     // convocatoria en edición (admin)
  adminJornada: null, // jornada del once oficial (se marca después del partido)
  convJornada:  null, // jornada de la convocatoria (se carga antes)
  onceCargado: null,
  convCargada: null,
  adminEditando: null,
  lecturaFoto: null   // lo que ha salido de leer la foto de la convocatoria
};

const POSICIONES = [["POR", "Porteros"], ["DEF", "Defensas"], ["MED", "Centrocampistas"], ["DEL", "Delanteros"]];

/* ------------------------------------------------------------- utilidades --- */

const $  = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const ahora = () => new Date(Date.now() + S.skew);

function fmt(iso, opciones) {
  return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", ...opciones }).format(new Date(iso));
}
const fechaLarga = iso => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
const hora       = iso => fmt(iso, { hour: "2-digit", minute: "2-digit" });

function jugadores(admin = false) {
  return (admin && S.estadoAdm ? S.estadoAdm : S.estado)?.jugadores || [];
}
function jug(id) {
  return jugadores().find(j => j.id === id) || jugadores(true).find(j => j.id === id);
}
function nombreJug(id) {
  const j = jug(id);
  return j ? j.nombre : `#${id}`;
}
const rotulo = j => `${j.en_casa ? "Sevilla" : esc(j.rival)} – ${j.en_casa ? esc(j.rival) : "Sevilla"}`;

// LaLiga fija la hora pocas semanas antes; hasta entonces la que se enseña es
// tentativa. Solo se avisa cuando el servidor lo dice expresamente.
const sinHora = j => j.hora_confirmada === false;
const cuandoHTML = j => `${fechaLarga(j.kickoff)} a las ${hora(j.kickoff)}`
  + (sinHora(j) ? ` <span class="tentativa">hora sin confirmar</span>` : "");

function textoCuenta(cierre) {
  let ms = new Date(cierre).getTime() - ahora().getTime();
  if (ms <= 0) return { texto: "Plazo cerrado", clase: "cerrada" };
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24,
        m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  const partes = d ? [`${d} d`, `${h} h`, `${m} min`]
                   : h ? [`${h} h`, `${m} min`, `${String(s).padStart(2, "0")} s`]
                       : [`${m} min`, `${String(s).padStart(2, "0")} s`];
  return { texto: `Cierra en ${partes.join(" ")}`, clase: ms < 36e5 ? "urgente" : "" };
}

// <input type="datetime-local"> quiere la hora del reloj del propio móvil
function paraInputFecha(iso) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function aviso(texto, tipo = "") {
  return texto ? `<div class="aviso ${tipo}">${esc(texto)}</div>` : "";
}

function puestos(filas, campo = "puntos") {
  // Empates con el mismo puesto: 1, 1, 3…
  let puesto = 0, previo = null, i = 0;
  return filas.map(f => {
    i++;
    if (f[campo] !== previo) { puesto = i; previo = f[campo]; }
    return { ...f, puesto };
  });
}

/* ------------------------------------------------------------------ campo --- */

function fichaHTML(j, fuera = false) {
  return `<div class="ficha${fuera ? " fuera" : ""}"${fuera ? ' title="No está en la convocatoria: no puede acertar"' : ""}>
            <div class="dorsal">${j.dorsal ?? "·"}</div><span class="nom">${esc(j.nombre)}</span></div>`;
}

// 'fuera' son los que se han quedado sin convocar: se dibujan igual, pero
// tachados, porque siguen en la alineación aunque no puedan acertar nada.
function campoHTML(ids, fuera = []) {
  if (!ids || !ids.length) {
    return `<div class="campo"><div class="campo-vacio">Ve marcando jugadores y aparecerán aquí sobre el campo.</div></div>`;
  }
  const grupos = { POR: [], DEF: [], MED: [], DEL: [] };
  ids.forEach(id => { const j = jug(id); if (j) grupos[j.posicion].push(j); });
  const linea = arr => `<div class="linea">${arr.map(j => fichaHTML(j, fuera.includes(j.id))).join("")}</div>`;
  return `<div class="campo">${linea(grupos.DEL)}${linea(grupos.MED)}${linea(grupos.DEF)}${linea(grupos.POR)}</div>`;
}

/* --------------------------------------------------------------- selector --- */

/* El selector de once. Con convocatoria, los que no están en ella salen
   apagados: se siguen viendo (así se sabe quién se ha quedado fuera) pero no
   se pueden elegir. Si alguien ya los tenía puestos de antes, sí puede
   quitarlos — lo contrario sería dejarle atrapado con un once inválido. */
function selectorHTML(seleccion, { bloqueado = false, admin = false, convocatoria = null } = {}) {
  const lista = jugadores(admin).filter(j => j.activo !== false);
  const lleno = seleccion.length >= 11;
  return POSICIONES.map(([cod, titulo]) => {
    const grupo = lista.filter(j => j.posicion === cod);
    if (!grupo.length) return "";
    return `<h3>${titulo}</h3><div class="jugadores">` + grupo.map(j => {
      const puesto = seleccion.includes(j.id);
      const fuera = Boolean(convocatoria) && !convocatoria.includes(j.id);
      const off = bloqueado || (!puesto && (lleno || fuera));
      return `<button type="button" class="jug${fuera ? " fuera" : ""}" data-elegir="${j.id}"
                aria-pressed="${puesto}" ${off ? "disabled" : ""}
                ${fuera ? 'title="No está en la convocatoria"' : ""}>
                <span class="n">${j.dorsal ?? "·"}</span>${esc(j.nombre)}</button>`;
    }).join("") + `</div>`;
  }).join("");
}

/* El mismo selector, pero para marcar la convocatoria: sin tope de 11 y sin
   agrupar por posición, que aquí lo cómodo es ir siguiendo la foto. */
function selectorConvHTML(seleccion) {
  const lista = jugadores(true).filter(j => j.activo !== false);
  return `<div class="jugadores">` + lista.map(j =>
    `<button type="button" class="jug" data-convocar="${j.id}" aria-pressed="${seleccion.includes(j.id)}">
       <span class="n">${j.dorsal ?? "·"}</span>${esc(j.nombre)}</button>`).join("") + `</div>`;
}

/* ------------------------------------------------------------ carga datos --- */

async function cargarEstado() {
  const e = await API.rpc("api_estado", { p_token: S.token });
  S.estado = e;
  S.skew = new Date(e.ahora).getTime() - Date.now();
  S.sesion = e.sesion && e.sesion.participante_id ? e.sesion : null;
  if (!S.sesion && S.token) { S.token = null; localStorage.removeItem("fr_token"); }
}

// El próximo partido, que es el único en el que se puede alinear. Lo decide el
// servidor (es_proxima); el resto es por si la respuesta viniera sin esa marca.
function jornadaActiva() {
  const js = S.estado?.jornadas || [];
  return js.find(j => j.es_proxima)
      || js.find(j => ahora() < new Date(j.cierre))
      || js[js.length - 1] || null;
}

// En la pestaña Jornada solo se listan las ya cerradas y el próximo partido: las
// jornadas futuras no se ofrecen, para no confundir a nadie sobre a cuál juega.
function jornadasVisibles() {
  const js = S.estado?.jornadas || [];
  const prox = jornadaActiva();
  return js.filter(j => j.cerrada || (prox && j.id === prox.id));
}

/* ------------------------------------------------------- vista alineación --- */

async function pintarAlineacion() {
  const v = $("#v-alineacion");

  if (!API.configurado()) {
    v.innerHTML = `<div class="tarjeta"><h2>Falta configurar la web</h2>
      <p>Abre <code>app/config.js</code> y pega la URL y la clave <code>anon</code> de tu proyecto de Supabase.
      Los pasos están en el <code>README.md</code>.</p></div>`;
    return;
  }

  if (!S.sesion) { v.innerHTML = loginHTML(); return; }

  const j = jornadaActiva();
  if (!j) {
    v.innerHTML = `<div class="tarjeta"><h2>Sin jornadas</h2>
      <p>Todavía no hay ninguna jornada creada. El administrador puede añadirla desde la pestaña Admin.</p></div>`;
    return;
  }

  if (S.jornadaMia !== j.id) {
    v.innerHTML = `<p class="cargando">Cargando…</p>`;
    const d = await API.rpc("api_jornada", { p_jornada: j.id, p_token: S.token });
    const mia = (d.filas || []).find(f => f.participante_id === S.sesion.participante_id);
    S.guardado = mia?.picks || [];
    S.picks = [...S.guardado];
    S.jornadaMia = j.id;
  }

  const cerrada = ahora() >= new Date(j.cierre);
  const cambiado = JSON.stringify([...S.picks].sort()) !== JSON.stringify([...S.guardado].sort());

  // La convocatoria puede llegar después de que alguien haya enviado su once.
  // A nadie se le borra nada: se le avisa de a quién tiene que cambiar.
  const conv = j.convocatoria && j.convocatoria.length ? j.convocatoria : null;
  const sobran = conv ? S.picks.filter(id => !conv.includes(id)) : [];

  v.innerHTML = `
    <div class="tarjeta">
      <p class="cuando">Próximo partido</p>
      <p class="partido">Jornada ${j.numero} · ${rotulo(j)}</p>
      <p class="cuando">${cuandoHTML(j)}</p>
      <span class="cuenta-atras" data-cierre="${j.cierre}"></span>
      ${sinHora(j) ? aviso("LaLiga todavía no ha fijado la hora de este partido: la que ves es orientativa, y con ella el cierre. Cuando se confirme, el administrador la corrige y el plazo se ajusta solo.") : ""}
      ${j.prorrogada ? aviso("El administrador ha prorrogado el plazo.") : ""}
      ${conv ? aviso(`Ya se conoce la convocatoria: ${conv.length} jugadores. Solo puedes alinear a los convocados.`) : ""}
      ${cerrada
        ? aviso("El plazo se cerró. Puedes ver todas las alineaciones en la pestaña Jornada.")
        : `<p class="cuando" style="margin-top:10px">El plazo cierra una hora antes del partido, a las ${hora(j.cierre)}. Puedes cambiar tu once las veces que quieras hasta entonces.</p>
           <p class="cuando" style="margin-top:6px">Solo se juega al próximo partido: las demás jornadas se van abriendo una a una, según se disputan.</p>`}
    </div>

    <div class="tarjeta">
      <h2>Hola, ${esc(S.sesion.nombre)}</h2>
      <p>${S.guardado.length ? "Tu alineación está guardada. La última versión es la que cuenta." : "Todavía no has enviado tu alineación."}</p>
      ${sobran.length && !cerrada
        ? aviso(`La convocatoria ha dejado fuera a ${sobran.map(id => nombreJug(id)).join(", ")}. `
              + `Tu alineación cuenta igual, pero ${sobran.length === 1 ? "ese jugador no puede acertar" : "esos jugadores no pueden acertar"}: `
              + `te interesa cambiar${sobran.length === 1 ? "lo" : "los"} antes del cierre. `
              + `Para poder guardar cualquier cambio tendrás que sustituir${sobran.length === 1 ? "lo" : "los"} primero.`)
        : ""}
      ${campoHTML(S.picks, sobran)}
      <p style="margin:14px 0 0"><span class="contador ${S.picks.length === 11 ? "completo" : ""}">${S.picks.length}/11</span> jugadores elegidos</p>
      ${conv ? `<p class="cuando">En gris, los que no están en la convocatoria.</p>` : ""}
      <div id="selector">${selectorHTML(S.picks, { bloqueado: cerrada, convocatoria: conv })}</div>
      <div id="mensaje-guardar"></div>
      ${cerrada ? "" : `<div class="barra-guardar">
        <button class="principal" id="btn-guardar" ${S.picks.length === 11 && cambiado && !sobran.length ? "" : "disabled"}>
          ${S.guardado.length ? "Actualizar mi alineación" : "Enviar mi alineación"}</button>
      </div>`}
    </div>

    <p class="pie"><button class="enlace" id="btn-salir">Salir de la sesión de ${esc(S.sesion.nombre)}</button></p>`;
}

function loginHTML() {
  const ps = S.estado?.participantes || [];
  return `<div class="tarjeta">
    <h2>Entra con tu nombre</h2>
    <p>Elige quién eres y escribe tu PIN de 4 dígitos. La primera vez que entras, el PIN que escribas queda guardado como el tuyo.</p>
    <label for="sel-part">Participante</label>
    <select id="sel-part">
      <option value="">— elige tu nombre —</option>
      ${ps.map(p => `<option value="${p.id}">${esc(p.nombre)}${p.tiene_pin ? "" : "  (primera vez)"}</option>`).join("")}
    </select>
    <label for="inp-pin">PIN de 4 dígitos</label>
    <input id="inp-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••">
    <div id="mensaje-login"></div>
    <p style="margin-top:14px"><button class="principal" id="btn-entrar" style="width:100%">Entrar</button></p>
  </div>`;
}

async function entrar() {
  const caja = $("#mensaje-login");
  const id = Number($("#sel-part").value);
  const pin = $("#inp-pin").value.trim();
  if (!id) { caja.innerHTML = aviso("Elige tu nombre en la lista.", "error"); return; }
  if (!/^\d{4}$/.test(pin)) { caja.innerHTML = aviso("El PIN son 4 dígitos.", "error"); return; }

  const r = await API.rpc("api_login", { p_participante: id, p_pin: pin });
  if (!r.ok) { caja.innerHTML = aviso(r.error, "error"); return; }

  S.token = r.token;
  localStorage.setItem("fr_token", r.token);
  S.jornadaMia = null;
  await cargarEstado();
  await pintarAlineacion();
}

async function guardarAlineacion() {
  const caja = $("#mensaje-guardar");
  const btn = $("#btn-guardar");
  btn.disabled = true;
  const r = await API.rpc("api_guardar", {
    p_token: S.token, p_jornada: S.jornadaMia, p_picks: S.picks
  });
  if (!r.ok) {
    caja.innerHTML = aviso(r.error, "error");
    btn.disabled = false;
    if (/cerrado/i.test(r.error)) { await cargarEstado(); S.jornadaMia = null; await pintarAlineacion(); }
    return;
  }
  S.guardado = [...S.picks];
  caja.innerHTML = aviso(`Alineación guardada a las ${hora(r.guardada_en)}. Puedes cambiarla hasta el cierre.`, "ok");
}

/* ---------------------------------------------------------- vista jornada --- */

async function pintarJornada() {
  const v = $("#v-jornada");
  const js = jornadasVisibles();
  if (!js.length) { v.innerHTML = `<div class="tarjeta"><p>Todavía no hay jornadas.</p></div>`; return; }

  if (!S.jornadaVer || !js.some(j => j.id === S.jornadaVer)) {
    const publicadas = js.filter(j => j.publicada);
    S.jornadaVer = (publicadas[publicadas.length - 1] || jornadaActiva() || js[0]).id;
  }

  const selector = `<select id="sel-jornada">${js.map(j =>
      `<option value="${j.id}" ${j.id === S.jornadaVer ? "selected" : ""}>Jornada ${j.numero} · ${rotulo(j)}</option>`
    ).join("")}</select>`;

  v.innerHTML = `<div class="tarjeta"><label for="sel-jornada">Jornada</label>${selector}</div><p class="cargando">Cargando…</p>`;

  const d = await API.rpc("api_jornada", { p_jornada: S.jornadaVer, p_token: S.token });
  if (!d.ok) { v.innerHTML = `<div class="tarjeta">${aviso(d.error, "error")}</div>`; return; }

  const j = d.jornada;
  const filas = d.filas || [];
  const yo = S.sesion?.participante_id;
  let cuerpo = "";

  if (!j.cerrada) {
    const enviadas = filas.filter(f => f.participo);
    cuerpo = `<div class="tarjeta">
      <h2>Alineaciones ocultas</h2>
      <p>Se revelan todas a la vez al cerrarse el plazo, a las ${hora(j.cierre)}.</p>
      <span class="cuenta-atras" data-cierre="${j.cierre}"></span>
      ${sinHora(j) ? aviso("La hora de este partido aún no es oficial, así que la del cierre también puede moverse.") : ""}
      <h3>Quién ha enviado ya (${enviadas.length}/${filas.length})</h3>
      <div class="tabla-scroll"><table><tbody>
        ${filas.map(f => `<tr class="${f.participante_id === yo ? "yo" : ""}">
          <td>${esc(f.nombre)}</td>
          <td class="num">${f.participo ? "✓ enviada" : "<span class='no-participo'>pendiente</span>"}</td></tr>`).join("")}
      </tbody></table></div>
      ${yo && filas.find(f => f.participante_id === yo)?.picks
        ? `<h3>Tu once</h3><ul class="once-lista">${filas.find(f => f.participante_id === yo).picks.map(id => `<li>${esc(nombreJug(id))}</li>`).join("")}</ul>`
        : ""}
    </div>`;
  } else if (!j.publicada) {
    cuerpo = `<div class="tarjeta">
        <h2>Pendiente del once oficial</h2>
        <p>El plazo se cerró a las ${hora(j.cierre)}. En cuanto el administrador marque el once inicial del Sevilla aparecerán los aciertos y los puntos.</p>
      </div>` + onces(filas, null, yo);
  } else {
    const conPuntos = puestos(filas.slice().sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre)));
    cuerpo = `<div class="tarjeta">
      <h2>Clasificación de la jornada ${j.numero}</h2>
      <p>${rotulo(j)} · ${fechaLarga(j.kickoff)}</p>
      <div class="tabla-scroll"><table>
        <thead><tr><th></th><th>Participante</th><th class="num">Aciertos</th><th class="num">Puntos</th></tr></thead>
        <tbody>${conPuntos.map(f => `<tr class="${f.participante_id === yo ? "yo" : ""}">
          <td class="puesto">${f.puesto}</td>
          <td>${esc(f.nombre)}${f.participo ? "" : ` <span class="no-participo">— no participó</span>`}</td>
          <td class="num">${f.participo ? `${f.aciertos}/11` : "—"}</td>
          <td class="num puntos-dia">${f.puntos}</td></tr>`).join("")}</tbody>
      </table></div>
      <h3>Once inicial del Sevilla</h3>
      <ul class="once-lista">${j.once_oficial.map(id => `<li class="acierto">${esc(nombreJug(id))}</li>`).join("")}</ul>
    </div>` + onces(conPuntos, j.once_oficial, yo);
  }

  v.innerHTML = `<div class="tarjeta"><label for="sel-jornada">Jornada</label>${selector}</div>` + cuerpo;
}

function onces(filas, oficial, yo) {
  const conAlineacion = filas.filter(f => f.picks);
  if (!conAlineacion.length) return "";
  return `<div class="tarjeta"><h2>Las alineaciones</h2>
    ${conAlineacion.map(f => `<div class="bloque-jugador">
      <strong>${esc(f.nombre)}</strong>${f.participante_id === yo ? " (tú)" : ""}
      ${oficial ? ` — <span class="puntos-dia">${f.puntos} puntos</span> con ${f.aciertos} aciertos` : ""}
      <ul class="once-lista">${f.picks.map(id =>
        `<li class="${oficial ? (oficial.includes(id) ? "acierto" : "fallo") : ""}">${esc(nombreJug(id))}</li>`).join("")}</ul>
    </div>`).join("")}
    ${filas.some(f => !f.participo) ? `<p class="no-participo">No participaron: ${filas.filter(f => !f.participo).map(f => esc(f.nombre)).join(", ")}.</p>` : ""}
  </div>`;
}

/* ---------------------------------------------------------- vista general --- */

async function pintarGeneral() {
  const v = $("#v-general");
  v.innerHTML = `<p class="cargando">Cargando…</p>`;
  const d = await API.rpc("api_general", {});
  const tabla = d.tabla || [];
  const detalle = d.detalle || [];
  const yo = S.sesion?.participante_id;
  const numeros = [...new Set(detalle.map(x => x.numero))].sort((a, b) => a - b);

  const matriz = numeros.length ? `<div class="tarjeta">
    <h2>Jornada a jornada</h2>
    <div class="tabla-scroll"><table class="matriz">
      <thead><tr><th>Participante</th>${numeros.map(n => `<th class="num">J${n}</th>`).join("")}</tr></thead>
      <tbody>${tabla.map(t => `<tr class="${t.participante_id === yo ? "yo" : ""}">
        <td>${esc(t.nombre)}</td>
        ${numeros.map(n => {
          const c = detalle.find(x => x.participante_id === t.participante_id && x.numero === n);
          if (!c) return `<td>—</td>`;
          if (!c.participo) return `<td class="cero" title="No participó">·</td>`;
          return `<td class="${c.puntos ? "" : "cero"}" title="${c.aciertos} aciertos">${c.puntos}</td>`;
        }).join("")}</tr>`).join("")}</tbody>
    </table></div>
    <p class="pie" style="text-align:left">Cada casilla es la puntuación de esa jornada · <b>·</b> = no participó</p>
  </div>` : "";

  v.innerHTML = `<div class="tarjeta">
      <h2>Clasificación general</h2>
      <p>Temporada 2026/27 · ${numeros.length} de 38 jornadas disputadas</p>
      <div class="tabla-scroll"><table>
        <thead><tr><th></th><th>Participante</th><th class="num">Puntos</th><th class="num">Jornadas</th><th class="num">Aciertos</th><th class="num">Mejor</th></tr></thead>
        <tbody>${tabla.map(t => `<tr class="${t.participante_id === yo ? "yo" : ""}">
          <td class="puesto">${t.puesto}</td>
          <td>${esc(t.nombre)}</td>
          <td class="num puntos-dia">${t.puntos}</td>
          <td class="num">${t.jugadas}</td>
          <td class="num">${t.aciertos}</td>
          <td class="num">${t.mejor}</td></tr>`).join("")}</tbody>
      </table></div>
      ${numeros.length ? "" : `<p class="cuando">Aún no hay ninguna jornada puntuada.</p>`}
    </div>${matriz}`;
}

/* ------------------------------------------------------------ vista admin --- */

async function pintarAdmin() {
  const v = $("#v-admin");

  if (!S.adminToken) { v.innerHTML = adminLoginHTML(); return; }

  v.innerHTML = `<p class="cargando">Cargando…</p>`;
  S.estadoAdm = await API.rpc("api_estado", { p_token: S.adminToken });
  if (!S.estadoAdm.sesion || !S.estadoAdm.sesion.es_admin) {
    S.adminToken = null; localStorage.removeItem("fr_admin");
    v.innerHTML = adminLoginHTML("La sesión de administrador ha caducado.");
    return;
  }

  const js = S.estadoAdm.jornadas || [];
  if (!S.adminJornada || !js.some(j => j.id === S.adminJornada)) {
    S.adminJornada = (js.filter(j => new Date(j.cierre) <= ahora()).pop() || js[0])?.id || null;
    S.adminOnce = [];
  }
  // el once se marca al acabar el partido, así que arranca en la última jornada
  // cerrada; la convocatoria se carga antes, así que arranca en la próxima
  if (!S.convJornada || !js.some(j => j.id === S.convJornada)) {
    S.convJornada = (js.find(j => j.es_proxima) || js[js.length - 1])?.id || null;
    S.adminConv = [];
  }

  const ed = S.adminEditando;   // jornada en edición (objeto) o null = nueva
  const kickoffLocal = ed ? paraInputFecha(ed.kickoff) : "";
  const prox = js.find(j => j.es_proxima);
  // las convocatorias tal y como están guardadas, que son las que mandan
  const convocatoriaDe = id => {
    const j = js.find(x => x.id === id);
    return j?.convocatoria?.length ? j.convocatoria : null;
  };
  const convGuardada = convocatoriaDe(S.convJornada);    // la de la tarjeta Convocatoria
  const convDelOnce  = convocatoriaDe(S.adminJornada);   // la de la jornada del once

  v.innerHTML = `
  <div class="tarjeta">
    <h2>Jornadas</h2>
    <p>El cierre se calcula solo: una hora antes del inicio.</p>
    ${prox && sinHora(prox) ? aviso(`El próximo partido es la jornada ${prox.numero} y su hora todavía es orientativa. En cuanto LaLiga publique la definitiva, pulsa Editar en esa fila, corrige el día y la hora y marca «hora oficial»: el cierre se recalcula solo.`) : ""}
    <div class="tabla-scroll"><table>
      <thead><tr><th>J</th><th>Partido</th><th>Cierre</th><th>Estado</th><th></th></tr></thead>
      <tbody>${js.map(j => `<tr>
        <td>${j.numero}</td>
        <td>${rotulo(j)}<br><span class="cuando">${cuandoHTML(j)}</span></td>
        <td>${hora(j.cierre)}${j.prorrogada ? " <span class='cuando'>(prorrogado)</span>" : ""}</td>
        <td>${j.publicada ? "puntuada" : j.cerrada ? "cerrada" : "abierta"}</td>
        <td>
          <button class="menor" data-editar-jornada="${j.id}">Editar</button>
          ${j.cerrada || !j.publicada ? `<button class="menor" data-prorrogar="${j.id}" data-min="10">+10 min</button>
          <button class="menor" data-prorrogar="${j.id}" data-min="30">+30 min</button>` : ""}
        </td></tr>`).join("")}</tbody>
    </table></div>

    <h3>${ed ? `Editar jornada ${ed.numero}` : "Añadir jornada"}</h3>
    <div class="fila">
      <div><label for="adm-num">Jornada</label><input id="adm-num" type="number" min="1" max="38" value="${ed ? ed.numero : ""}"></div>
      <div style="flex:2 1 200px"><label for="adm-rival">Rival</label><input id="adm-rival" value="${ed ? esc(ed.rival) : ""}"></div>
      <div><label for="adm-casa">Campo</label><select id="adm-casa">
        <option value="1" ${!ed || ed.en_casa ? "selected" : ""}>En el Pizjuán</option>
        <option value="0" ${ed && !ed.en_casa ? "selected" : ""}>Fuera</option></select></div>
    </div>
    <div class="fila">
      <div style="flex:2 1 220px"><label for="adm-kick">Día y hora del partido</label><input id="adm-kick" type="datetime-local" value="${kickoffLocal}"></div>
      <div><label for="adm-antes">Cierre (min antes)</label><input id="adm-antes" type="number" min="0" max="600" value="60"></div>
      <div style="flex:1 1 200px"><label for="adm-confirmada">¿Hora oficial?</label>
        <p style="margin:0"><input id="adm-confirmada" type="checkbox" ${ed && ed.hora_confirmada ? "checked" : ""}>
        <span class="cuando">LaLiga ya la ha confirmado</span></p>
        <p class="cuando" style="margin:4px 0 0">Si lo dejas sin marcar, la web avisa de que es orientativa.</p></div>
    </div>
    <div id="msg-jornada"></div>
    <p><button class="principal" id="btn-jornada">${ed ? "Guardar cambios" : "Crear jornada"}</button>
       ${ed ? `<button id="btn-cancelar-jornada">Cancelar</button>` : ""}</p>
  </div>

  <div class="tarjeta">
    <h2>Convocatoria</h2>
    <p>Sube la foto que publica el Sevilla y se leen solos los convocados. Mientras haya convocatoria puesta, nadie podrá alinear a quien no esté en ella.</p>
    <label for="adm-sel-conv">Jornada</label>
    <select id="adm-sel-conv">${js.map(j =>
      `<option value="${j.id}" ${j.id === S.convJornada ? "selected" : ""}>Jornada ${j.numero} · ${rotulo(j)}${j.convocatoria ? " ✓" : ""}</option>`).join("")}</select>

    <p class="cuando" style="margin-top:10px">${convGuardada
      ? `Convocatoria puesta: ${convGuardada.length} jugadores.`
      : "Sin convocatoria: por ahora se puede alinear a toda la plantilla."}</p>

    <h3>Leer la foto</h3>
    <p class="cuando">La foto no se sube a ningún sitio: se lee aquí mismo, en tu móvil. La primera vez tarda más porque se descarga el lector de texto.</p>
    <input type="file" id="adm-foto" accept="image/*">
    <p style="margin-top:10px"><button id="btn-analizar">Analizar la foto</button></p>
    <div id="msg-conv"></div>
    ${lecturaHTML()}

    <h3>Convocados <span class="contador" id="conv-cuenta">${S.adminConv.length}</span></h3>
    <p class="cuando">Repasa la lista y corrige lo que haga falta antes de guardar: un toque quita o pone a cualquiera.</p>
    <div id="selector-conv">${selectorConvHTML(S.adminConv)}</div>
    <p style="margin-top:14px">
      <button class="principal" id="btn-conv" ${S.adminConv.length >= 11 ? "" : "disabled"}>Guardar convocatoria</button>
      ${convGuardada ? `<button id="btn-conv-quitar">Quitar convocatoria</button>` : ""}</p>
  </div>

  <div class="tarjeta">
    <h2>Once inicial del Sevilla</h2>
    <p>Marca los 11 titulares. Al guardarlo se calculan solas todas las puntuaciones.</p>
    <label for="adm-sel-jornada">Jornada</label>
    <select id="adm-sel-jornada">${js.map(j =>
      `<option value="${j.id}" ${j.id === S.adminJornada ? "selected" : ""}>Jornada ${j.numero} · ${rotulo(j)}${j.publicada ? " ✓" : ""}</option>`).join("")}</select>
    ${campoHTML(S.adminOnce)}
    <p style="margin:14px 0 0"><span class="contador ${S.adminOnce.length === 11 ? "completo" : ""}">${S.adminOnce.length}/11</span> titulares</p>
    ${convDelOnce ? `<p class="cuando">En gris, los que no estaban convocados. Si jugó alguno, corrige antes la convocatoria.</p>` : ""}
    <div id="selector-admin">${selectorHTML(S.adminOnce, { admin: true, convocatoria: convDelOnce })}</div>
    <div id="msg-once"></div>
    <p><button class="principal" id="btn-once" ${S.adminOnce.length === 11 ? "" : "disabled"}>Guardar once oficial</button>
       <button id="btn-despublicar">Quitar</button></p>
  </div>

  <div class="tarjeta">
    <h2>Participantes</h2>
    <div class="tabla-scroll"><table>
      <thead><tr><th>Nombre</th><th>PIN</th><th></th></tr></thead>
      <tbody>${(S.estadoAdm.participantes || []).map(p => `<tr>
        <td>${esc(p.nombre)}</td>
        <td>${p.tiene_pin ? "puesto" : "<span class='no-participo'>sin poner</span>"}</td>
        <td>${p.tiene_pin ? `<button class="menor" data-reset-pin="${p.id}" data-nombre="${esc(p.nombre)}">Reiniciar PIN</button>` : ""}</td>
      </tr>`).join("")}</tbody>
    </table></div>
    <div class="fila" style="margin-top:12px">
      <div><label for="adm-part">Añadir participante</label><input id="adm-part" placeholder="Nombre"></div>
      <div style="flex:0"><button id="btn-part">Añadir</button></div>
    </div>
    <div id="msg-part"></div>
  </div>

  <div class="tarjeta">
    <h2>Plantilla</h2>
    <p>Altas, bajas y cambios de dorsal. La posición solo sirve para dibujar el campo.</p>
    <div class="tabla-scroll"><table>
      <thead><tr><th class="num">Dorsal</th><th>Nombre</th><th>Posición</th><th>Activo</th><th></th></tr></thead>
      <tbody>${(S.estadoAdm.jugadores || []).map(g => `<tr data-jugador="${g.id}">
        <td><input class="j-dorsal" type="number" value="${g.dorsal ?? ""}" style="width:70px"></td>
        <td><input class="j-nombre" value="${esc(g.nombre)}"></td>
        <td><select class="j-pos">${POSICIONES.map(([c, t]) =>
              `<option value="${c}" ${g.posicion === c ? "selected" : ""}>${t.slice(0, -1)}</option>`).join("")}</select></td>
        <td><input class="j-activo" type="checkbox" ${g.activo !== false ? "checked" : ""}></td>
        <td><button class="menor" data-guardar-jugador="${g.id}">Guardar</button></td>
      </tr>`).join("")}</tbody>
    </table></div>
    <div class="fila" style="margin-top:12px">
      <div style="flex:0 0 90px"><label for="adm-jd">Dorsal</label><input id="adm-jd" type="number"></div>
      <div><label for="adm-jn">Nuevo jugador</label><input id="adm-jn" placeholder="Nombre"></div>
      <div style="flex:0 0 150px"><label for="adm-jp">Posición</label><select id="adm-jp">${POSICIONES.map(([c, t]) => `<option value="${c}">${t.slice(0, -1)}</option>`).join("")}</select></div>
      <div style="flex:0"><button id="btn-jugador">Añadir</button></div>
    </div>
    <div id="msg-jug"></div>
  </div>

  <p class="pie"><button class="enlace" id="btn-salir-admin">Salir del modo administrador</button></p>`;

  // uno detrás de otro, no a la vez: cada carga vuelve a pintar
  if (S.onceCargado !== S.adminJornada) cargarOnceAdmin();
  else if (S.convCargada !== S.convJornada) cargarConvAdmin();
}

function adminLoginHTML(mensaje) {
  return `<div class="tarjeta">
    <h2>Administración</h2>
    <p>Crear jornadas, marcar el once inicial y gestionar la plantilla.</p>
    ${mensaje ? aviso(mensaje) : ""}
    <label for="adm-pass">Contraseña de administrador</label>
    <input id="adm-pass" type="password" autocomplete="off" placeholder="mínimo 6 caracteres">
    <p class="cuando">Si es la primera vez, la contraseña que escribas queda fijada como la de administrador.</p>
    <div id="msg-admin"></div>
    <p><button class="principal" id="btn-admin-entrar" style="width:100%">Entrar</button></p>
  </div>`;
}

/* Lo que ha salido de leer la foto, para repasarlo antes de guardar. */
function lecturaHTML() {
  const L = S.lecturaFoto;
  if (!L) return "";

  const sueltas = L.sinReconocer || [];
  const resumen = L.detalles.length
    ? `Se han reconocido ${L.detalles.length} jugadores de la plantilla.`
    : "No se ha reconocido a nadie. Prueba con una foto más nítida o marca los convocados a mano.";

  return `
    ${aviso(resumen + (sueltas.length
      ? ` Hay ${sueltas.length} ${sueltas.length === 1 ? "línea" : "líneas"} que no cuadran con nadie de la plantilla.`
      : ""), L.detalles.length >= 11 ? "ok" : "error")}

    ${L.detalles.length ? `<ul class="once-lista">${L.detalles.map(d =>
      `<li><b>${d.dorsal ?? "·"}</b> ${esc(d.nombre)}</li>`).join("")}</ul>` : ""}

    ${sueltas.length ? `<h3>Sin reconocer</h3>
      <p class="cuando">Líneas de la foto que no ha sabido casar con la plantilla: canteranos que aún no están dados de alta, o nombres que ha leído mal. Añade a los que falten y confirma los que te proponga; si es un borrón, déjalo.</p>
      <div class="tabla-scroll"><table><tbody>
        ${sueltas.map((x, i) => `<tr>
          <td class="num">${x.dorsal ?? "·"}</td>
          <td>${x.nombre ? esc(x.nombre) : `<span class="no-participo">nombre ilegible</span>`}</td>
          <td>${x.sugerencia
            ? `<button class="menor" data-conv-es="${x.sugerencia.id}" data-linea="${i}">¿Es ${esc(x.sugerencia.nombre)}?</button>`
            : ""}</td>
          ${x.nombre ? `<td><select class="conv-pos">${POSICIONES.map(([c, t]) =>
                `<option value="${c}" ${c === "MED" ? "selected" : ""}>${t.slice(0, -1)}</option>`).join("")}</select></td>
          <td><button class="menor" data-conv-alta="${i}">Añadir a la plantilla</button></td>`
          : `<td colspan="2"></td>`}
        </tr>`).join("")}
      </tbody></table></div>` : ""}

    ${(() => {
      // Nada puede quedarse invisible: quien no se haya marcado, se enseña aquí.
      const sinMarcar = jugadores(true).filter(g => g.activo !== false && !S.adminConv.includes(g.id));
      return sinMarcar.length ? `<h3>Se quedan sin convocar (${sinMarcar.length})</h3>
        <p class="cuando">Repásalos contra la foto: si alguno debería estar, márcalo abajo.</p>
        <ul class="once-lista">${sinMarcar.map(g =>
          `<li><b>${g.dorsal ?? "·"}</b> ${esc(g.nombre)}</li>`).join("")}</ul>` : "";
    })()}

    <details class="desglose"><summary>Ver el texto que ha leído</summary>
      <pre class="texto-leido">${esc(L.texto)}</pre></details>`;
}

async function cargarOnceAdmin() {
  if (!S.adminJornada) return;
  S.onceCargado = S.adminJornada;
  const d = await API.rpc("api_jornada", { p_jornada: S.adminJornada, p_token: S.adminToken });
  if (d.ok) S.adminOnce = d.jornada.once_oficial || [];
  await pintarAdmin();
}

async function cargarConvAdmin() {
  if (!S.convJornada) return;
  S.convCargada = S.convJornada;
  const d = await API.rpc("api_jornada", { p_jornada: S.convJornada, p_token: S.adminToken });
  if (d.ok) S.adminConv = d.jornada.convocatoria || [];
  await pintarAdmin();
}

async function accionAdmin(fn, args, caja, exito) {
  const r = await API.rpc(fn, { p_token: S.adminToken, ...args });
  const el = $(caja);
  if (!r.ok) { if (el) el.innerHTML = aviso(r.error, "error"); return null; }
  if (el && exito) el.innerHTML = aviso(exito, "ok");
  return r;
}

/* --------------------------------------------------------------- eventos --- */

// La navegación la llevan los enlaces del menú: cambian el hash y eso dispara mostrar().
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button");
  if (!t) return;

  try {
    // elegir jugador (mi alineación o once oficial del admin)
    if (t.dataset.elegir) {
      const id = Number(t.dataset.elegir);
      const admin = Boolean(t.closest("#selector-admin"));
      const lista = admin ? S.adminOnce : S.picks;
      const i = lista.indexOf(id);
      if (i >= 0) lista.splice(i, 1); else if (lista.length < 11) lista.push(id);
      if (admin) await pintarAdmin(); else await pintarAlineacion();
      return;
    }

    // marcar convocados: sin tope de 11, y sin repintar toda la pantalla, que
    // aquí se dan muchos toques seguidos repasando la foto
    if (t.dataset.convocar) {
      const id = Number(t.dataset.convocar);
      const i = S.adminConv.indexOf(id);
      if (i >= 0) S.adminConv.splice(i, 1); else S.adminConv.push(id);
      t.setAttribute("aria-pressed", String(i < 0));
      const cuenta = $("#conv-cuenta");
      if (cuenta) cuenta.textContent = S.adminConv.length;
      const guardar = $("#btn-conv");
      if (guardar) guardar.disabled = S.adminConv.length < 11;
      return;
    }

    if (t.id === "btn-entrar")  { await entrar(); return; }
    if (t.id === "btn-guardar") { await guardarAlineacion(); return; }
    if (t.id === "btn-salir") {
      await API.rpc("api_logout", { p_token: S.token }).catch(() => {});
      S.token = null; S.sesion = null; S.jornadaMia = null; S.picks = []; S.guardado = [];
      localStorage.removeItem("fr_token");
      await cargarEstado(); await pintarAlineacion(); return;
    }

    // --- admin ---
    if (t.id === "btn-admin-entrar") {
      const r = await API.rpc("api_admin_login", { p_pass: $("#adm-pass").value });
      if (!r.ok) { $("#msg-admin").innerHTML = aviso(r.error, "error"); return; }
      S.adminToken = r.token; localStorage.setItem("fr_admin", r.token);
      await pintarAdmin(); return;
    }
    if (t.id === "btn-salir-admin") {
      await API.rpc("api_logout", { p_token: S.adminToken }).catch(() => {});
      S.adminToken = null; S.estadoAdm = null; S.adminOnce = []; S.adminConv = []; S.lecturaFoto = null;
      localStorage.removeItem("fr_admin");
      await pintarAdmin(); return;
    }
    if (t.dataset.editarJornada) {
      S.adminEditando = (S.estadoAdm.jornadas || []).find(j => j.id === Number(t.dataset.editarJornada));
      await pintarAdmin(); return;
    }
    if (t.id === "btn-cancelar-jornada") { S.adminEditando = null; await pintarAdmin(); return; }

    if (t.id === "btn-jornada") {
      const kick = $("#adm-kick").value;
      if (!kick) { $("#msg-jornada").innerHTML = aviso("Falta el día y la hora del partido.", "error"); return; }
      const r = await accionAdmin("api_admin_jornada", {
        p_id: S.adminEditando?.id ?? null,
        p_numero: Number($("#adm-num").value),
        p_rival: $("#adm-rival").value,
        p_en_casa: $("#adm-casa").value === "1",
        p_kickoff: new Date(kick).toISOString(),
        p_minutos_antes: Number($("#adm-antes").value || 60),
        p_hora_confirmada: $("#adm-confirmada").checked
      }, "#msg-jornada");
      if (r) { S.adminEditando = null; await cargarEstado(); await pintarAdmin(); }
      return;
    }
    if (t.dataset.prorrogar) {
      const r = await accionAdmin("api_admin_prorrogar",
        { p_jornada: Number(t.dataset.prorrogar), p_minutos: Number(t.dataset.min) }, "#msg-jornada");
      if (r) { await cargarEstado(); await pintarAdmin(); }
      return;
    }
    // --- convocatoria ---
    if (t.id === "btn-analizar") {
      const foto = $("#adm-foto").files?.[0];
      const caja = $("#msg-conv");
      if (!foto) { caja.innerHTML = aviso("Elige primero la foto de la convocatoria.", "error"); return; }
      t.disabled = true;
      try {
        const lectura = await CONVOCATORIA.analizarFoto(
          foto,
          jugadores(true).filter(g => g.activo !== false),
          paso => { caja.innerHTML = aviso(`Leyendo la foto: ${paso}`); }
        );
        S.lecturaFoto = lectura;
        // lo leído se suma a lo que ya hubiera marcado, no lo sustituye
        lectura.convocados.forEach(id => { if (!S.adminConv.includes(id)) S.adminConv.push(id); });
        await pintarAdmin();
      } catch (e) {
        caja.innerHTML = aviso(e.message, "error");
        t.disabled = false;
      }
      return;
    }
    if (t.dataset.convEs) {                       // «¿es este?» de una línea dudosa
      const id = Number(t.dataset.convEs);
      if (!S.adminConv.includes(id)) S.adminConv.push(id);
      S.lecturaFoto.sinReconocer.splice(Number(t.dataset.linea), 1);
      S.lecturaFoto.detalles.push({ jugador_id: id, nombre: nombreJug(id), dorsal: jug(id)?.dorsal });
      await pintarAdmin();
      return;
    }
    if (t.dataset.convAlta) {                     // dar de alta a un canterano
      const linea = S.lecturaFoto.sinReconocer[Number(t.dataset.convAlta)];
      const r = await accionAdmin("api_admin_jugador", {
        p_id: null, p_dorsal: linea.dorsal, p_nombre: linea.nombre,
        p_posicion: $(".conv-pos", t.closest("tr")).value, p_activo: true
      }, "#msg-conv");
      if (r) {
        if (r.id) S.adminConv.push(r.id);
        S.lecturaFoto.sinReconocer.splice(Number(t.dataset.convAlta), 1);
        await cargarEstado();
        await pintarAdmin();
        $("#msg-conv").innerHTML = aviso(
          `${linea.nombre} añadido a la plantilla y marcado como convocado.`
          + " Repasa su posición en la tabla de Plantilla: solo sirve para dibujar el campo.", "ok");
      }
      return;
    }
    if (t.id === "btn-conv") {
      const r = await accionAdmin("api_admin_convocatoria",
        { p_jornada: S.convJornada, p_jugadores: S.adminConv }, "#msg-conv");
      if (r) {
        S.lecturaFoto = null;
        await cargarEstado();
        await pintarAdmin();
        $("#msg-conv").innerHTML = aviso(
          `Convocatoria guardada: ${r.jugadores} jugadores. A partir de ahora solo se puede alinear a ellos.`
          + (r.afectadas
            ? ` ${r.afectadas} ${r.afectadas === 1 ? "alineación ya enviada tiene" : "alineaciones ya enviadas tienen"} algún jugador sin convocar:`
              + ` siguen contando tal cual, pero esos jugadores no pueden acertar. La web se lo avisa a cada uno al entrar.`
            : ""),
          r.afectadas ? "" : "ok");
      }
      return;
    }
    if (t.id === "btn-conv-quitar") {
      if (!confirm("¿Quitar la convocatoria de esta jornada? Se podrá volver a alinear a toda la plantilla.")) return;
      const r = await accionAdmin("api_admin_convocatoria",
        { p_jornada: S.convJornada, p_jugadores: null }, "#msg-conv");
      if (r) {
        S.adminConv = []; S.lecturaFoto = null;
        await cargarEstado(); await pintarAdmin();
        $("#msg-conv").innerHTML = aviso("Convocatoria retirada: vuelve a valer toda la plantilla.", "ok");
      }
      return;
    }

    if (t.id === "btn-once") {
      const r = await accionAdmin("api_admin_once",
        { p_jornada: S.adminJornada, p_picks: S.adminOnce }, "#msg-once", "Once oficial guardado. Ya están calculadas las puntuaciones.");
      if (r) await cargarEstado();
      return;
    }
    if (t.id === "btn-despublicar") {
      if (!confirm("¿Quitar el once oficial de esta jornada? Se dejará de puntuar hasta que lo vuelvas a marcar.")) return;
      const r = await accionAdmin("api_admin_once", { p_jornada: S.adminJornada, p_picks: null }, "#msg-once", "Once oficial retirado.");
      if (r) { S.adminOnce = []; await cargarEstado(); await pintarAdmin(); }
      return;
    }
    if (t.dataset.resetPin) {
      if (!confirm(`¿Reiniciar el PIN de ${t.dataset.nombre}? La próxima vez que entre elegirá uno nuevo.`)) return;
      const r = await accionAdmin("api_admin_reset_pin", { p_participante: Number(t.dataset.resetPin) }, "#msg-part", "PIN reiniciado.");
      if (r) await pintarAdmin();
      return;
    }
    if (t.id === "btn-part") {
      const r = await accionAdmin("api_admin_participante",
        { p_id: null, p_nombre: $("#adm-part").value, p_activo: true }, "#msg-part", "Participante añadido.");
      if (r) { await cargarEstado(); await pintarAdmin(); }
      return;
    }
    if (t.dataset.guardarJugador) {
      const fila = t.closest("tr");
      const r = await accionAdmin("api_admin_jugador", {
        p_id: Number(t.dataset.guardarJugador),
        p_dorsal: $(".j-dorsal", fila).value === "" ? null : Number($(".j-dorsal", fila).value),
        p_nombre: $(".j-nombre", fila).value,
        p_posicion: $(".j-pos", fila).value,
        p_activo: $(".j-activo", fila).checked
      }, "#msg-jug", "Jugador guardado.");
      if (r) await cargarEstado();
      return;
    }
    if (t.id === "btn-jugador") {
      const r = await accionAdmin("api_admin_jugador", {
        p_id: null,
        p_dorsal: $("#adm-jd").value === "" ? null : Number($("#adm-jd").value),
        p_nombre: $("#adm-jn").value,
        p_posicion: $("#adm-jp").value,
        p_activo: true
      }, "#msg-jug", "Jugador añadido.");
      if (r) { await cargarEstado(); await pintarAdmin(); }
      return;
    }
  } catch (e) {
    alert(e.message);
  }
});

document.addEventListener("change", async ev => {
  if (ev.target.id === "sel-jornada") { S.jornadaVer = Number(ev.target.value); await pintarJornada(); }
  if (ev.target.id === "adm-sel-jornada") {
    S.adminJornada = Number(ev.target.value);
    S.adminOnce = [];
    S.onceCargado = null;
    await pintarAdmin();
  }
  if (ev.target.id === "adm-sel-conv") {
    S.convJornada = Number(ev.target.value);
    S.adminConv = [];
    S.lecturaFoto = null;
    S.convCargada = null;
    await pintarAdmin();
  }
});

document.addEventListener("keydown", ev => {
  if (ev.key === "Enter" && ev.target.id === "inp-pin") $("#btn-entrar")?.click();
  if (ev.key === "Enter" && ev.target.id === "adm-pass") $("#btn-admin-entrar")?.click();
});

/* -------------------------------------------------------------- navegación --- */

const VISTAS = ["alineacion", "jornada", "general", "admin"];

async function mostrar(vista) {
  if (!VISTAS.includes(vista)) vista = "alineacion";
  VISTAS.forEach(v => {
    $(`#v-${v}`).classList.toggle("activa", v === vista);
    $(`nav a[data-vista="${v}"]`).classList.toggle("activa", v === vista);
  });
  try {
    if (vista === "alineacion") await pintarAlineacion();
    if (vista === "jornada")    await pintarJornada();
    if (vista === "general")    await pintarGeneral();
    if (vista === "admin")      await pintarAdmin();
  } catch (e) {
    $(`#v-${vista}`).innerHTML = `<div class="tarjeta">${aviso(e.message, "error")}</div>`;
  }
}

window.addEventListener("hashchange", () => mostrar(location.hash.slice(1)));

/* la cuenta atrás, y recarga automática justo al cumplirse el plazo */
const estadoCierre = new Map();   // cierre -> estaba cerrado en el tic anterior

setInterval(() => {
  let acaba_de_cerrar = false;
  $$("[data-cierre]").forEach(el => {
    const { texto, clase } = textoCuenta(el.dataset.cierre);
    if (el.textContent !== texto) el.textContent = texto;
    el.className = `cuenta-atras ${clase}`;
    const cerrado = clase === "cerrada";
    if (estadoCierre.get(el.dataset.cierre) === false && cerrado) acaba_de_cerrar = true;
    estadoCierre.set(el.dataset.cierre, cerrado);
  });
  if (acaba_de_cerrar) {
    S.jornadaMia = null;
    cargarEstado().then(() => mostrar(location.hash.slice(1) || "alineacion"));
  }
}, 1000);

/* ------------------------------------------------------------------ inicio --- */

(async function inicio() {
  try {
    if (API.configurado()) await cargarEstado();
  } catch (e) {
    $("#v-alineacion").innerHTML = `<div class="tarjeta"><h2>No se ha podido conectar</h2>${aviso(e.message, "error")}</div>`;
    $("#v-alineacion").classList.add("activa");
    return;
  }
  await mostrar(location.hash.slice(1) || "alineacion");
})();
