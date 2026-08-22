#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Busca el once inicial del Sevilla FC en la noticia «en directo» del partido.

Cuando se confirma la alineacion, el club lo escribe en el minuto a minuto. No
lo hace siempre igual, y el minuto a minuto va del reves (lo mas reciente
arriba), asi que los nombres tan pronto van con el anuncio como en la entrada
de al lado:

    20:10 | ¡CONFIRMADO EL ONCE DEL SEVILLA FC!
    Luis Garcia Plaza sale con Odysseas; Iglesias, Sangante, Kike Salas, Suazo;
    Agoume, Nico Guillen, Guridi; Miguel Sierra, Oso e Isaac.

    15:46 | Odysseas, Iglesias, Sangante, Castrin, Suazo, Agoume, Guridi,
            Miguel Sierra, Oso, Peque y Ure.
    15:45 | Once confirmado de Luis Garcia Plaza para el conjunto sevillista.

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

# El minuto a minuto son entradas «HH:MM | texto», y van de la mas reciente a la
# mas antigua, asi que lo de arriba es POSTERIOR a lo de abajo.
ENTRADA = re.compile(r"\b\d{1,2}:\d{2}\s*\|\s*")

# La entrada que anuncia el once. El club no la escribe siempre igual:
#   J1: «¡CONFIRMADO EL ONCE DEL SEVILLA FC! … sale con Odysseas; …»
#   J2: «Once confirmado de Luis Garcia Plaza para el conjunto sevillista.»
# asi que se busca la pareja de palabras en cualquier orden, no la frase.
MARCA = re.compile(r"(?:once|alineaci[oó]n)\b.{0,60}?confirmad"
                   r"|confirmad\w*\b.{0,60}?(?:once|alineaci[oó]n)", re.IGNORECASE)


def entradas(texto):
    """El minuto a minuto partido en entradas, en el orden en que sale."""
    return [t.strip() for t in ENTRADA.split(comun.sin_etiquetas(texto)) if t.strip()]


def once_de(html):
    """Los once nombres de la alineacion, si ya estan publicados."""
    texto = comun.desescapar(html)
    trozos = entradas(texto)

    posibles = []
    for i, t in enumerate(trozos):
        if not MARCA.search(t):
            continue
        # los nombres pueden ir en la misma entrada que el anuncio (J1) o en la
        # de al lado; y como el directo va del reves, lo normal es la ANTERIOR
        posibles.append(t)
        if i > 0:
            posibles.append(trozos[i - 1])
        if i + 1 < len(trozos):
            posibles.append(trozos[i + 1])

    # y, por si algun dia no hay entrada que lo anuncie, la frase «… sale con …»
    sale_con = re.search(r"sale con(.{0,500}?)</p", texto, re.IGNORECASE | re.DOTALL)
    if sale_con:
        posibles.append(comun.sin_etiquetas(sale_con.group(1)))

    for trozo in posibles:
        # «Luis Garcia Plaza sale con Odysseas; …» -> «Odysseas; …»
        limpio = re.sub(r"^.*?\bsale con\b", "", trozo, flags=re.IGNORECASE)
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
