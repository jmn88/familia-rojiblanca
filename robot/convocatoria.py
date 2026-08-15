#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Busca la convocatoria del proximo partido en la web del Sevilla FC.

El club publica la lista de convocados como una noticia, y dentro va en texto:

    La lista completa la forman: Odysseas, Fran Gonzalez, Juan Iglesias, ...

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


def lista_de(html):
    """Los nombres que van detras de «La lista completa la forman:»."""
    texto = comun.desescapar(html)
    trozo = re.search(r"lista completa la forman[^:]{0,40}:(.{0,900}?)</p", texto,
                      re.IGNORECASE | re.DOTALL)
    if not trozo:
        return []
    limpio = comun.sin_etiquetas(trozo.group(1)).split(".")[0]
    return comun.trocear_nombres(limpio)


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
    nombres = lista_de(comun.pedir(url))
    if not nombres:
        return salir({"ok": False, "jornada": jornada["numero"], "fuente": url,
                      "motivo": "la noticia no trae la frase con la lista de convocados"})

    casados, sueltos = comun.casar(nombres, plantilla)
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
