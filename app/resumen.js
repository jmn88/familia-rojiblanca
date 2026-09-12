/* El resumen de la jornada como imagen, para compartirlo por WhatsApp.

   Se dibuja aquí mismo, en el navegador, sobre un <canvas>: no hace falta
   servidor, ni robot, ni librería. Lleva el partido, la clasificación del día
   con los jugadores que falló cada uno, el once del Sevilla y la clasificación
   general con lo que sumó cada uno esa jornada.

   En el móvil se abre la hoja de compartir del sistema (navigator.share), que
   ofrece WhatsApp directamente; donde eso no exista (ordenador) se descarga el
   PNG y se comparte a mano. */

const RESUMEN = (function () {

  const ANCHO  = 1080;   // WhatsApp lo enseña entero sin recortar
  const MARGEN = 56;
  const RELLENO = 40;    // dentro de cada tarjeta

  const C = {
    rojo: "#c8102e", rojoOsc: "#9c0c23", tinta: "#14161a", suave: "#6a7280",
    borde: "#e3e5ea", fondo: "#f2f3f5", papel: "#ffffff", verde: "#1a8a45",
    oro: "#e0a100", plata: "#9aa4b1", bronce: "#c27a3f"
  };
  const FUENTE = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const f = (peso, px, estilo = "") => `${estilo} ${peso} ${px}px ${FUENTE}`.trim();

  /* ------------------------------------------------------------ dibujo --- */

  function caja(ctx, x, y, w, h, r, relleno, borde) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
    if (borde)   { ctx.strokeStyle = borde; ctx.lineWidth = 2; ctx.stroke(); }
  }

  function circulo(ctx, x, y, r, relleno, borde) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
    if (borde)   { ctx.strokeStyle = borde; ctx.lineWidth = 2; ctx.stroke(); }
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

  // parte un texto en renglones que quepan
  function envolver(ctx, s, fuente, max) {
    const palabras = s.split(" ");
    const lineas = [];
    let actual = "";
    palabras.forEach(p => {
      const prueba = actual ? `${actual} ${p}` : p;
      if (ancho(ctx, prueba, fuente) <= max || !actual) actual = prueba;
      else { lineas.push(actual); actual = p; }
    });
    if (actual) lineas.push(actual);
    return lineas;
  }

  // Empates con el mismo puesto: 1, 1, 3…
  function puestos(filas) {
    let puesto = 0, previo = null;
    return filas.map((fila, i) => {
      if (fila.puntos !== previo) { puesto = i + 1; previo = fila.puntos; }
      return { ...fila, puesto };
    });
  }

  // medalla para los tres primeros; los demás, un número en gris
  function medalla(ctx, x, y, puesto) {
    const color = { 1: C.oro, 2: C.plata, 3: C.bronce }[puesto];
    circulo(ctx, x, y, 27, color || C.fondo, color ? null : C.borde);
    texto(ctx, String(puesto), x, y + 10, f("800", 27), color ? "#fff" : C.suave, "center");
  }

  /* ------------------------------------------------------------ tarjetas --- */

  /* Cada tarjeta se dibuja dos veces: primero a ciegas para saber cuánto
     mide, y luego de verdad con el fondo blanco debajo. Así no hay que
     calcular alturas a mano. */
  function tarjeta(ctx, y, dibujar) {
    const x = MARGEN, w = ANCHO - MARGEN * 2;
    ctx.save(); ctx.globalAlpha = 0; const alto = dibujar(x + RELLENO, y + RELLENO, w - RELLENO * 2); ctx.restore();
    const h = alto + RELLENO * 2;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.08)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
    caja(ctx, x, y, w, h, 24, C.papel);
    ctx.restore();
    caja(ctx, x, y, w, h, 24, null, C.borde);
    dibujar(x + RELLENO, y + RELLENO, w - RELLENO * 2);
    return y + h;
  }

  function titulo(ctx, s, x, y, sub) {
    texto(ctx, s, x, y + 30, f("800", 34), C.tinta);
    if (sub) { texto(ctx, sub, x, y + 66, f("400", 25), C.suave); return y + 92; }
    return y + 58;
  }

  function separador(ctx, x, y, w) {
    ctx.fillStyle = C.borde; ctx.fillRect(x, y, w, 2);
  }

  /* ------------------------------------------------------------- imagen --- */

  /* datos:
       jornada         { numero, rival, en_casa, once_oficial }
       filas           las de api_jornada: nombre, participo, picks, aciertos, puntos
       general         la tabla de api_general: puesto, nombre, puntos, participante_id
       jornadasJugadas cuántas jornadas van puntuadas
       nombre          id de jugador -> nombre
       fecha           el día y la hora ya escritos */
  async function imagen(datos) {
    const { jornada: j, filas, general, nombre, fecha, jornadasJugadas } = datos;
    const once = j.once_oficial || [];
    const partido = j.en_casa ? `Sevilla – ${j.rival}` : `${j.rival} – Sevilla`;

    const dia = puestos(filas.slice().sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre)));
    const hoyDe = id => (filas.find(x => x.participante_id === id) || {}).puntos || 0;

    // se dibuja en un lienzo de sobra y al final se recorta a lo que ocupe
    const borrador = document.createElement("canvas");
    borrador.width = ANCHO; borrador.height = 6000;
    const ctx = borrador.getContext("2d");
    ctx.fillStyle = C.fondo; ctx.fillRect(0, 0, ANCHO, 6000);

    // --- cabecera roja
    let y = 0;
    ctx.fillStyle = C.rojo; ctx.fillRect(0, 0, ANCHO, 190);
    ctx.fillStyle = C.rojoOsc; ctx.fillRect(0, 184, ANCHO, 6);
    circulo(ctx, MARGEN + 44, 95, 44, C.papel);
    texto(ctx, "SFC", MARGEN + 44, 106, f("800", 30), C.rojo, "center");
    texto(ctx, "Familia Rojiblanca", MARGEN + 112, 88, f("800", 46), C.papel);
    ctx.globalAlpha = .85;
    texto(ctx, "Concurso de alineaciones · LaLiga 26/27", MARGEN + 112, 130, f("400", 26), C.papel);
    ctx.globalAlpha = 1;
    texto(ctx, `JORNADA ${j.numero}`, ANCHO - MARGEN, 118, f("800", 40), C.papel, "right");
    y = 190;

    // --- el partido
    y += 56;
    texto(ctx, recortar(ctx, partido, f("800", 54), ANCHO - MARGEN * 2), MARGEN, y + 44, f("800", 54), C.tinta);
    y += 44 + 16;
    texto(ctx, fecha, MARGEN, y + 30, f("400", 28), C.suave);
    y += 30 + 40;

    // --- clasificación de la jornada
    y = tarjeta(ctx, y, (x, y0, w) => {
      let yy = titulo(ctx, "Clasificación de la jornada", x, y0);
      yy += 6;
      dia.forEach((fila, i) => {
        if (i) { separador(ctx, x, yy, w); }
        yy += 24;
        const cy = yy + 22;
        medalla(ctx, x + 27, cy, fila.puesto);

        const xNombre = x + 76;
        const anchoPuntos = 150;
        texto(ctx, recortar(ctx, fila.nombre, f("800", 36), w - 76 - anchoPuntos - 20),
              xNombre, cy + 12, f("800", 36), fila.participo ? C.tinta : C.suave);

        // puntos a la derecha, y debajo los aciertos
        texto(ctx, String(fila.puntos), x + w, cy + 14, f("800", 46), fila.puntos ? C.rojo : C.suave, "right");
        if (fila.participo) {
          texto(ctx, `${fila.aciertos} de 11`, x + w, cy + 46, f("400", 24), C.suave, "right");
        }
        yy = cy + 22;

        // qué falló
        let lineas;
        if (!fila.participo) {
          lineas = [{ s: "No participó", fuente: f("400", 26, "italic"), color: C.suave }];
        } else {
          const fallos = (fila.picks || []).filter(id => !once.includes(id)).map(nombre);
          lineas = fallos.length
            ? envolver(ctx, `Falló: ${fallos.join(", ")}`, f("400", 26), w - 76 - anchoPuntos)
                .map(s => ({ s, fuente: f("400", 26), color: C.suave }))
            : [{ s: "¡Pleno! Los once.", fuente: f("700", 26), color: C.verde }];
        }
        lineas.forEach(l => { yy += 34; texto(ctx, l.s, xNombre, yy, l.fuente, l.color); });
        yy += 22;
      });
      return yy - y0;
    });

    // --- el once del Sevilla
    y += 28;
    y = tarjeta(ctx, y, (x, y0, w) => {
      let yy = titulo(ctx, "Once inicial del Sevilla", x, y0);
      const fuente = f("600", 26);
      let cx = x, alto = 48, hueco = 12;
      yy += 4;
      once.map(nombre).forEach(n => {
        const tw = ancho(ctx, n, fuente) + 36;
        if (cx + tw > x + w) { cx = x; yy += alto + hueco; }
        caja(ctx, cx, yy, tw, alto, 24, C.fondo, C.borde);
        texto(ctx, n, cx + tw / 2, yy + 33, fuente, C.tinta, "center");
        cx += tw + hueco;
      });
      return yy + alto - y0;
    });

    // --- clasificación general
    y += 28;
    y = tarjeta(ctx, y, (x, y0, w) => {
      const n = jornadasJugadas || 0;
      let yy = titulo(ctx, "Clasificación general", x, y0,
                      `Después de ${n} ${n === 1 ? "jornada" : "jornadas"}`);
      yy += 6;
      general.forEach((t, i) => {
        if (i) separador(ctx, x, yy, w);
        yy += 16;
        const cy = yy + 26;
        medalla(ctx, x + 27, cy, t.puesto);
        texto(ctx, recortar(ctx, t.nombre, f("800", 34), w - 76 - 260), x + 76, cy + 12, f("800", 34), C.tinta);
        texto(ctx, String(t.puntos), x + w, cy + 14, f("800", 40), C.tinta, "right");
        const hoy = hoyDe(t.participante_id);
        texto(ctx, `+${hoy}`, x + w - 130, cy + 12, f("700", 28), hoy ? C.verde : C.suave, "right");
        yy = cy + 26 + 16;
      });
      return yy - y0;
    });

    // --- pie
    y += 36;
    texto(ctx, "jmn88.github.io/familia-rojiblanca", ANCHO / 2, y + 22, f("400", 22), C.suave, "center");
    y += 22 + 44;

    // --- recorte al alto que ocupa
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
