#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Busca el once inicial del Sevilla FC en la noticia «en directo» del partido.

Cuando se confirma la alineacion, el club lo escribe en el minuto a minuto:

    20:10 | ¡CONFIRMADO EL ONCE DEL SEVILLA FC!
    Luis Garcia Plaza sale con Odysseas; Iglesias, Sangante, Kike Salas, Suazo;
    Agoume, Nico Guillen, Guridi; Miguel Sierra, Oso e Isaac.

Esos once nombres estan en el HTML servido, asi que se pueden leer sin
navegador. Van tambien en una imagen, pero con el texto basta.

Lo que salga de aqui NO se publica como once oficial: se guarda como PROPUESTA
y el administrador la confirma de un toque. Es lo que reparte los puntos, y de
eso responde una persona.

    python robot/once.py < pendiente.json
"""

import json
import re
import sys

import comun

TITULARES = 11


def once_de(html):
    """Los once nombres de la alineacion, si ya estan publicados."""
    texto = comun.desescapar(html)

    posibles = []
    # el parrafo que va justo detras del titular del once
    tras_titular = re.search(
        r"(CONFIRMADO EL ONCE|ONCE DEL SEVILLA|ONCE INICIAL|ALINEACI[OÓ]N CONFIRMADA)"
        r".{0,120}?</p>(.{0,600}?)</p", texto, re.IGNORECASE | re.DOTALL)
    if tras_titular:
        posibles.append(tras_titular.group(2))
    # y, por si cambian el titular, la frase «… sale con …»
    sale_con = re.search(r"sale con(.{0,500}?)</p", texto, re.IGNORECASE | re.DOTALL)
    if sale_con:
        posibles.append(sale_con.group(1))

    for trozo in posibles:
        limpio = comun.sin_etiquetas(trozo)
        # «Luis Garcia Plaza sale con Odysseas; …» -> «Odysseas; …»
        limpio = re.sub(r"^.*?\bsale con\b", "", limpio, flags=re.IGNORECASE)
        # No se corta por el primer punto: hay apellidos que lo llevan («M. Sierra»).
        # Si detras del once viniera mas texto, saldrian mas de once nombres y esto
        # se descarta entero, que es lo que toca: mejor nada que un once inventado.
        nombres = comun.trocear_nombres(limpio)
        if len(nombres) == TITULARES:
            return nombres
    return []


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    datos = json.load(sys.stdin)
    jornada = datos.get("jornada")
    plantilla = datos.get("plantilla") or []

    if not jornada:
        return salir({"ok": False, "motivo": "no hay ningun partido esperando el once"})
    if not plantilla:
        return salir({"ok": False, "motivo": "no hay plantilla con la que comparar"})

    slug = comun.buscar_noticia("partido-directo", jornada["rival"])
    if not slug:
        return salir({"ok": False, "jornada": jornada["numero"],
                      "motivo": "no encuentro la noticia en directo del partido contra %s"
                                % jornada["rival"]})

    url = "%s/actualidad/noticias/%s" % (comun.BASE, slug)
    nombres = once_de(comun.pedir(url))
    if not nombres:
        return salir({"ok": False, "jornada": jornada["numero"], "fuente": url,
                      "motivo": "el once todavia no esta publicado en la noticia"})

    casados, sueltos = comun.casar(nombres, plantilla)
    if len(casados) != TITULARES:
        return salir({"ok": False, "jornada": jornada["numero"], "fuente": url,
                      "leidos": nombres, "sueltos": sueltos,
                      "motivo": "de los %d nombres del once solo casan %d con la plantilla"
                                % (len(nombres), len(casados))})

    salir({"ok": True, "jornada_id": jornada["id"], "jornada": jornada["numero"],
           "fuente": url, "ids": [c["id"] for c in casados], "casados": casados})


def salir(resultado):
    print(json.dumps(resultado, ensure_ascii=False, indent=1))
    return resultado


if __name__ == "__main__":
    main()
