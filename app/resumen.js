/* El resumen de la jornada como imagen, para compartirlo por WhatsApp.

   Se dibuja aquí mismo, en el navegador, sobre un <canvas>: no hace falta
   servidor, ni robot, ni librería. Lleva el partido, quién ganó la jornada, la
   clasificación del día con los aciertos de cada uno y a quién falló, el once
   del Sevilla sobre el campo, y la clasificación general con lo que sumó cada
   uno y si sube o baja.

   En el móvil se abre la hoja de compartir del sistema (navigator.share), que
   ofrece WhatsApp directamente; donde eso no exista (ordenador) se descarga el
   PNG y se comparte a mano.

   Los emojis los pinta el propio sistema con su fuente de emojis, así que se
   ven como en cualquier otra aplicación del móvil. */

const RESUMEN = (function () {

  const ANCHO  = 1080;   // WhatsApp lo enseña entero sin recortar
  const MARGEN = 48;
  const RELLENO = 36;    // dentro de cada tarjeta

  const C = {
    rojo: "#c8102e", rojoOsc: "#8e0b21", rojoClaro: "#fbe9ec",
    tinta: "#14161a", suave: "#6a7280", borde: "#e6e8ed", fondo: "#f3f4f6", papel: "#ffffff",
    verde: "#1a8a45", verdeClaro: "#e2f4e8", cesped1: "#2a7f4b", cesped2: "#256e42",
    oro: "#f2b632"
  };
  const FUENTE = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const f = (peso, px, estilo = "") => `${estilo} ${peso} ${px}px ${FUENTE}`.trim();

  /* ------------------------------------------------------------ dibujo --- */

  function caja(ctx, x, y, w, h, r, relleno, borde, grosor = 2) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
    if (borde)   { ctx.strokeStyle = borde; ctx.lineWidth = grosor; ctx.stroke(); }
  }

  function circulo(ctx, x, y, r, relleno, borde, grosor = 2) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
    if (borde)   { ctx.strokeStyle = borde; ctx.lineWidth = grosor; ctx.stroke(); }
  }

  function texto(ctx, s, x, y, fuente, color, alinear = "left") {
    ctx.font = fuente;
    ctx.fillStyle = color;
    ctx.textAlign = alinear;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(s, x, y);
  }

  const ancho = (ctx, s, fuente) => { ctx.font = fuente; return ctx.measureText(s).width; };

  // corta con «…» lo que no quepa
  function recortar(ctx, s, fuente, max) {
    if (ancho(ctx, s, fuente) <= max) return s;
    let t = s;
    while (t.length > 1 && ancho(ctx, t + "…", fuente) > max) t = t.slice(0, -1);
    return t.trimEnd() + "…";
  }

  // Empates con el mismo puesto: 1, 1, 3…
  function puestos(filas, campo = "puntos") {
    let puesto = 0, previo = null;
    return filas.map((fila, i) => {
      if (fila[campo] !== previo) { puesto = i + 1; previo = fila[campo]; }
      return { ...fila, puesto };
    });
  }

  // etiquetas redondeadas una detrás de otra, saltando de renglón al llenarse
  function etiquetas(ctx, lista, x, y, w, { fuente, relleno, borde, color, alto = 44, hueco = 10 }) {
    let cx = x, cy = y;
    lista.forEach(s => {
      const tw = ancho(ctx, s, fuente) + 30;
      if (cx + tw > x + w && cx > x) { cx = x; cy += alto + hueco; }
      caja(ctx, cx, cy, tw, alto, alto / 2, relleno, borde);
      texto(ctx, s, cx + tw / 2, cy + alto / 2 + 9, fuente, color, "center");
      cx += tw + hueco;
    });
    return cy + alto;
  }

  /* Cada tarjeta se dibuja dos veces: primero a ciegas para saber cuánto
     mide, y luego de verdad con el fondo blanco debajo. Así no hay que
     calcular alturas a mano. */
  function tarjeta(ctx, y, dibujar) {
    const x = MARGEN, w = ANCHO - MARGEN * 2;
    ctx.save(); ctx.globalAlpha = 0;
    const alto = dibujar(x + RELLENO, y + RELLENO, w - RELLENO * 2);
    ctx.restore();
    const h = alto + RELLENO * 2;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.09)"; ctx.shadowBlur = 28; ctx.shadowOffsetY = 8;
    caja(ctx, x, y, w, h, 28, C.papel);
    ctx.restore();
    dibujar(x + RELLENO, y + RELLENO, w - RELLENO * 2);
    return y + h;
  }

  function titulo(ctx, emoji, s, x, y) {
    texto(ctx, emoji, x, y + 34, f("400", 34), C.tinta);
    texto(ctx, s, x + 50, y + 34, f("800", 36), C.tinta);
    return y + 62;
  }

  /* ----------------------------------------------------------- piezas --- */

  // la cabecera roja con las rayas del Sevilla
  function cabecera(ctx, j, fecha) {
    const H = 380;
    const g = ctx.createLinearGradient(0, 0, ANCHO, H);
    g.addColorStop(0, C.rojo); g.addColorStop(1, C.rojoOsc);
    ctx.fillStyle = g; ctx.fillRect(0, 0, ANCHO, H);
    // rayas en diagonal, muy suaves
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, ANCHO, H); ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 34;
    for (let x = -H; x < ANCHO + H; x += 96) {
      ctx.beginPath(); ctx.moveTo(x, H + 20); ctx.lineTo(x + H + 20, -20); ctx.stroke();
    }
    ctx.restore();

    circulo(ctx, MARGEN + 26, 62, 26, C.papel);
    texto(ctx, "SFC", MARGEN + 26, 70, f("800", 19), C.rojo, "center");
    texto(ctx, "FAMILIA ROJIBLANCA", MARGEN + 68, 72, f("800", 26), C.papel);
    ctx.globalAlpha = .8;
    texto(ctx, "Concurso de alineaciones", ANCHO - MARGEN, 72, f("400", 24), C.papel, "right");
    ctx.globalAlpha = 1;

    texto(ctx, `JORNADA ${j.numero}`, MARGEN, 200, f("900", 104), C.papel);
    const partido = j.en_casa ? `Sevilla – ${j.rival}` : `${j.rival} – Sevilla`;
    texto(ctx, recortar(ctx, partido, f("700", 46), ANCHO - MARGEN * 2), MARGEN, 262, f("700", 46), C.papel);
    ctx.globalAlpha = .8;
    texto(ctx, fecha, MARGEN, 306, f("400", 28), C.papel);
    ctx.globalAlpha = 1;
    return H;
  }

  // quién se ha llevado la jornada, montado sobre el borde de la cabecera
  function ganador(ctx, y, dia) {
    const mejor = dia[0];
    const ganadores = dia.filter(d => d.puntos === mejor.puntos && d.participo);
    return tarjeta(ctx, y, (x, y0, w) => {
      texto(ctx, "🏆", x, y0 + 62, f("400", 64), C.tinta);
      if (!ganadores.length || !mejor.puntos) {
        texto(ctx, "Jornada en blanco", x + 92, y0 + 34, f("800", 40), C.tinta);
        texto(ctx, "Nadie pasó de cinco aciertos. La próxima será.", x + 92, y0 + 74, f("400", 26), C.suave);
        return 84;
      }
      const nombres = ganadores.map(g => g.nombre);
      const rotulo = nombres.length === 1 ? nombres[0]
                   : nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1];
      texto(ctx, nombres.length === 1 ? "GANADOR DE LA JORNADA" : "GANADORES DE LA JORNADA",
            x + 92, y0 + 20, f("800", 20), C.rojo);
      texto(ctx, recortar(ctx, rotulo, f("800", 44), w - 92), x + 92, y0 + 62, f("800", 44), C.tinta);
      const pleno = mejor.aciertos === 11;
      texto(ctx, `${mejor.aciertos} de 11 aciertos · ${mejor.puntos} puntos${pleno ? " · ¡PLENO!" : ""}`,
            x + 92, y0 + 98, f("600", 26), pleno ? C.verde : C.suave);
      return 104;
    });
  }

  // la barra de 11 casillas: verdes las acertadas, rojas las falladas
  function barra(ctx, x, y, w, aciertos) {
    const hueco = 5, n = 11;
    const cw = (w - hueco * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      caja(ctx, x + i * (cw + hueco), y, cw, 16, 5, i < aciertos ? C.verde : C.rojoClaro);
    }
  }

  function clasificacionDia(ctx, y, dia, once, nombre) {
    return tarjeta(ctx, y, (x, y0, w) => {
      let yy = titulo(ctx, "📊", "Clasificación de la jornada", x, y0);
      yy += 8;
      dia.forEach((fila, i) => {
        if (i) { ctx.fillStyle = C.borde; ctx.fillRect(x, yy, w, 2); }
        yy += 22;
        const xN = x + 78;
        const anchoPuntos = 170;

        // medalla o número
        const medalla = { 1: "🥇", 2: "🥈", 3: "🥉" }[fila.puesto];
        if (medalla && fila.participo) texto(ctx, medalla, x + 28, yy + 44, f("400", 46), C.tinta, "center");
        else {
          circulo(ctx, x + 28, yy + 26, 26, C.fondo);
          texto(ctx, String(fila.puesto), x + 28, yy + 36, f("800", 26), C.suave, "center");
        }

        texto(ctx, recortar(ctx, fila.nombre, f("800", 38), w - 78 - anchoPuntos),
              xN, yy + 38, f("800", 38), fila.participo ? C.tinta : C.suave);
        texto(ctx, String(fila.puntos), x + w, yy + 44, f("900", 56), fila.puntos ? C.rojo : C.suave, "right");

        if (!fila.participo) {
          texto(ctx, "😴 No envió alineación", xN, yy + 78, f("400", 26, "italic"), C.suave);
          yy += 100;
          return;
        }

        yy += 60;
        barra(ctx, xN, yy, w - 78 - anchoPuntos, fila.aciertos);
        texto(ctx, `${fila.aciertos} de 11`, x + w, yy + 16, f("700", 24), C.suave, "right");
        yy += 30;

        const fallos = (fila.picks || []).filter(id => !once.includes(id)).map(nombre);
        if (fallos.length) {
          yy = etiquetas(ctx, fallos.map(n => `✕ ${n}`), xN, yy, w - 78,
                         { fuente: f("600", 23), relleno: C.rojoClaro, color: C.rojoOsc, alto: 40, hueco: 8 });
        } else {
          yy = etiquetas(ctx, ["✓ Los once, ¡pleno!"], xN, yy, w - 78,
                         { fuente: f("700", 23), relleno: C.verdeClaro, color: C.verde, alto: 40 });
        }
        yy += 22;
      });
      return yy - y0;
    });
  }

  // el once del Sevilla sobre el campo, como en la web
  function campo(ctx, y, once, jugador) {
    return tarjeta(ctx, y, (x, y0, w) => {
      let yy = titulo(ctx, "⚽", "Once inicial del Sevilla", x, y0);
      yy += 10;
      const H = 400;
      // césped a rayas
      ctx.save();
      caja(ctx, x, yy, w, H, 22, C.cesped1);
      ctx.clip();
      for (let i = 0; i < H / 60 + 1; i++) {
        ctx.fillStyle = i % 2 ? C.cesped2 : C.cesped1;
        ctx.fillRect(x, yy + i * 60, w, 60);
      }
      // líneas
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 3;
      ctx.strokeRect(x + 18, yy + 18, w - 36, H - 36);
      ctx.beginPath(); ctx.moveTo(x + 18, yy + H / 2); ctx.lineTo(x + w - 18, yy + H / 2); ctx.stroke();
      circulo(ctx, x + w / 2, yy + H / 2, 52, null, "rgba(255,255,255,.35)", 3);
      ctx.strokeRect(x + w / 2 - 150, yy + 18, 300, 56);
      ctx.strokeRect(x + w / 2 - 150, yy + H - 74, 300, 56);
      ctx.restore();

      // filas: delanteros arriba, portero abajo
      const grupos = { DEL: [], MED: [], DEF: [], POR: [] };
      once.forEach(id => {
        const jg = jugador(id) || { nombre: `#${id}`, dorsal: null, posicion: "MED" };
        (grupos[jg.posicion] || grupos.MED).push(jg);
      });
      const filas = ["DEL", "MED", "DEF", "POR"].map(k => grupos[k]).filter(g => g.length);
      const paso = (H - 40) / filas.length;
      filas.forEach((fila, i) => {
        const cy = yy + 20 + paso * i + paso / 2 - 14;
        const sep = Math.min(170, (w - 40) / fila.length);
        const x0 = x + w / 2 - sep * (fila.length - 1) / 2;
        fila.forEach((jg, k) => {
          const cx = x0 + sep * k;
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
          circulo(ctx, cx, cy, 30, C.papel);
          ctx.restore();
          circulo(ctx, cx, cy, 30, null, C.rojo, 4);
          texto(ctx, jg.dorsal == null ? "·" : String(jg.dorsal), cx, cy + 10, f("800", 26), C.rojo, "center");
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
          texto(ctx, recortar(ctx, jg.nombre, f("700", 23), sep - 8), cx, cy + 62, f("700", 23), C.papel, "center");
          ctx.restore();
        });
      });
      return yy + H - y0;
    });
  }

  function clasificacionGeneral(ctx, y, general, hoyDe, jornadasJugadas) {
    // cómo estaba cada uno antes de esta jornada, para las flechas
    const antes = puestos(general.map(t => ({ id: t.participante_id, puntos: t.puntos - hoyDe(t.participante_id) }))
                            .sort((a, b) => b.puntos - a.puntos));
    const puestoAntes = id => (antes.find(a => a.id === id) || {}).puesto;
    const hayAntes = jornadasJugadas > 1;

    return tarjeta(ctx, y, (x, y0, w) => {
      let yy = titulo(ctx, "🏁", "Clasificación general", x, y0);
      texto(ctx, `Después de ${jornadasJugadas} ${jornadasJugadas === 1 ? "jornada" : "jornadas"}`,
            x + 50, yy + 8, f("400", 25), C.suave);
      yy += 30;
      general.forEach((t, i) => {
        const alto = 76;
        if (t.puesto === 1) caja(ctx, x - 16, yy + 6, w + 32, alto - 12, 16, C.rojoClaro);
        else if (i) { ctx.fillStyle = C.borde; ctx.fillRect(x, yy, w, 2); }
        const cy = yy + alto / 2;

        const medalla = { 1: "🥇", 2: "🥈", 3: "🥉" }[t.puesto];
        if (medalla) texto(ctx, medalla, x + 28, cy + 16, f("400", 42), C.tinta, "center");
        else {
          circulo(ctx, x + 28, cy, 24, C.fondo);
          texto(ctx, String(t.puesto), x + 28, cy + 9, f("800", 24), C.suave, "center");
        }

        texto(ctx, recortar(ctx, t.nombre, f("800", 36), w - 78 - 330), x + 78, cy + 13, f("800", 36), C.tinta);

        // sube, baja o se queda
        if (hayAntes) {
          const pa = puestoAntes(t.participante_id);
          const mov = pa == null || pa === t.puesto ? { s: "＝", c: C.suave }
                    : pa > t.puesto ? { s: `▲${pa - t.puesto}`, c: C.verde }
                                    : { s: `▼${t.puesto - pa}`, c: C.rojo };
          texto(ctx, mov.s, x + w - 250, cy + 11, f("800", 28), mov.c, "right");
        }

        const hoy = hoyDe(t.participante_id);
        const chip = `+${hoy}`;
        const cw = ancho(ctx, chip, f("800", 24)) + 26;
        caja(ctx, x + w - 130 - cw, cy - 20, cw, 40, 20, hoy ? C.verdeClaro : C.fondo);
        texto(ctx, chip, x + w - 130 - cw / 2, cy + 9, f("800", 24), hoy ? C.verde : C.suave, "center");

        texto(ctx, String(t.puntos), x + w, cy + 16, f("900", 46), C.tinta, "right");
        yy += alto;
      });
      return yy - y0;
    });
  }

  /* ------------------------------------------------------------- imagen --- */

  /* datos:
       jornada         { numero, rival, en_casa, once_oficial }
       filas           las de api_jornada: nombre, participo, picks, aciertos, puntos
       general         la tabla de api_general: puesto, nombre, puntos, participante_id
       jornadasJugadas cuántas jornadas van puntuadas
       nombre          id de jugador -> nombre
       jugador         id de jugador -> { nombre, dorsal, posicion }
       fecha           el día y la hora ya escritos */
  async function imagen(datos) {
    const { jornada: j, filas, general, nombre, jugador, fecha, jornadasJugadas } = datos;
    const once = j.once_oficial || [];
    const dia = puestos(filas.slice().sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre)));
    const hoyDe = id => (filas.find(x => x.participante_id === id) || {}).puntos || 0;

    // se dibuja en un lienzo de sobra y al final se recorta a lo que ocupe
    const borrador = document.createElement("canvas");
    borrador.width = ANCHO; borrador.height = 7000;
    const ctx = borrador.getContext("2d");
    ctx.fillStyle = C.fondo; ctx.fillRect(0, 0, ANCHO, 7000);

    let y = cabecera(ctx, j, fecha);
    y = ganador(ctx, y - 40, dia) + 28;
    y = clasificacionDia(ctx, y, dia, once, nombre) + 28;
    y = campo(ctx, y, once, jugador) + 28;
    y = clasificacionGeneral(ctx, y, general, hoyDe, jornadasJugadas || 0) + 36;

    texto(ctx, "jmn88.github.io/familia-rojiblanca", ANCHO / 2, y + 22, f("400", 22), C.suave, "center");
    y += 22 + 44;

    const lienzo = document.createElement("canvas");
    lienzo.width = ANCHO; lienzo.height = Math.ceil(y);
    lienzo.getContext("2d").drawImage(borrador, 0, 0, ANCHO, y, 0, 0, ANCHO, y);
    return new Promise((listo, fallo) =>
      lienzo.toBlob(b => b ? listo(b) : fallo(new Error("No se ha podido generar la imagen.")), "image/png"));
  }

  /* --------------------------------------------------------- compartir --- */

  /* Devuelve cómo ha acabado: «compartido», «cancelado» o «descargado». */
  async function compartir(blob, nombreFichero) {
    const fichero = new File([blob], nombreFichero, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [fichero] })) {
      try {
        await navigator.share({ files: [fichero], title: nombreFichero });
        return "compartido";
      } catch (e) {
        if (e.name === "AbortError") return "cancelado";   // cerró la hoja sin elegir
        // cualquier otro fallo: se cae a la descarga
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nombreFichero;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return "descargado";
  }

  return { imagen, compartir };
})();
