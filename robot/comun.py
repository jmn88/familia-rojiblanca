# -*- coding: utf-8 -*-
"""Lo que comparten los dos robots: pedir paginas de la web del Sevilla FC,
sacar el texto de dentro y cruzar nombres con la plantilla.

Solo biblioteca estandar de Python: ni pip ni dependencias que mantener.
"""

import re
import unicodedata
import urllib.request
from difflib import SequenceMatcher

BASE = "https://www.sevillafc.es"
PORTADA = BASE + "/actualidad/noticias"
AGENTE = "familia-rojiblanca-bot/1.0 (porra de un grupo de amigos)"

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
    """La web va en Next.js y el texto de los articulos viaja escapado dentro de
    unos <script>. Con deshacer esos escapes basta: no hace falta navegador."""
    for viejo, nuevo in (("\\u003c", "<"), ("\\u003e", ">"), ("\\u0026nbsp;", " "),
                         ("&nbsp;", " "), ("\\u0026", "&"), ('\\"', '"'), ("\\n", " ")):
        html = html.replace(viejo, nuevo)
    return html


def sin_etiquetas(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]*>", " ", html)).strip()


def como_slug(texto):
    texto = unicodedata.normalize("NFD", texto)
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", texto.lower()).strip("-")


def buscar_noticia(prefijo, rival):
    """La direccion de la noticia que empieza por `prefijo` y habla de ese rival.

    Las direcciones son del estilo
        /actualidad/noticias/convocatoria-sevilla-fc-rayo-vallecano-laliga-2026-2027
        /actualidad/noticias/partido-directo-sevilla-rayo-laliga-2026-2027
    y no siempre traen el nombre entero del rival («rayo» a secas), asi que
    tambien se prueba con su primera palabra. Se recorren en el orden en que
    salen en la portada, que es el de publicacion: la primera que cuadre es la
    mas reciente."""
    portada = pedir(PORTADA)
    vistos = list(dict.fromkeys(re.findall(r"actualidad/noticias/([a-z0-9\-]+)", portada)))
    rival_slug = como_slug(rival)
    primera = rival_slug.split("-")[0]

    for slug in vistos:
        if not slug.startswith(prefijo):
            continue
        if "femenino" in slug or "cantera" in slug:      # otras secciones del club
            continue
        if rival_slug in slug or primera in slug:
            return slug
    return None


def trocear_nombres(texto):
    """De «Odysseas; Iglesias, Kike Salas y Oso» saca los nombres sueltos."""
    partes = re.split(r"[;,]|\s+y\s+|\s+e\s+", texto)
    return [p.strip(" .;: ") for p in partes if p.strip(" .;: ")]


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

    casados.sort(key=lambda c: nombres.index(c["leido"]))
    sueltos = [n for i, n in enumerate(nombres) if i not in usados_nombre]
    return casados, sueltos
