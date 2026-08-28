#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Busca la convocatoria del proximo partido en la web del Sevilla FC.

El club publica la lista de convocados como una noticia, y dentro va en texto:

    La lista completa la forman: Odysseas, Fran Gonzalez, Juan Iglesias, ...
    La convocatoria al completo la conforman: Odysseas, Fran Gonzalez, ...
    La convocatoria completa la conforman: Odysseas, Fran Gonzalez, ...

Como no la redacta igual dos veces, no se depende de la frase: se miran todos
los parrafos y gana el que mas jugadores de la plantilla trae. La frase solo
sirve de atajo.

Asi que no hace falta ni leer la foto ni tocar la API de X (que desde 2026 se
paga por uso). Se pide la pagina tal cual, se saca esa frase y se cruzan los
nombres con la plantilla que hay en la base de datos.

No escribe nada: recibe por la entrada lo que devuelve robot_pendiente() y
escupe por la salida lo que ha encontrado, en JSON. De guardarlo se encarga el
proceso de GitHub llamando a robot_convocatoria().

    python robot/convocatoria.py < pendiente.json
"""

import json
import re
import sys

import comun

# Por debajo de esto no se carga nada: si de 24 convocados solo casan 8, lo que
# pasa es que algo va mal (la plantilla esta sin actualizar, o la pagina ha
# cambiado), y mas vale no tocar nada y que se cargue a mano.
MINIMO = 14

# El club NO escribe siempre la misma frase, asi que no se busca la frase entera
# sino el verbo que presenta la lista, y con el la lista va detras de los dos
# puntos. En la jornada 1 fue «La lista completa la forman:» y en la 2 «La
# convocatoria al completo la conforman:»; buscando «lista completa la forman»
# al pie de la letra, la segunda se quedaba sin cargar.
#
# Se puede permitir ser ancho: si la frase pescada no es la que era, los nombres
# no casaran con la plantilla y MINIMO impide que se guarde nada.
FRASES = (
    r"(?:lista|convocatoria|relaci[oó]n)[^:<]{0,60}?"
    r"(?:conforman|forman|componen|integran)[^:<]{0,20}:",
    r"(?:convocados|citados)[^:<]{0,40}?son[^:<]{0,20}:",
)


# Una convocatoria nunca baja de once nombres. Sirve para descartar de un
# vistazo los parrafos que son prosa, antes de ponerse a casar nombres.
SUELO = 11


def listas_posibles(html):
    """Todo lo que en la noticia podria ser la lista de convocados.

    Primero lo que va detras de la frase que la presenta, que es lo mas fiable.
    Y despues CUALQUIER parrafo, por si el club la ha redactado de otra manera o
    la ha puesto en otro sitio: ya decidira mas tarde quien gana, que sera el
    que mas jugadores de la plantilla traiga."""
    texto = comun.desescapar(html)

    trozos = []
    for frase in FRASES:
        for hallado in re.finditer(frase + r"(.{0,1500}?)</p", texto, re.IGNORECASE | re.DOTALL):
            trozos.append(hallado.group(1))
    trozos += re.findall(r"<p[^>]*>(.{0,2000}?)</p>", texto, re.DOTALL)

    listas = []
    for trozo in trozos:
        # No se corta por el primer punto: hay apellidos que lo llevan. En la
        # jornada 3 el club escribio «A. Castrin» de octavo y la lista se quedaba
        # en ocho nombres, uno de ellos la «A» suelta.
        nombres = comun.trocear_nombres(comun.sin_etiquetas(trozo))
        if len(nombres) >= SUELO:
            listas.append(nombres)
    return listas


def mejor_lista(html, plantilla):
    """De todo lo que podria ser la convocatoria, la que mas jugadores de la
    plantilla trae de verdad.

    Asi da igual como redacte el club la noticia: el parrafo de la convocatoria
    es el unico con veintitantos nombres de la plantilla seguidos, y gana solo.
    Si la lista de verdad no esta, lo que gane traera cuatro nombres sueltos y
    MINIMO impedira que se guarde nada."""
    mejor_nombres, mejor_casados, mejor_sueltos = [], [], []
    for nombres in listas_posibles(html):
        casados, sueltos = comun.casar(nombres, plantilla)
        if len(casados) > len(mejor_casados):
            mejor_nombres, mejor_casados, mejor_sueltos = nombres, casados, sueltos
    return mejor_nombres, mejor_casados, mejor_sueltos


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    datos = json.load(sys.stdin)
    jornada = datos.get("jornada")
    plantilla = datos.get("plantilla") or []

    if not jornada:
        return salir({"ok": False, "motivo": "no hay ninguna jornada esperando convocatoria"})
    if not plantilla:
        return salir({"ok": False, "motivo": "no hay plantilla con la que comparar"})

    slug = comun.buscar_noticia("convocatoria", jornada["rival"])
    if not slug:
        return salir({"ok": False, "jornada": jornada["numero"],
                      "motivo": "todavia no esta publicada la convocatoria contra %s" % jornada["rival"]})

    url = "%s/actualidad/noticias/%s" % (comun.BASE, slug)
    nombres, casados, sueltos = mejor_lista(comun.pedir(url), plantilla)
    if not nombres:
        return salir({"ok": False, "jornada": jornada["numero"], "fuente": url,
                      "motivo": "en la noticia no hay ningun parrafo con pinta de convocatoria"})

    if len(casados) < MINIMO:
        return salir({"ok": False, "jornada": jornada["numero"], "fuente": url,
                      "leidos": len(nombres), "sueltos": sueltos,
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
