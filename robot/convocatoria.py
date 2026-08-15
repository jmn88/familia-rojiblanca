#!/usr/bin/env python3
"""Busca la convocatoria del proximo partido en la web del Sevilla FC.

El club publica la lista de convocados como una noticia, y dentro va en texto:

    La lista completa la forman: Odysseas, Fran Gonzalez, Juan Iglesias, ...

Asi que no hace falta ni leer la foto ni tocar la API de X (que desde 2026 se
paga por uso). Se pide la pagina tal cual, se saca esa frase y se cruzan los
nombres con la plantilla que hay en la base de datos.

No escribe nada: recibe por la entrada lo que devuelve robot_pendiente() y
escupe por la salida lo que ha encontrado, en JSON. De guardarlo se encarga el
proceso de GitHub llamando a robot_convocatoria().

Solo usa la biblioteca estandar de Python: ni pip ni dependencias que mantener.

    python robot/convocatoria.py < pendiente.json
"""

import json
import re
import sys
import unicodedata
import urllib.request
from difflib import SequenceMatcher

BASE = "https://www.sevillafc.es"
PORTADA = BASE + "/actualidad/noticias"
AGENTE = "familia-rojiblanca-bot/1.0 (porra de un grupo de amigos)"

# Por debajo de esto no se carga nada: si de 24 convocados solo casan 8, lo que
# pasa es que algo va mal (la plantilla esta sin actualizar, o la pagina ha
# cambiado), y mas vale no tocar nada y que se cargue a mano.
MINIMO = 14

# Un nombre se da por bueno si todas sus palabras estan en el del jugador
# («Juan Iglesias» -> «Iglesias», «Andres Castrin» -> «A. Castrin») o si la
# cadena entera se parece mucho. Con el listón mas bajo, «Rafa Romero» (un
# canterano) se hacia pasar por «Isaac Romero».
ACIERTO = 0.85


# ----------------------------------------------------------------- la web ---

def pedir(url):
    peticion = urllib.request.Request(url, headers={
        "User-Agent": AGENTE,
        "Accept": "text/html",
        "Accept-Language": "es-ES,es;q=0.9",
    })
    with urllib.request.urlopen(peticion, timeout=30) as respuesta:
        return respuesta.read().decode("utf-8", "replace")


def desescapar(html):
    """La web va en Next.js y el texto del articulo viaja escapado dentro de
    unos <script>. Con deshacer esos escapes basta: no hace falta navegador."""
    for viejo, nuevo in (("\\u003c", "<"), ("\\u003e", ">"), ("\\u0026nbsp;", " "),
                         ("&nbsp;", " "), ("\\u0026", "&"), ('\\"', '"'), ("\\n", " ")):
        html = html.replace(viejo, nuevo)
    return html


def como_slug(texto):
    texto = unicodedata.normalize("NFD", texto)
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", texto.lower()).strip("-")


def buscar_noticia(rival):
    """La noticia de la convocatoria del primer equipo contra ese rival.

    Las direcciones son del estilo
        /actualidad/noticias/convocatoria-sevilla-fc-rayo-vallecano-laliga-2026-2027
    Se recorren en el orden en que salen en la portada, que es el de
    publicacion, asi que la primera que cuadre es la mas reciente."""
    portada = pedir(PORTADA)
    vistos = list(dict.fromkeys(re.findall(r"actualidad/noticias/([a-z0-9\-]+)", portada)))
    rival_slug = como_slug(rival)
    primera_palabra = rival_slug.split("-")[0]

    for slug in vistos:
        if not slug.startswith("convocatoria"):
            continue
        if "femenino" in slug or "cantera" in slug:      # otras secciones del club
            continue
        if rival_slug in slug or primera_palabra in slug:
            return slug
    return None


def lista_de(html):
    """Los nombres que van detras de «La lista completa la forman:»."""
    texto = desescapar(html)
    trozo = re.search(r"lista completa la forman[^:]{0,40}:(.{0,900}?)</p", texto,
                      re.IGNORECASE | re.DOTALL)
    if not trozo:
        return []

    limpio = re.sub(r"<[^>]*>", " ", trozo.group(1))
    limpio = limpio.split(".")[0]                        # se corta en el punto final
    partes = re.split(r",|\s+y\s+|\s+e\s+", limpio)
    return [p.strip(" .;:") for p in partes if p.strip(" .;:")]


# ------------------------------------------------------------ los nombres ---

def normal(texto):
    texto = unicodedata.normalize("NFD", texto or "")
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Z0-9]+", " ", texto.upper()).strip()


def piezas(texto):
    todas = normal(texto).split()
    return [t for t in todas if len(t) >= 3] or todas


def parecido_palabra(a, b):
    return SequenceMatcher(None, a, b).ratio()


def contencion(a, b):
    """Cuanto del nombre corto aparece en el largo, pesando por longitud.

    Asi «Iglesias» esta entero dentro de «Juan Iglesias» (1.0), mientras que
    «Rafa Romero» solo comparte el apellido con «Isaac Romero» (0.6)."""
    A, B = piezas(a), piezas(b)
    corto, largo = (A, B) if len(A) <= len(B) else (B, A)
    peso = sum(len(t) for t in corto)
    if not peso:
        return 0.0
    acertado = sum(len(t) for t in corto
                   if max((parecido_palabra(t, u) for u in largo), default=0) >= 0.85)
    return acertado / peso


def nota(nombre, jugador):
    return max(contencion(nombre, jugador), parecido_palabra(normal(nombre), normal(jugador)))


def casar(nombres, plantilla):
    """Reparte nombres y jugadores de uno en uno, del mas claro al menos.

    Si un nombre empata entre dos jugadores no se elige ninguno: se deja sin
    casar y se avisa, que aqui no hay nadie mirando para deshacer el enredo."""
    parejas = []
    for i, nombre in enumerate(nombres):
        notas = sorted(((nota(nombre, j["nombre"]), j) for j in plantilla),
                       key=lambda x: x[0], reverse=True)
        if not notas or notas[0][0] < ACIERTO:
            continue
        if len(notas) > 1 and notas[1][0] >= ACIERTO and notas[0][0] - notas[1][0] < 0.02:
            continue                                     # empate: mejor no adivinar
        parejas.append((notas[0][0], i, notas[0][1]))

    parejas.sort(key=lambda x: x[0], reverse=True)
    usados_nombre, usados_jugador, casados = set(), set(), []
    for puntos, i, jugador in parejas:
        if i in usados_nombre or jugador["id"] in usados_jugador:
            continue
        usados_nombre.add(i)
        usados_jugador.add(jugador["id"])
        casados.append({"leido": nombres[i], "id": jugador["id"],
                        "nombre": jugador["nombre"], "nota": round(puntos, 3)})

    sueltos = [n for i, n in enumerate(nombres) if i not in usados_nombre]
    return casados, sueltos


# ------------------------------------------------------------------ main ---

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    datos = json.load(sys.stdin)
    jornada = datos.get("jornada")
    plantilla = datos.get("plantilla") or []

    if not jornada:
        return salir({"ok": False, "motivo": "no hay ninguna jornada esperando convocatoria"})
    if not plantilla:
        return salir({"ok": False, "motivo": "no hay plantilla con la que comparar"})

    slug = buscar_noticia(jornada["rival"])
    if not slug:
        return salir({"ok": False, "jornada": jornada["numero"],
                      "motivo": "todavia no esta publicada la convocatoria contra %s" % jornada["rival"]})

    url = "%s/actualidad/noticias/%s" % (BASE, slug)
    nombres = lista_de(pedir(url))
    if not nombres:
        return salir({"ok": False, "jornada": jornada["numero"], "fuente": url,
                      "motivo": "la noticia no trae la frase con la lista de convocados"})

    casados, sueltos = casar(nombres, plantilla)
    if len(casados) < MINIMO:
        return salir({"ok": False, "jornada": jornada["numero"], "fuente": url,
                      "leidos": len(nombres), "casados": len(casados), "sueltos": sueltos,
                      "motivo": "solo casan %d nombres de %d: no me fio, cargala a mano"
                                % (len(casados), len(nombres))})

    salir({"ok": True, "jornada_id": jornada["id"], "jornada": jornada["numero"],
           "fuente": url, "ids": [c["id"] for c in casados],
           "casados": casados, "sueltos": sueltos})


def salir(resultado):
    print(json.dumps(resultado, ensure_ascii=False, indent=1))
    return resultado


if __name__ == "__main__":
    main()
