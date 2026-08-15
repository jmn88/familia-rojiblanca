/* Modo demostración: sustituye a api.js y finge la base de datos en el propio
   navegador, para poder ver y probar la web sin haber creado nada todavía.
   Los datos son de ejemplo y se guardan solo en este dispositivo.
   La web de verdad (index.html) usa app/api.js y la base de datos real. */

const API = (function () {
  const CLAVE = "fr_demo_v4";   // al cambiar los datos de ejemplo se sube el número
  const dia = 864e5;

  const NOMBRES = ["Andrii", "Chiquitín", "Javi", "Jesús", "Tio P", "Tito"];
  const PLANTILLA = [
    [1, "Odysseas", "POR"], [13, "Fran González", "POR"], [12, "Sangante", "DEF"],
    [2, "Iglesias", "DEF"], [3, "Julio Díaz", "DEF"], [4, "Kike Salas", "DEF"],
    [5, "A. Castrín", "DEF"], [23, "Marcao", "DEF"], [22, "Carmona", "DEF"], [17, "Suazo", "DEF"],
    [6, "Agoumé", "MED"], [10, "Peque", "MED"], [18, "Guridi", "MED"], [26, "Manuel Ángel", "MED"],
    [28, "Manu Bueno", "MED"], [30, "M. Sierra", "MED"], [27, "Nico Guillén", "MED"],
    [7, "Alfon", "DEL"], [11, "Vargas", "DEL"], [21, "Ejuke", "DEL"],
    [16, "Isaac Romero", "DEL"], [9, "Robbie Ure", "DEL"], [19, "Oso", "DEL"]
  ];

  function semilla() {
    const jugadores = PLANTILLA.map(([dorsal, nombre, posicion], i) =>
      ({ id: i + 1, dorsal, nombre, posicion, activo: true }));
    const participantes = NOMBRES.map((nombre, i) => ({ id: i + 1, nombre, pin: null }));

    // identificadores de jugador (el orden de PLANTILLA), no dorsales
    const once = [1, 9, 6, 8, 10, 11, 12, 13, 18, 21, 20];   // once "oficial" de ejemplo
    const alineaciones = [
      { jornada_id: 1, participante_id: 1, picks: [1, 9, 6, 8, 10, 11, 12, 13, 18, 21, 20] },  // 11
      { jornada_id: 1, participante_id: 2, picks: [1, 9, 6, 8, 10, 11, 12, 13, 18, 21, 22] },  // 10
      { jornada_id: 1, participante_id: 3, picks: [1, 9, 6, 8, 10, 11, 12, 15, 18, 21, 22] },  //  9
      { jornada_id: 1, participante_id: 4, picks: [2, 9, 6, 8, 10, 11, 12, 15, 18, 21, 22] },  //  8
      { jornada_id: 1, participante_id: 5, picks: [1, 9, 6, 4, 5, 14, 15, 16, 17, 19, 23] },   //  3
      // las de la jornada 2 salen todas de la convocatoria de ejemplo de abajo
      { jornada_id: 2, participante_id: 2, picks: [1, 9, 6, 7, 10, 11, 12, 13, 15, 21, 20] },
      { jornada_id: 2, participante_id: 5, picks: [1, 4, 6, 3, 10, 11, 12, 15, 16, 21, 22] }
    ].map((a, i) => {
      // se envían el día antes, y un par de ellas se retocan más tarde
      const enviada = new Date(Date.now() - dia - i * 36e5);
      const retoque = i % 3 === 0 ? new Date(+enviada + 5 * 36e5) : enviada;
      return { ...a, enviada_en: enviada.toISOString(), actualizada_en: retoque.toISOString() };
    });

    // Convocatoria de ejemplo del próximo partido: la plantilla entera menos
    // Marcao (8), Manuel Ángel (14) y Alfon (18), que se quedan fuera.
    const convocados = jugadores.map(g => g.id).filter(id => ![8, 14, 18].includes(id));

    const kick2 = new Date("2026-08-15T21:30:00+02:00");
    const kick1 = new Date(kick2.getTime() - 7 * dia);
    const kick3 = new Date(kick2.getTime() + 7 * dia);

    return {
      participantes, jugadores, alineaciones, admin_pass: null, sesiones: {},
      jornadas: [
        { id: 1, numero: 1, rival: "Girona (ejemplo)", en_casa: false, kickoff: kick1.toISOString(),
          cierre: new Date(kick1.getTime() - 36e5).toISOString(), prorroga_hasta: null,
          once_oficial: once, hora_confirmada: true, convocatoria: null },
        { id: 2, numero: 2, rival: "Rayo Vallecano", en_casa: true, kickoff: kick2.toISOString(),
          cierre: new Date(kick2.getTime() - 36e5).toISOString(), prorroga_hasta: null,
          once_oficial: null, hora_confirmada: true, convocatoria: convocados },
        // futura y con hora todavía sin fijar: no se puede alinear a ella, y en la
        // pestaña Jornada ni siquiera aparece. Solo se ve desde Admin.
        { id: 3, numero: 3, rival: "Athletic", en_casa: false, kickoff: kick3.toISOString(),
          cierre: new Date(kick3.getTime() - 36e5).toISOString(), prorroga_hasta: null,
          once_oficial: null, hora_confirmada: false, convocatoria: null }
      ]
    };
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(CLAVE)) || semilla(); } catch { db = semilla(); }
  const salvar = () => localStorage.setItem(CLAVE, JSON.stringify(db));

  const cierreEf = j => new Date(Math.max(+new Date(j.cierre), j.prorroga_hasta ? +new Date(j.prorroga_hasta) : 0));
  const cerrada = j => Date.now() >= +cierreEf(j);
  const puntos = a => ({ 11: 100, 10: 50, 9: 25, 8: 10, 7: 5, 6: 1 }[a] || 0);
  const aciertos = (picks, of) => picks.filter(p => of.includes(p)).length;
  const sesion = tok => db.sesiones[tok] || null;
  // el próximo partido: la jornada de número más bajo con el plazo aún abierto
  const proxima = () => db.jornadas.slice().sort((a, b) => a.numero - b.numero).find(j => !cerrada(j)) || null;
  const alin = (jid, pid) => db.alineaciones.find(a => a.jornada_id === jid && a.participante_id === pid);
  const nuevoToken = () => "demo-" + Math.random().toString(36).slice(2);
  const ok = extra => ({ ok: true, ...extra });
  const mal = error => ({ ok: false, error });

  function filasJornada(j, yo) {
    const cerr = cerrada(j);
    return db.participantes.map(p => {
      const a = alin(j.id, p.id);
      const ac = j.once_oficial && a ? aciertos(a.picks, j.once_oficial) : null;
      return {
        participante_id: p.id, nombre: p.nombre, participo: Boolean(a),
        picks: (cerr || p.id === yo) && a ? a.picks : null,
        aciertos: ac,
        puntos: j.once_oficial ? (a ? puntos(ac) : 0) : null,
        enviada_en: (cerr || p.id === yo) && a ? (a.enviada_en || a.actualizada_en) : null,
        actualizada_en: (cerr || p.id === yo) && a ? a.actualizada_en : null
      };
    }).sort((x, y) => (y.puntos || 0) - (x.puntos || 0) || x.nombre.localeCompare(y.nombre));
  }

  const acciones = {
    api_estado: ({ p_token }) => {
      const s = sesion(p_token);
      return {
        ok: true, ahora: new Date().toISOString(),
        participantes: db.participantes.map(p => ({ id: p.id, nombre: p.nombre, tiene_pin: Boolean(p.pin) })),
        jugadores: db.jugadores.filter(g => g.activo || s?.es_admin),
        jornadas: db.jornadas.map(j => ({
          id: j.id, numero: j.numero, rival: j.rival, en_casa: j.en_casa, kickoff: j.kickoff,
          hora_confirmada: j.hora_confirmada !== false,
          cierre: cierreEf(j).toISOString(), prorrogada: Boolean(j.prorroga_hasta),
          cerrada: cerrada(j), es_proxima: j.id === proxima()?.id,
          convocatoria: j.convocatoria || null,
          tiene_propuesta: Boolean(j.once_propuesto),
          publicada: Boolean(j.once_oficial)
        })),
        sesion: s ? { participante_id: s.participante_id, es_admin: Boolean(s.es_admin),
                      nombre: db.participantes.find(p => p.id === s.participante_id)?.nombre } : null
      };
    },

    api_login: ({ p_participante, p_pin }) => {
      if (!/^\d{4}$/.test(p_pin || "")) return mal("El PIN son 4 dígitos");
      const p = db.participantes.find(x => x.id === p_participante);
      if (!p) return mal("Participante no válido");
      const nuevo = !p.pin;
      if (nuevo) p.pin = p_pin;
      else if (p.pin !== p_pin) return mal("PIN incorrecto");
      const token = nuevoToken();
      db.sesiones[token] = { participante_id: p.id };
      salvar();
      return ok({ token, nombre: p.nombre, participante_id: p.id, pin_nuevo: nuevo });
    },

    api_logout: ({ p_token }) => { delete db.sesiones[p_token]; salvar(); return ok(); },

    api_guardar: ({ p_token, p_jornada, p_picks }) => {
      const s = sesion(p_token);
      if (!s || !s.participante_id) return mal("Sesión caducada, vuelve a entrar");
      const j = db.jornadas.find(x => x.id === p_jornada);
      if (!j) return mal("Jornada no encontrada");
      if (cerrada(j)) return mal("El plazo está cerrado");
      if (j.id !== proxima()?.id) return mal("Solo se puede enviar la alineación del próximo partido");
      if (p_picks.length !== 11) return mal("Tienes que elegir exactamente 11 jugadores");
      if (j.convocatoria && p_picks.some(id => !j.convocatoria.includes(id))) {
        return mal("Solo puedes alinear a jugadores de la convocatoria");
      }
      const a = alin(j.id, s.participante_id);
      const ahora = new Date().toISOString();
      if (a) { a.picks = p_picks; a.actualizada_en = ahora; }
      else db.alineaciones.push({ jornada_id: j.id, participante_id: s.participante_id, picks: p_picks,
                                  enviada_en: ahora, actualizada_en: ahora });
      salvar();
      return ok({ guardada_en: ahora });
    },

    api_jornada: ({ p_jornada, p_token }) => {
      const j = db.jornadas.find(x => x.id === p_jornada);
      if (!j) return mal("Jornada no encontrada");
      const s = sesion(p_token);
      return ok({
        jornada: {
          id: j.id, numero: j.numero, rival: j.rival, en_casa: j.en_casa, kickoff: j.kickoff,
          hora_confirmada: j.hora_confirmada !== false,
          cierre: cierreEf(j).toISOString(), prorrogada: Boolean(j.prorroga_hasta),
          cerrada: cerrada(j), es_proxima: j.id === proxima()?.id,
          convocatoria: j.convocatoria || null,
          once_oficial: j.once_oficial, publicada: Boolean(j.once_oficial)
        },
        filas: filasJornada(j, s?.participante_id)
      });
    },

    api_general: () => {
      const pub = db.jornadas.filter(j => j.once_oficial);
      const detalle = [];
      const tot = db.participantes.map(p => {
        let pts = 0, jug = 0, ac = 0, mejor = 0;
        pub.forEach(j => {
          const a = alin(j.id, p.id);
          const n = a ? aciertos(a.picks, j.once_oficial) : null;
          const q = a ? puntos(n) : 0;
          detalle.push({ participante_id: p.id, numero: j.numero, puntos: q, aciertos: n, participo: Boolean(a) });
          pts += q; ac += n || 0; mejor = Math.max(mejor, q); if (a) jug++;
        });
        return { participante_id: p.id, nombre: p.nombre, puntos: pts, jugadas: jug, aciertos: ac, mejor };
      }).sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre));

      let puesto = 0, previo = null;
      tot.forEach((t, i) => { if (t.puntos !== previo) { puesto = i + 1; previo = t.puntos; } t.puesto = puesto; });
      return ok({ tabla: tot, detalle });
    },

    api_admin_login: ({ p_pass }) => {
      if ((p_pass || "").length < 6) return mal("La contraseña debe tener al menos 6 caracteres");
      if (!db.admin_pass) db.admin_pass = p_pass;
      else if (db.admin_pass !== p_pass) return mal("Contraseña incorrecta");
      const token = nuevoToken();
      db.sesiones[token] = { participante_id: null, es_admin: true };
      salvar();
      return ok({ token });
    },

    api_admin_jornada: ({ p_token, p_id, p_numero, p_rival, p_en_casa, p_kickoff, p_minutos_antes, p_hora_confirmada }) => {
      if (!sesion(p_token)?.es_admin) return mal("No autorizado");
      if (!p_numero || p_numero < 1 || p_numero > 38) return mal("La jornada va de 1 a 38");
      if (!p_rival?.trim()) return mal("Falta el rival");
      const cierre = new Date(+new Date(p_kickoff) - (p_minutos_antes || 60) * 6e4).toISOString();
      let j = p_id ? db.jornadas.find(x => x.id === p_id) : db.jornadas.find(x => x.numero === p_numero);
      if (!j) { j = { id: Math.max(0, ...db.jornadas.map(x => x.id)) + 1, once_oficial: null, prorroga_hasta: null }; db.jornadas.push(j); }
      Object.assign(j, { numero: p_numero, rival: p_rival.trim(), en_casa: p_en_casa, kickoff: p_kickoff, cierre,
                         hora_confirmada: Boolean(p_hora_confirmada) });
      db.jornadas.sort((a, b) => a.numero - b.numero);
      salvar();
      return ok({ id: j.id, cierre });
    },

    api_admin_prorrogar: ({ p_token, p_jornada, p_minutos }) => {
      if (!sesion(p_token)?.es_admin) return mal("No autorizado");
      const j = db.jornadas.find(x => x.id === p_jornada);
      if (!j) return mal("Jornada no encontrada");
      j.prorroga_hasta = new Date(Math.max(+cierreEf(j), Date.now()) + p_minutos * 6e4).toISOString();
      salvar();
      return ok({ cierre: j.prorroga_hasta });
    },

    api_admin_convocatoria: ({ p_token, p_jornada, p_jugadores }) => {
      if (!sesion(p_token)?.es_admin) return mal("No autorizado");
      const j = db.jornadas.find(x => x.id === p_jornada);
      if (!j) return mal("Jornada no encontrada");
      if (!p_jugadores) { j.convocatoria = null; salvar(); return ok({ convocatoria: false }); }
      if (p_jugadores.length < 11) return mal("La convocatoria necesita 11 jugadores como mínimo");
      if (new Set(p_jugadores).size !== p_jugadores.length) return mal("Hay jugadores repetidos");
      const afectadas = db.alineaciones.filter(a =>
        a.jornada_id === j.id && a.picks.some(id => !p_jugadores.includes(id))).length;
      j.convocatoria = p_jugadores.slice();
      salvar();
      return ok({ convocatoria: true, jugadores: p_jugadores.length, afectadas });
    },

    api_admin_once: ({ p_token, p_jornada, p_picks }) => {
      if (!sesion(p_token)?.es_admin) return mal("No autorizado");
      const j = db.jornadas.find(x => x.id === p_jornada);
      if (!j) return mal("Jornada no encontrada");
      if (p_picks && p_picks.length !== 11) return mal("El once oficial son 11 jugadores");
      if (p_picks && j.convocatoria && p_picks.some(id => !j.convocatoria.includes(id))) {
        return mal("El once oficial tiene jugadores que no estaban convocados. Corrige antes la convocatoria.");
      }
      j.once_oficial = p_picks || null;
      salvar();
      return ok({ publicada: Boolean(p_picks) });
    },

    api_admin_reset_pin: ({ p_token, p_participante }) => {
      if (!sesion(p_token)?.es_admin) return mal("No autorizado");
      const p = db.participantes.find(x => x.id === p_participante);
      if (p) p.pin = null;
      salvar();
      return ok();
    },

    api_admin_participante: ({ p_token, p_id, p_nombre }) => {
      if (!sesion(p_token)?.es_admin) return mal("No autorizado");
      if (!p_nombre?.trim()) return mal("Falta el nombre");
      if (p_id) Object.assign(db.participantes.find(x => x.id === p_id), { nombre: p_nombre.trim() });
      else db.participantes.push({ id: Math.max(0, ...db.participantes.map(x => x.id)) + 1, nombre: p_nombre.trim(), pin: null });
      salvar();
      return ok();
    },

    api_admin_jugador: ({ p_token, p_id, p_dorsal, p_nombre, p_posicion, p_activo }) => {
      if (!sesion(p_token)?.es_admin) return mal("No autorizado");
      if (!p_nombre?.trim()) return mal("Falta el nombre");
      const datos = { dorsal: p_dorsal, nombre: p_nombre.trim(), posicion: p_posicion, activo: p_activo !== false };
      let id = p_id;
      if (p_id) Object.assign(db.jugadores.find(x => x.id === p_id), datos);
      else {
        id = Math.max(0, ...db.jugadores.map(x => x.id)) + 1;
        db.jugadores.push({ id, ...datos });
      }
      salvar();
      return ok({ id });
    }
  };

  async function rpc(fn, args = {}) {
    await new Promise(r => setTimeout(r, 90));          // finge la latencia de la red
    if (!acciones[fn]) throw new Error(`Función desconocida: ${fn}`);
    return acciones[fn](args);
  }

  return { rpc, configurado: () => true, reiniciar: () => { localStorage.removeItem(CLAVE); location.reload(); } };
})();
