/* Lectura de la foto de la convocatoria.

   El Sevilla publica la convocatoria como una imagen: dorsal y apellido, a una o
   dos columnas, en letras claras sobre una foto oscura. Aquí se lee esa imagen y
   se traduce a jugadores de la plantilla.

   Todo ocurre dentro del navegador del administrador: la foto no se sube a
   ningún sitio ni se guarda en la base de datos. Lo único que viaja al servidor
   es la lista de jugadores, y solo cuando el administrador le da a guardar.

   El lector de texto (tesseract.js) se descarga de internet la primera vez que
   se usa, no al abrir la web: quien no toca esta pantalla no descarga nada.

   Nunca se guarda nada a ciegas: esto propone una lista y el administrador la
   repasa. Un fallo de lectura se arregla con un toque en la pantalla siguiente. */

const CONVOCATORIA = (function () {

  const LECTOR = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const ANCHO  = 1600;   // a la imagen pequeña se le sacan pocas letras: se agranda

  /* ------------------------------------------------- descarga del lector --- */

  let descarga = null;

  function lector() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!descarga) {
      descarga = new Promise((listo, fallo) => {
        const s = document.createElement("script");
        s.src = LECTOR;
        s.async = true;
        s.onload = () => window.Tesseract
          ? listo(window.Tesseract)
          : fallo(new Error("El lector de texto se ha descargado a medias. Inténtalo otra vez."));
        s.onerror = () => {
          descarga = null;
          s.remove();
          fallo(new Error("No se ha podido descargar el lector de texto: hace falta conexión a internet. "
                        + "Mientras tanto puedes marcar los convocados a mano."));
        };
        document.head.appendChild(s);
      });
    }
    return descarga;
  }

  /* ----------------------------------------------- preparación de la foto --- */

  async function aLienzo(fichero) {
    let img;
    try {
      // 'from-image' respeta la orientación de las fotos hechas con el móvil
      img = await createImageBitmap(fichero, { imageOrientation: "from-image" });
    } catch {
      img = await new Promise((listo, fallo) => {
        const i = new Image();
        i.onload  = () => listo(i);
        i.onerror = () => fallo(new Error("Ese fichero no parece una imagen."));
        i.src = URL.createObjectURL(fichero);
      });
    }
    const ancho = img.width || img.naturalWidth;
    const alto  = img.height || img.naturalHeight;
    if (!ancho || !alto) throw new Error("Ese fichero no parece una imagen.");

    const escala = Math.min(3, Math.max(1, ANCHO / ancho));
    const lienzo = document.createElement("canvas");
    lienzo.width  = Math.round(ancho * escala);
    lienzo.height = Math.round(alto  * escala);
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return lienzo;
  }

  // Umbral de Otsu: parte el histograma por donde mejor separa fondo y letras.
  function umbralOtsu(histograma, total) {
    let suma = 0;
    for (let t = 0; t < 256; t++) suma += t * histograma[t];
    let sumaB = 0, pesoB = 0, mejor = 0, umbral = 127;
    for (let t = 0; t < 256; t++) {
      pesoB += histograma[t];
      if (!pesoB) continue;
      const pesoF = total - pesoB;
      if (!pesoF) break;
      sumaB += t * histograma[t];
      const mediaB = sumaB / pesoB;
      const mediaF = (suma - sumaB) / pesoF;
      const entre = pesoB * pesoF * (mediaB - mediaF) * (mediaB - mediaF);
      if (entre > mejor) { mejor = entre; umbral = t; }
    }
    return umbral;
  }

  /* Deja la imagen en blanco y negro puros, que es como mejor lee tesseract.

     Se mira el canal más alto de cada píxel (no el brillo medio): los dorsales
     van en rojo, que es oscuro de brillo pero altísimo de rojo, y con el brillo
     medio se perderían contra el fondo.

     Si el fondo es oscuro y las letras claras — el caso del Sevilla — se
     invierte, porque el lector espera letra negra sobre papel blanco. */
  function aBlancoYNegro(lienzo) {
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    const imagen = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const d = imagen.data;
    const total = d.length / 4;
    const canal = new Uint8Array(total);
    const histograma = new Uint32Array(256);

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = Math.max(d[i], d[i + 1], d[i + 2]);
      canal[p] = v;
      histograma[v]++;
    }

    const umbral = umbralOtsu(histograma, total);
    let oscuros = 0;
    for (let t = 0; t <= umbral; t++) oscuros += histograma[t];
    const letraClara = oscuros > total / 2;      // manda el fondo, que es lo que más hay

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const claro = canal[p] > umbral;
      const esLetra = letraClara ? claro : !claro;
      const v = esLetra ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(imagen, 0, 0);
    return lienzo;
  }

  /* ------------------------------------------------------------- lectura --- */

  const FASES = {
    "loading tesseract core":  "preparando el lector",
    "initializing tesseract":  "preparando el lector",
    "initializing api":        "preparando el lector",
    "loading language traineddata": "descargando el diccionario",
    "loading language traineddata (from cache)": "cargando el diccionario",
    "recognizing text":        "leyendo la foto"
  };

  async function abrirTrabajador(alProgreso) {
    const T = await lector();
    return T.createWorker("spa", 1, {
      logger: m => {
        if (!alProgreso) return;
        const fase = FASES[m.status];
        if (fase) alProgreso(`${fase}… ${Math.round((m.progress || 0) * 100)} %`);
      }
    });
  }

  // 6 = un bloque de texto corrido; 11 = texto suelto repartido por la imagen.
  // Con dos columnas y una foto de fondo, cada modo acierta en casos distintos.
  async function leer(trabajador, lienzo, modo) {
    await trabajador.setParameters({ tessedit_pageseg_mode: String(modo) });
    const { data } = await trabajador.recognize(lienzo);
    return (data && data.text) || "";
  }

  /* --------------------------------------------- del texto a candidatos --- */

  // Letras que el lector confunde con cifras al leer un dorsal suelto.
  const COMO_CIFRA = { O: "0", D: "0", Q: "0", I: "1", L: "1", "|": "1", "/": "1", Z: "2", S: "5", B: "8", G: "6" };

  function comoDorsal(trozo, primero) {
    const limpio = trozo.replace(/[^0-9A-Za-z|/]/g, "");
    if (!limpio || limpio.length > 2) return null;
    const cifras = limpio.toUpperCase().split("").map(c => /[0-9]/.test(c) ? c : COMO_CIFRA[c]);
    if (cifras.some(c => c === undefined)) return null;
    // "IO" podría ser 10, pero también el final de una palabra suelta: solo se
    // acepta un dorsal sin ninguna cifra de verdad si abre la línea.
    if (!primero && !/[0-9]/.test(limpio)) return null;
    const n = Number(cifras.join(""));
    return n >= 1 && n <= 99 ? n : null;
  }

  /* Recorre el texto y va formando fichas «dorsal + palabras». Sirve tanto si
     cada jugador cae en su línea como si el lector junta las dos columnas en
     una sola («1 ODYSSEAS 17 SUAZO»): cada cifra abre una ficha nueva. */
  /* El cartel del club separa mucho las letras, y entonces el lector devuelve
     «E J U K E» en vez de «EJUKE». Antes de nada se vuelven a pegar las letras
     sueltas seguidas: si no, cada una parecería basura y el jugador entero se
     perdía sin dejar rastro. Una inicial suelta («A.» de A. Castrín) se queda
     como estaba, porque va pegada a una palabra de verdad. */
  function pegarSueltas(trozos) {
    const salida = [];
    let sueltas = [];
    const vaciar = () => {
      if (sueltas.length) salida.push(sueltas.join(""));
      sueltas = [];
    };
    trozos.forEach(t => {
      if (/^[A-Za-zÀ-ÿ]$/.test(t)) sueltas.push(t);
      else { vaciar(); salida.push(t); }
    });
    vaciar();
    return salida;
  }

  function candidatos(texto) {
    const fichas = [];
    texto.split(/\r?\n/).forEach(linea => {
      const trozos = pegarSueltas(linea.trim().split(/[\s·•.,;:_]+/).filter(Boolean));
      let ficha = null;
      // Una ficha con dorsal se guarda aunque no se le haya sacado el nombre:
      // asi al menos sale en la lista de dudosos y se resuelve de un toque.
      const cerrar = () => {
        if (ficha && (ficha.palabras.length || ficha.dorsal != null)) fichas.push(ficha);
        ficha = null;
      };

      trozos.forEach((trozo, i) => {
        const dorsal = comoDorsal(trozo, i === 0);
        if (dorsal !== null) { cerrar(); ficha = { dorsal, palabras: [] }; return; }
        const palabra = trozo.replace(/[^A-Za-zÀ-ÿ'-]/g, "");
        if (palabra.replace(/[^A-Za-zÀ-ÿ]/g, "").length < 2) return;   // basura suelta
        if (!ficha) ficha = { dorsal: null, palabras: [] };
        if (ficha.palabras.length < 4) ficha.palabras.push(palabra);
      });
      cerrar();
    });
    return fichas;
  }

  /* ------------------------------------------ comparación con la plantilla --- */

  // «Agoumé» y «AGOUME» son el mismo jugador: se comparan sin tildes ni signos.
  const TILDES = {
    "Á": "A", "À": "A", "Ä": "A", "Â": "A", "É": "E", "È": "E", "Ë": "E", "Ê": "E",
    "Í": "I", "Ì": "I", "Ï": "I", "Î": "I", "Ó": "O", "Ò": "O", "Ö": "O", "Ô": "O",
    "Ú": "U", "Ù": "U", "Ü": "U", "Û": "U", "Ñ": "N", "Ç": "C"
  };
  const normal = s => String(s ?? "").toUpperCase()
    .replace(/[^A-Z0-9]/g, c => TILDES[c] || " ")
    .replace(/ +/g, " ").trim();

  // Se tiran las iniciales sueltas: «F. González» y «Fran González» han de casar.
  function piezas(nombre) {
    const todas = normal(nombre).split(" ").filter(Boolean);
    const largas = todas.filter(p => p.length >= 3);
    return largas.length ? largas : todas;
  }

  function distancia(a, b) {
    if (a === b) return 0;
    const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previo = fila[0];
      fila[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const guardado = fila[j];
        fila[j] = Math.min(
          fila[j] + 1,                                   // borrar
          fila[j - 1] + 1,                               // insertar
          previo + (a[i - 1] === b[j - 1] ? 0 : 1)       // cambiar
        );
        previo = guardado;
      }
    }
    return fila[b.length];
  }

  const parecidoPalabra = (a, b) =>
    !a || !b ? 0 : 1 - distancia(a, b) / Math.max(a.length, b.length);

  /* Cuánto se parecen dos nombres, de 0 a 1.

     Se mira cuánto del nombre corto aparece en el largo, pesando cada palabra
     por su longitud. Así «Isaac» casa del todo con «Isaac Romero» (la única
     palabra que hay está entera), mientras que «Rafa Romero» se queda a la
     mitad: comparte el apellido, pero le sobra un nombre por explicar. */
  function parecido(a, b) {
    const entero = parecidoPalabra(normal(a), normal(b));
    const A = piezas(a), B = piezas(b);
    if (!A.length || !B.length) return entero;
    const [corto, largo] = A.length <= B.length ? [A, B] : [B, A];
    let peso = 0, acertado = 0;
    corto.forEach(p => {
      peso += p.length;
      let mejor = 0;
      largo.forEach(q => { mejor = Math.max(mejor, parecidoPalabra(p, q)); });
      if (mejor >= 0.8) acertado += p.length * mejor;   // una errata sí, dos no
    });
    // Se queda con lo mejor de las dos formas de mirarlo: por palabras sueltas
    // («Isaac» dentro de «Isaac Romero») o el nombre entero de una pieza, que es
    // lo que salva a los nombres cortos con una errata («Osoo» por «Oso»).
    return Math.max(entero, peso ? acertado / peso : 0);
  }

  const ACIERTO    = 0.6;   // a partir de aquí se da por bueno
  // A partir de aquí se propone («¿es este?»), pero decide el administrador. Con
  // el listón más bajo salían disparates —proponer Alfon para un «Carmona» que
  // ya estaba cogido— y una sugerencia absurda estorba más que ayuda.
  const SUGERENCIA = 0.45;

  function nota(ficha, jugador) {
    let n = parecido(ficha.palabras.join(" "), jugador.nombre) * 0.7;
    if (ficha.dorsal != null && jugador.dorsal != null) {
      n += ficha.dorsal === jugador.dorsal ? 0.3 : -0.1;
    }
    return n;
  }

  /* Reparte fichas y jugadores de uno en uno, empezando por las parejas más
     claras: así el «Romero» de verdad se queda con Isaac Romero y el otro
     Romero de la cantera se queda fuera, en vez de robárselo por orden. */
  function emparejar(fichas, plantilla) {
    const parejas = [];
    fichas.forEach((ficha, i) => plantilla.forEach(jugador => {
      const n = nota(ficha, jugador);
      if (n >= SUGERENCIA) parejas.push({ i, jugador, n });
    }));
    parejas.sort((a, b) => b.n - a.n);

    const fichaUsada = new Set(), jugadorUsado = new Set();
    const detalles = [], sugerencias = new Map();

    parejas.forEach(p => {
      if (fichaUsada.has(p.i) || jugadorUsado.has(p.jugador.id)) return;
      if (p.n >= ACIERTO) {
        fichaUsada.add(p.i);
        jugadorUsado.add(p.jugador.id);
        detalles.push({ jugador_id: p.jugador.id, nombre: p.jugador.nombre,
                        dorsal: p.jugador.dorsal, leido: fichas[p.i], nota: p.n });
      } else if (!sugerencias.has(p.i)) {
        sugerencias.set(p.i, p.jugador);           // la mejor que hay, sin llegar a bastar
      }
    });

    /* Como se leen las dos veces, el mismo jugador aparece por duplicado: en una
       pasada entero y en la otra a cachos (el dorsal por un lado y el nombre por
       otro). Lo que ya esta contado no se vuelve a sacar, o la lista de dudosos
       se llena de ruido y esconde lo que de verdad hay que mirar. */
    const dorsalContado = new Set(detalles.map(d => d.dorsal).filter(d => d != null));
    const yaContado = ficha => {
      if (ficha.dorsal != null && dorsalContado.has(ficha.dorsal)) return true;
      const leido = ficha.palabras.join(" ");
      return Boolean(leido) && detalles.some(d => parecido(leido, d.nombre) >= 0.8);
    };

    // una entrada por dorsal (o por nombre, si no se leyo el dorsal); entre dos
    // lecturas del mismo, se queda la que trae nombre
    const sueltas = new Map();
    fichas.forEach((ficha, i) => {
      if (fichaUsada.has(i) || yaContado(ficha)) return;
      const nombre = capitalizar(ficha.palabras.join(" "));
      let propuesta = sugerencias.get(i);
      // Del nombre no se ha sacado nada, pero el dorsal se ha leido limpio: es
      // pista de sobra para proponer al que lo lleva, que ya confirmara el admin.
      if (!propuesta && !nombre && ficha.dorsal != null) {
        propuesta = plantilla.find(j => j.dorsal === ficha.dorsal);
      }
      // Sin dorsal y sin parecerse a nadie no hay nada que ofrecer: es el titulo
      // del cartel, el nombre del rival o un borron. No se enseña.
      if (ficha.dorsal == null && !propuesta) return;

      const entrada = {
        dorsal: ficha.dorsal,
        nombre,
        sugerencia: propuesta && !jugadorUsado.has(propuesta.id) ? propuesta : null
      };
      const clave = ficha.dorsal != null ? `d${ficha.dorsal}` : `n${normal(nombre)}`;
      const previa = sueltas.get(clave);
      if (!previa || (!previa.nombre && entrada.nombre)) sueltas.set(clave, entrada);
    });

    const sinReconocer = [...sueltas.values()]
      .sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999));

    return { detalles, sinReconocer };
  }

  /* ------------------------------------------------------------ utilidades --- */

  // "IKER MUÑOZ" -> "Iker Muñoz", que es como está escrita el resto de la plantilla
  function capitalizar(nombre) {
    return String(nombre || "").toLowerCase().replace(/\S+/g, p =>
      p.charAt(0).toUpperCase() + p.slice(1)).trim();
  }

  const clave = ficha => `${ficha.dorsal ?? ""}|${normal(ficha.palabras.join(" "))}`;

  function juntar(a, b) {
    const vistas = new Set(a.map(clave));
    return a.concat(b.filter(f => {
      const c = clave(f);
      if (vistas.has(c)) return false;
      vistas.add(c);
      return true;
    }));
  }

  /* --------------------------------------------------------------- público --- */

  /* Lee la foto y devuelve:
       convocados    ids de la plantilla reconocidos, para marcar en la pantalla
       detalles      qué jugador ha salido de qué línea, para poder repasarlo
       sinReconocer  líneas con pinta de jugador que no están en la plantilla
       texto         lo que ha leído en bruto, por si hay que entender un fallo  */
  async function analizarFoto(fichero, plantilla, alProgreso) {
    if (!fichero) throw new Error("Elige primero la foto de la convocatoria.");
    if (!/^image\//.test(fichero.type || "")) {
      throw new Error("Eso no es una imagen. Sube la foto de la convocatoria (jpg o png).");
    }
    if (!plantilla || !plantilla.length) {
      throw new Error("No hay plantilla con la que comparar. Añade jugadores antes.");
    }

    const lienzo = aBlancoYNegro(await aLienzo(fichero));
    const trabajador = await abrirTrabajador(alProgreso);

    try {
      // Siempre las dos lecturas, y se juntan. Antes la segunda solo se hacía si
      // la primera había sacado poca gente, y así se quedaban fuera para siempre
      // los dos o tres que a esa primera se le hubieran escapado. Tarda algo más
      // y merece la pena: juntarlas solo puede sumar, porque de aquí no sale
      // nada guardado sin que el administrador lo repase.
      const uno = await leer(trabajador, lienzo, 6);
      const dos = await leer(trabajador, lienzo, 11);
      const texto  = `${uno}\n${dos}`;
      const fichas = juntar(candidatos(uno), candidatos(dos));
      const r      = emparejar(fichas, plantilla);

      return {
        convocados: r.detalles.map(d => d.jugador_id),
        detalles: r.detalles.sort((a, b) => (a.dorsal ?? 99) - (b.dorsal ?? 99)),
        sinReconocer: r.sinReconocer,
        texto
      };
    } finally {
      try { await trabajador.terminate(); } catch { /* daba igual: ya hemos terminado */ }
    }
  }

  return { analizarFoto, capitalizar };
})();
