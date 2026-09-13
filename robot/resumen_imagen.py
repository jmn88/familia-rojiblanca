#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dibuja la imagen del resumen de la jornada, la misma que se comparte por
WhatsApp desde la web, pero sin nadie delante: para adjuntarla al correo de
resultados.

No se vuelve a programar el dibujo: se abre app/resumen.js en un Chrome sin
ventana (el que ya viene en las maquinas de GitHub) y se le pide el PNG. Es
literalmente el mismo codigo que usa la web, asi que la imagen es la misma.

Como se hace: se escribe una pagina de un solo uso con los datos dentro, que
al cargar pinta el lienzo y deja el PNG (en base64) en el cuerpo de la pagina;
Chrome, con --dump-dom, imprime esa pagina ya ejecutada; y de ahi se saca el
PNG. Sin servidor, sin librerias, sin Node.

Lee por la entrada lo que devuelve robot_resultados_pendientes() y escribe la
imagen en el fichero que se le diga. Por defecto es el PNG a tamano completo
(el mismo fichero que la web); para el correo se pide JPEG y mas estrecho, que
pesa una decima parte:

    python robot/resumen_imagen.py resumen.png < pendientes.json
    python robot/resumen_imagen.py resumen.jpg --formato jpeg --calidad 0.8 --ancho 1080 < pendientes.json

Si no encuentra Chrome (variable CHROME o los nombres de siempre), o Chrome no
devuelve la imagen, acaba con error y sin fichero: el correo sale igual, solo
que sin la imagen. Es a proposito: mejor un correo sin foto que ningun correo.
"""

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

from avisos import DIAS, MESES, momento

AQUI = os.path.dirname(os.path.abspath(__file__))
RESUMEN_JS = os.path.join(AQUI, "..", "app", "resumen.js")

# Chrome, con el nombre que tenga en cada sitio. En GitHub (ubuntu-latest)
# viene instalado como google-chrome; en Windows, en Program Files.
CANDIDATOS = [
    "google-chrome", "google-chrome-stable", "chromium-browser", "chromium", "chrome",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]

PAGINA = """<!doctype html>
<meta charset="utf-8">
<title>resumen</title>
<script src="%(resumen_js)s"></script>
<body>
<script>
  const D = %(datos)s;
  const porId = new Map(D.jugadores.map(j => [j.id, j]));
  const jugador = id => porId.get(id) || null;
  const nombre  = id => (porId.get(id) || {}).nombre || ("#" + id);
  const lienzo = RESUMEN.lienzo({
    jornada: D.jornada,
    filas: D.filas,
    general: D.general,
    jornadasJugadas: D.jornadas_jugadas,
    nombre, jugador,
    fecha: D.fecha
  });
  // A la anchura que se pida, y en el formato que se pida (JPEG para el
  // correo: pesa una fraccion del PNG).
  let final = lienzo;
  if (D.ancho && D.ancho < lienzo.width) {
    final = document.createElement("canvas");
    final.width = D.ancho;
    final.height = Math.round(lienzo.height * D.ancho / lienzo.width);
    const x = final.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(lienzo, 0, 0, final.width, final.height);
  }
  const pre = document.createElement("pre");
  pre.id = "imagen";
  pre.textContent = final.toDataURL(D.formato, D.calidad);
  document.body.appendChild(pre);
</script>
</body>
"""


def fecha_de(kickoff_local):
    """«viernes 11 de septiembre · 21:00», como la escribe la web."""
    t = momento(kickoff_local)
    return "%s %d de %s · %s" % (DIAS[t.weekday()], t.day, MESES[t.month - 1], t.strftime("%H:%M"))


def chrome():
    """Donde esta Chrome, o None."""
    for c in [os.environ.get("CHROME") or ""] + CANDIDATOS:
        if not c:
            continue
        if os.path.isfile(c):
            return c
        ruta = shutil.which(c)
        if ruta:
            return ruta
    return None


def como_url(ruta):
    """file:///C:/... o file:///home/..., que es como Chrome quiere las rutas."""
    ruta = os.path.abspath(ruta).replace("\\", "/")
    return "file:///" + ruta.lstrip("/")


def dibujar(datos, destino, formato="png", calidad=0.85, ancho=None):
    navegador = chrome()
    if not navegador:
        raise RuntimeError("no encuentro Chrome (pon la ruta en la variable CHROME)")

    j = datos["jornada"]
    pagina = PAGINA % {
        "resumen_js": como_url(RESUMEN_JS),
        "datos": json.dumps({
            "jornada": j,
            "filas": datos.get("filas") or [],
            "general": datos.get("general") or [],
            "jornadas_jugadas": datos.get("jornadas_jugadas") or 0,
            "jugadores": datos.get("jugadores") or [],
            "fecha": fecha_de(j["kickoff_local"]),
            "formato": "image/" + formato,
            "calidad": calidad,
            "ancho": ancho,
        }, ensure_ascii=False).replace("</", "<\\/"),
    }

    # Carpeta de un solo uso, con ruta corta: Chrome no puede crear el perfil
    # en rutas muy largas de Windows (probado), y en cualquier caso no debe
    # tocar el perfil de nadie.
    carpeta = tempfile.mkdtemp(prefix="fr-")
    try:
        html = os.path.join(carpeta, "resumen.html")
        with open(html, "w", encoding="utf-8") as f:
            f.write(pagina)

        orden = [
            navegador, "--headless=new", "--disable-gpu", "--no-sandbox",
            "--no-first-run", "--disable-extensions", "--hide-scrollbars",
            "--user-data-dir=" + os.path.join(carpeta, "perfil"),
            "--virtual-time-budget=10000",
            "--dump-dom", como_url(html),
        ]
        salida = subprocess.run(orden, capture_output=True, timeout=120)
        dom = salida.stdout.decode("utf-8", "replace")
        m = re.search(r"data:image/[a-z]+;base64,([A-Za-z0-9+/=]+)", dom)
        if not m:
            detalle = salida.stderr.decode("utf-8", "replace").strip().splitlines()[-3:]
            raise RuntimeError("Chrome no ha devuelto la imagen (salida %d): %s"
                               % (salida.returncode, " | ".join(detalle)))

        png = base64.b64decode(m.group(1))
        with open(destino, "wb") as f:
            f.write(png)
        return len(png)
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)


def opcion(nombre, por_defecto):
    if nombre in sys.argv:
        return sys.argv[sys.argv.index(nombre) + 1]
    return por_defecto


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        raise SystemExit("uso: resumen_imagen.py <fichero> [--formato jpeg] [--calidad 0.85] [--ancho 1080] < pendientes.json")
    datos = json.load(sys.stdin)
    if not datos.get("jornada"):
        raise SystemExit("no hay jornada de la que dibujar el resumen")
    try:
        n = dibujar(datos, sys.argv[1],
                    formato=opcion("--formato", "png"),
                    calidad=float(opcion("--calidad", "0.85")),
                    ancho=int(opcion("--ancho", "0")) or None)
    except Exception as e:
        print("No se ha podido dibujar el resumen: %s" % e, file=sys.stderr)
        raise SystemExit(1)
    print("Resumen dibujado: %s (%d KB)" % (sys.argv[1], n // 1024))


if __name__ == "__main__":
    main()
