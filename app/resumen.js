/* El resumen de la jornada como imagen, para compartirlo por WhatsApp.

   Se dibuja aquí mismo, en el navegador, sobre un <canvas>: no hace falta
   servidor, ni robot, ni librería. Lleva el partido y quién ganó la jornada en
   la cabecera; debajo, a dos columnas, la clasificación del día (con los
   aciertos de cada uno y a quién falló) y la general (con lo que sumó cada uno
   y si sube o baja); y abajo del todo el once del Sevilla sobre el campo.

   Va a dos columnas a propósito: una imagen alargada WhatsApp la enseña
   recortada hasta que la abres, y así queda casi cuadrada y se ve entera en el
   propio chat.

   En el móvil se abre la hoja de compartir del sistema (navigator.share), que
   ofrece WhatsApp directamente; donde eso no exista (ordenador) se descarga el
   PNG y se comparte a mano.

   Los emojis los pinta el propio sistema con su fuente de emojis, así que se
   ven como en cualquier otra aplicación del móvil. */

const RESUMEN = (function () {

  const ANCHO  = 1440;   // ancho de sobra para dos columnas; WhatsApp lo reduce solo
  const MARGEN = 44;
  const HUECO  = 26;     // entre las dos columnas
  const RELLENO = 32;    // dentro de cada tarjeta

  const C = {
    rojo: "#c8102e", rojoOsc: "#8e0b21", rojoClaro: "#fbe9ec",
    tinta: "#14161a", suave: "#6a7280", borde: "#e6e8ed", fondo: "#f3f4f6", papel: "#ffffff",
    verde: "#1a8a45", verdeClaro: "#e2f4e8", cesped1: "#2a7f4b", cesped2: "#256e42"
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

  // parte un texto en renglones que quepan
  function envolver(ctx, s, fuente, max) {
    const lineas = [];
    let actual = "";
    s.split(" ").forEach(p => {
      const prueba = actual ? `${actual} ${p}` : p;
      if (ancho(ctx, prueba, fuente) <= max || !actual) actual = prueba;
      else { lineas.push(actual); actual = p; }
    });
    if (actual) lineas.push(actual);
    return lineas;
  }

  // Empates con el mismo puesto: 1, 1, 3…
  function puestos(filas, campo = "puntos") {
    let puesto = 0, previo = null;
    return filas.map((fila, i) => {
      if (fila[campo] !== previo) { puesto = i + 1; previo = fila[campo]; }
      return { ...fila, puesto };
    });
  }

  // medalla para los tres primeros; los demás, un número en gris
  function medalla(ctx, x, y, puesto, conMedalla = true) {
    const emoji = { 1: "🥇", 2: "🥈", 3: "🥉" }[puesto];
    if (emoji && conMedalla) { texto(ctx, emoji, x, y + 16, f("400", 40), C.tinta, "center"); return; }
    circulo(ctx, x, y, 22, C.fondo);
    texto(ctx, String(puesto), x, y + 8, f("800", 22), C.suave, "center");
  }

  /* Una tarjeta blanca. Se dibuja dos veces: primero a ciegas para saber
     cuánto mide, y luego de verdad con el fondo debajo. Con altoMin se
     igualan las dos columnas. */
  function tarjeta(ctx, x, y, w, dibujar, altoMin = 0) {
    ctx.save(); ctx.globalAlpha = 0;
    const alto = dibujar(ctx, x + RELLENO, y + RELLENO, w - RELLENO * 2);
    ctx.restore();
    const h = Math.max(alto + RELLENO * 2, altoMin);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.09)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
    caja(ctx, x, y, w, h, 24, C.papel);
    ctx.restore();
    dibujar(ctx, x + RELLENO, y + RELLENO, w - RELLENO * 2);
    return h;
  }

  // solo mide, sin pintar
  function medir(ctx, x, y, w, dibujar) {
    ctx.save(); ctx.globalAlpha = 0;
    const alto = dibujar(ctx, x + RELLENO, y + RELLENO, w - RELLENO * 2);
    ctx.restore();
    return alto + RELLENO * 2;
  }

  function titulo(ctx, emoji, s, x, y, sub) {
    texto(ctx, emoji, x, y + 30, f("400", 30), C.tinta);
    texto(ctx, s, x + 44, y + 30, f("800", 32), C.tinta);
    if (sub) texto(ctx, sub, x + 44, y + 58, f("400", 22), C.suave);
    return y + (sub ? 78 : 54);
  }

  /* ----------------------------------------------------------- piezas --- */

  // la cabecera roja con las rayas del Sevilla, y el ganador a la derecha
  function cabecera(ctx, j, fecha, dia) {
    const H = 250;
    const g = ctx.createLinearGradient(0, 0, ANCHO, H);
    g.addColorStop(0, C.rojo); g.addColorStop(1, C.rojoOsc);
    ctx.fillStyle = g; ctx.fillRect(0, 0, ANCHO, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, ANCHO, H); ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 34;
    for (let x = -H; x < ANCHO + H; x += 96) {
      ctx.beginPath(); ctx.moveTo(x, H + 20); ctx.lineTo(x + H + 20, -20); ctx.stroke();
    }
    ctx.restore();

    circulo(ctx, MARGEN + 24, 52, 24, C.papel);
    texto(ctx, "SFC", MARGEN + 24, 59, f("800", 17), C.rojo, "center");
    texto(ctx, "FAMILIA ROJIBLANCA", MARGEN + 62, 61, f("800", 24), C.papel);
    ctx.globalAlpha = .8;
    texto(ctx, "· Concurso de alineaciones", MARGEN + 62 + ancho(ctx, "FAMILIA ROJIBLANCA", f("800", 24)) + 12, 61, f("400", 22), C.papel);
    ctx.globalAlpha = 1;

    const anchoIzq = ANCHO / 2 + 40;
    texto(ctx, `JORNADA ${j.numero}`, MARGEN, 158, f("900", 82), C.papel);
    const partido = j.en_casa ? `Sevilla – ${j.rival}` : `${j.rival} – Sevilla`;
    texto(ctx, recortar(ctx, partido, f("700", 36), anchoIzq - MARGEN), MARGEN, 202, f("700", 36), C.papel);
    ctx.globalAlpha = .8;
    texto(ctx, fecha, MARGEN, 234, f("400", 24), C.papel);
    ctx.globalAlpha = 1;

    // el ganador, en una tarjeta blanca a la derecha
    const mejor = dia[0];
    const ganadores = dia.filter(d => d.puntos === mejor.puntos && d.participo);
    const cx = anchoIzq + 40, cw = ANCHO - MARGEN - cx, cy = 96, ch = 124;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
    caja(ctx, cx, cy, cw, ch, 20, C.papel);
    ctx.restore();
    texto(ctx, "🏆", cx + 22, cy + 82, f("400", 54), C.tinta);
    const tx = cx + 100;
    if (!ganadores.length || !mejor.puntos) {
      texto(ctx, "JORNADA EN BLANCO", tx, cy + 34, f("800", 18), C.rojo);
      texto(ctx, "Nadie pasó de cinco", tx, cy + 72, f("800", 34), C.tinta);
      texto(ctx, "La próxima será.", tx, cy + 104, f("400", 22), C.suave);
    } else {
      const nombres = ganadores.map(x => x.nombre);
      const rotulo = nombres.length === 1 ? nombres[0]
                   : nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1];
      texto(ctx, nombres.length === 1 ? "GANADOR DE LA JORNADA" : "GANADORES DE LA JORNADA", tx, cy + 34, f("800", 18), C.rojo);
      texto(ctx, recortar(ctx, rotulo, f("800", 36), cw - 100 - 22), tx, cy + 72, f("800", 36), C.tinta);
      const pleno = mejor.aciertos === 11;
      texto(ctx, `${mejor.aciertos} de 11 aciertos · ${mejor.puntos} puntos${pleno ? " · ¡PLENO!" : ""}`,
            tx, cy + 104, f("600", 22), pleno ? C.verde : C.suave);
    }
    return H;
  }

  // la barra de 11 casillas: verdes las acertadas, rojas las falladas
  function barra(ctx, x, y, w, aciertos) {
    const hueco = 4, n = 11;
    const cw = (w - hueco * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      caja(ctx, x + i * (cw + hueco), y, cw, 14, 4, i < aciertos ? C.verde : C.rojoClaro);
    }
  }

  // columna izquierda
  const clasificacionDia = (dia, once, nombre) => (ctx, x, y0, w) => {
    let yy = titulo(ctx, "📊", "Clasificación de la jornada", x, y0);
    yy += 6;
    const xN = x + 58, anchoPuntos = 120;
    dia.forEach((fila, i) => {
      if (i) { ctx.fillStyle = C.borde; ctx.fillRect(x, yy, w, 2); }
      yy += 16;
      medalla(ctx, x + 22, yy + 22, fila.puesto, fila.participo);
      texto(ctx, recortar(ctx, fila.nombre, f("800", 32), w - 58 - anchoPuntos),
            xN, yy + 33, f("800", 32), fila.participo ? C.tinta : C.suave);
      texto(ctx, String(fila.puntos), x + w, yy + 36, f("900", 44), fila.puntos ? C.rojo : C.suave, "right");

      if (!fila.participo) {
        texto(ctx, "😴 No envió alineación", xN, yy + 66, f("400", 23, "italic"), C.suave);
        yy += 82;
        return;
      }
      yy += 50;
      barra(ctx, xN, yy, w - 58 - anchoPuntos, fila.aciertos);
      texto(ctx, `${fila.aciertos} de 11`, x + w, yy + 14, f("700", 21), C.suave, "right");
      yy += 22;

      const fallos = (fila.picks || []).filter(id => !once.includes(id)).map(nombre);
      const lineas = fallos.length
        ? envolver(ctx, "✕  " + fallos.join("  ·  "), f("600", 23), w - 58).map(s => ({ s, c: C.rojoOsc, fu: f("600", 23) }))
        : [{ s: "✓  Los once, ¡pleno!", c: C.verde, fu: f("700", 23) }];
      lineas.forEach(l => { yy += 28; texto(ctx, l.s, xN, yy, l.fu, l.c); });
      yy += 16;
    });
    return yy - y0;
  };

  // columna derecha
  const clasificacionGeneral = (general, hoyDe, jornadasJugadas, altoFila = 70) => (ctx, x, y0, w) => {
    const antes = puestos(general.map(t => ({ id: t.participante_id, puntos: t.puntos - hoyDe(t.participante_id) }))
                            .sort((a, b) => b.puntos - a.puntos));
    const puestoAntes = id => (antes.find(a => a.id === id) || {}).puesto;
    const hayAntes = jornadasJugadas > 1;

    let yy = titulo(ctx, "🏁", "Clasificación general", x, y0,
                    `Después de ${jornadasJugadas} ${jornadasJugadas === 1 ? "jornada" : "jornadas"}`);
    yy += 6;
    general.forEach((t, i) => {
      const alto = altoFila;
      if (t.puesto === 1) caja(ctx, x - 14, yy + 5, w + 28, alto - 10, 14, C.rojoClaro);
      else if (i) { ctx.fillStyle = C.borde; ctx.fillRect(x, yy, w, 2); }
      const cy = yy + alto / 2;
      medalla(ctx, x + 22, cy, t.puesto);
      texto(ctx, recortar(ctx, t.nombre, f("800", 32), w - 58 - 290), x + 58, cy + 11, f("800", 32), C.tinta);

      if (hayAntes) {
        const pa = puestoAntes(t.participante_id);
        const mov = pa == null || pa === t.puesto ? { s: "＝", c: C.suave }
                  : pa > t.puesto ? { s: `▲${pa - t.puesto}`, c: C.verde }
                                  : { s: `▼${t.puesto - pa}`, c: C.rojo };
        texto(ctx, mov.s, x + w - 215, cy + 9, f("800", 24), mov.c, "right");
      }
      const hoy = hoyDe(t.participante_id);
      const chip = `+${hoy}`;
      const cw = ancho(ctx, chip, f("800", 22)) + 24;
      caja(ctx, x + w - 110 - cw, cy - 18, cw, 36, 18, hoy ? C.verdeClaro : C.fondo);
      texto(ctx, chip, x + w - 110 - cw / 2, cy + 8, f("800", 22), hoy ? C.verde : C.suave, "center");
      texto(ctx, String(t.puntos), x + w, cy + 14, f("900", 40), C.tinta, "right");
      yy += alto;
    });
    return yy - y0;
  };

  // abajo: el once sobre el campo, en horizontal (portero a la izquierda)
  const campo = (once, jugador) => (ctx, x, y0, w) => {
    let yy = titulo(ctx, "⚽", "Once inicial del Sevilla", x, y0);
    yy += 8;
    const H = 330;
    ctx.save();
    caja(ctx, x, yy, w, H, 20, C.cesped1);
    ctx.clip();
    for (let i = 0; i < w / 90 + 1; i++) {
      ctx.fillStyle = i % 2 ? C.cesped2 : C.cesped1;
      ctx.fillRect(x + i * 90, yy, 90, H);
    }
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 3;
    ctx.strokeRect(x + 16, yy + 16, w - 32, H - 32);
    ctx.beginPath(); ctx.moveTo(x + w / 2, yy + 16); ctx.lineTo(x + w / 2, yy + H - 16); ctx.stroke();
    circulo(ctx, x + w / 2, yy + H / 2, 48, null, "rgba(255,255,255,.35)", 3);
    ctx.strokeRect(x + 16, yy + H / 2 - 90, 90, 180);
    ctx.strokeRect(x + w - 106, yy + H / 2 - 90, 90, 180);
    ctx.restore();

    const grupos = { POR: [], DEF: [], MED: [], DEL: [] };
    once.forEach(id => {
      const jg = jugador(id) || { nombre: `#${id}`, dorsal: null, posicion: "MED" };
      (grupos[jg.posicion] || grupos.MED).push(jg);
    });
    const columnas = ["POR", "DEF", "MED", "DEL"].map(k => grupos[k]).filter(g => g.length);
    const pasoX = (w - 120) / columnas.length;
    columnas.forEach((col, i) => {
      const cx = x + 60 + pasoX * i + pasoX / 2;
      const pasoY = Math.min(78, (H - 30) / col.length);
      const y1 = yy + H / 2 - pasoY * (col.length - 1) / 2;
      col.forEach((jg, k) => {
        const cy = y1 + pasoY * k;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
        circulo(ctx, cx - 60, cy, 24, C.papel);
        ctx.restore();
        circulo(ctx, cx - 60, cy, 24, null, C.rojo, 3);
        texto(ctx, jg.dorsal == null ? "·" : String(jg.dorsal), cx - 60, cy + 8, f("800", 21), C.rojo, "center");
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        texto(ctx, recortar(ctx, jg.nombre, f("700", 24), pasoX - 100), cx - 28, cy + 9, f("700", 24), C.papel);
        ctx.restore();
      });
    });
    return yy + H - y0;
  };

  /* ------------------------------------------------------------- imagen --- */

  /* datos:
       jornada         { numero, rival, en_casa, once_oficial }
       filas           las de api_jornada: nombre, participo, picks, aciertos, puntos
       general         la tabla de api_general: puesto, nombre, puntos, participante_id
       jornadasJugadas cuántas jornadas van puntuadas
       nombre          id de jugador -> nombre
       jugador         id de jugador -> { nombre, dorsal, posicion }
       fecha           el día y la hora ya escritos

     lienzo() devuelve el <canvas> ya pintado, y lo hace de un tirón, sin
     esperas: así lo puede usar también el robot que manda el correo de
     resultados (robot/resumen_imagen.py), que abre esta misma función en un
     Chrome sin ventana y se lleva el PNG. Es la misma imagen que la de
     WhatsApp porque es el mismo código. imagen() es lo que usa la web: el
     mismo lienzo convertido en fichero. */
  function lienzo(datos) {
    const { jornada: j, filas, general, nombre, jugador, fecha, jornadasJugadas } = datos;
    const once = j.once_oficial || [];
    const dia = puestos(filas.slice().sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre)));
    const hoyDe = id => (filas.find(x => x.participante_id === id) || {}).puntos || 0;

    // se dibuja en un lienzo de sobra y al final se recorta a lo que ocupe
    const borrador = document.createElement("canvas");
    borrador.width = ANCHO; borrador.height = 5000;
    const ctx = borrador.getContext("2d");
    ctx.fillStyle = C.fondo; ctx.fillRect(0, 0, ANCHO, 5000);

    let y = cabecera(ctx, j, fecha, dia) + 28;

    // las dos columnas, a la misma altura
    const wCol = (ANCHO - MARGEN * 2 - HUECO) / 2;
    const izq = clasificacionDia(dia, once, nombre);
    let der = clasificacionGeneral(general, hoyDe, jornadasJugadas || 0);
    const altoIzq = medir(ctx, MARGEN, y, wCol, izq);
    const altoDer = medir(ctx, MARGEN + wCol + HUECO, y, wCol, der);
    // la general suele ser más corta: sus filas se estiran (hasta un tope)
    // para que las dos columnas acaben a la misma altura sin dejar hueco
    if (altoDer < altoIzq && general.length) {
      const extra = Math.min(44, (altoIzq - altoDer) / general.length);
      der = clasificacionGeneral(general, hoyDe, jornadasJugadas || 0, 70 + extra);
    }
    const alto = Math.max(altoIzq, altoDer);
    tarjeta(ctx, MARGEN, y, wCol, izq, alto);
    tarjeta(ctx, MARGEN + wCol + HUECO, y, wCol, der, alto);
    y += alto + 28;

    y += tarjeta(ctx, MARGEN, y, ANCHO - MARGEN * 2, campo(once, jugador)) + 30;

    texto(ctx, "jmn88.github.io/familia-rojiblanca", ANCHO / 2, y + 20, f("400", 22), C.suave, "center");
    y += 20 + 40;

    const final = document.createElement("canvas");
    final.width = ANCHO; final.height = Math.ceil(y);
    final.getContext("2d").drawImage(borrador, 0, 0, ANCHO, y, 0, 0, ANCHO, y);
    return final;
  }

  async function imagen(datos) {
    const final = lienzo(datos);
    return new Promise((listo, fallo) =>
      final.toBlob(b => b ? listo(b) : fallo(new Error("No se ha podido generar la imagen.")), "image/png"));
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

  return { lienzo, imagen, compartir };
})();
