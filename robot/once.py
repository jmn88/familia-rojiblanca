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

    17:05 | El Sevilla FC sale en Riazor con Odysseas, Iglesias, Castrin, …
    17:04 | El Depor, por su parte, arranca con Leo Roman, Alti, …

Por eso no se depende de la frase: vale cualquier entrada con exactamente once
nombres de la plantilla.

Esos once nombres estan en el HTML servido, asi que se pueden leer sin
navegador. Van tambien en una imagen, pero con el texto basta.

Lo que salga de aqui se PUBLICA como once oficial y reparte los puntos en el
acto (decision del administrador, septiembre de 2026, tras cinco jornadas sin
un fallo). Eso lo decide la base de datos, en robot_once(): si el once leido
lleva a alguien fuera de la convocatoria, no lo publica, lo deja propuesto y
Admin lo avisa, para que lo resuelva una persona.

    python robot/once.py < pendiente.json
"""

import json
import re
import sys
import time

import comun

TITULARES = 11

# Cuando se le pasa --vigilar, esta ejecucion NO se va nada mas mirar: se queda
# despierta hasta que la alineacion aparece.
#
# Es para no depender del reloj de GitHub, que no cumple lo que se le pide. Se
# le pedian pasadas cada cinco minutos y en la practica lanzaba una cada hora o
# dos (medido: huecos de 51 a 173 minutos), asi que habia jornadas en las que no
# se ejecutaba ni una sola vez durante los 90 minutos que dura la ventana y el
# once no se proponia. Ahora el cron es solo un despertador: basta con que
# GitHub arranque UNA vez en toda la tarde para que el once se cace con
# precision de dos minutos.
ESPERA = 120            # entre intento e intento
DESDE  = 100 * 60       # no se molesta al club hasta 100 min antes del partido
HASTA  = 3 * 3600       # si a las 3 horas del inicio no ha salido, no va a salir
TOPE   = 5 * 3600       # y una ejecucion no se queda despierta mas que esto

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


def once_de(html, plantilla=None):
    """Los once nombres de la alineacion, si ya estan publicados.

    Con plantilla, solo vale una lista cuyos once nombres casen todos con ella:
    es lo que separa el once del Sevilla del del rival, que el club escribe
    igual y en la entrada de al lado."""
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

    # Y si nada de lo anterior da once nombres, se prueban TODAS las entradas
    # del directo, en su orden. El club no escribe el once dos veces igual (J6:
    # «El Sevilla FC sale en Riazor con Odysseas, …», sin «once», sin
    # «confirmado» y sin «sale con»), asi que no se puede depender de la
    # frase: como con la convocatoria, se busca la entrada que tenga
    # exactamente once nombres DE LA PLANTILLA, que es lo que descarta la del
    # rival (el club la escribe igual, en la entrada de al lado).
    posibles += trozos

    for trozo in posibles:
        # «Luis Garcia Plaza sale con Odysseas; …» -> «Odysseas; …»
        # «El Sevilla FC sale en Riazor con Odysseas, …» -> «Odysseas, …»
        for limpio in tras_con(trozo):
            # No se corta por el primer punto: hay apellidos que lo llevan («M. Sierra»).
            # Si detras del once viniera mas texto, saldrian mas de once nombres y esto
            # se descarta entero, que es lo que toca: mejor nada que un once inventado.
            nombres = comun.trocear_nombres(limpio)
            if len(nombres) != TITULARES:
                continue
            if plantilla is not None:
                casados, _ = comun.casar(nombres, plantilla)
                if len(casados) != TITULARES:
                    continue        # once nombres, pero no son los nuestros
            return nombres
    return []


def tras_con(trozo):
    """Las maneras de leer una entrada: desde cada «con» que lleve, y entera.

    La lista de nombres va al final y lo de delante solo estorba, asi que se
    prueba primero lo mas corto (desde el ultimo «con») y al final la entrada
    tal cual, por si no lleva ninguno."""
    variantes = [trozo[m.end():] for m in re.finditer(r"\bcon\b", trozo, flags=re.IGNORECASE)]
    variantes.append(trozo)
    return sorted(variantes, key=len)


def intentar(jornada, plantilla):
    """Una pasada: buscar la noticia, leerla y casar los nombres."""
    slug = comun.buscar_noticia("partido-directo", jornada["rival"])
    if not slug:
        return {"ok": False, "jornada": jornada["numero"],
                "motivo": "no encuentro la noticia en directo del partido contra %s"
                          % jornada["rival"]}

    url = "%s/actualidad/noticias/%s" % (comun.BASE, slug)
    html = comun.pedir(url)
    nombres = once_de(html, plantilla)
    if not nombres:
        # ¿hay alguna lista de once que no case? Se deja dicho, que ayuda a ver
        # si el club ha cambiado de nombres o es que aun no ha salido
        otra = once_de(html)
        if otra:
            _, sueltos = comun.casar(otra, plantilla)
            return {"ok": False, "jornada": jornada["numero"], "fuente": url,
                    "leidos": otra, "sueltos": sueltos,
                    "motivo": "hay una lista de once nombres pero no casan con la plantilla: %s"
                              % ", ".join(sueltos[:5])}
        return {"ok": False, "jornada": jornada["numero"], "fuente": url,
                "motivo": "el once todavia no esta publicado en la noticia"}

    casados, sueltos = comun.casar(nombres, plantilla)
    if len(casados) != TITULARES:
        return {"ok": False, "jornada": jornada["numero"], "fuente": url,
                "leidos": nombres, "sueltos": sueltos,
                "motivo": "de los %d nombres del once solo casan %d con la plantilla"
                          % (len(nombres), len(casados))}

    return {"ok": True, "jornada_id": jornada["id"], "jornada": jornada["numero"],
            "fuente": url, "ids": [c["id"] for c in casados], "casados": casados}


def segundos_hasta(desde_iso, hasta_iso):
    """Cuanto falta entre dos instantes, en segundos.

    Los dos vienen de la base de datos, con su huso puesto, asi que aqui solo se
    restan: no hace falta saber de zonas horarias (que en Windows ni se pueden
    consultar) ni fiarse del reloj de la maquina."""
    from datetime import datetime
    return (datetime.fromisoformat(hasta_iso) - datetime.fromisoformat(desde_iso)).total_seconds()


def aviso(texto):
    """Al registro de GitHub, no a la salida: la salida es solo el JSON."""
    print(texto, file=sys.stderr, flush=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    datos = json.load(sys.stdin)
    jornada = datos.get("jornada")
    plantilla = datos.get("plantilla") or []
    vigilar = "--vigilar" in sys.argv

    if not jornada:
        return salir({"ok": False, "motivo": "no hay ningun partido esperando el once"})
    if not plantilla:
        return salir({"ok": False, "motivo": "no hay plantilla con la que comparar"})

    try:
        faltan = segundos_hasta(datos["ahora"], jornada["kickoff"])
    except Exception:
        faltan = 0          # sin saber cuanto falta, se intenta y punto

    arranque = time.monotonic()
    while True:
        transcurrido = time.monotonic() - arranque
        para_el_partido = faltan - transcurrido

        if para_el_partido <= DESDE:
            resultado = intentar(jornada, plantilla)
            if resultado["ok"]:
                return salir(resultado)
        else:
            resultado = {"ok": False, "jornada": jornada["numero"],
                         "motivo": "todavia es pronto: faltan %d minutos para el partido"
                                   % (para_el_partido / 60)}

        if not vigilar:
            return salir(resultado)
        if transcurrido >= TOPE:
            aviso("Se acaba el tiempo de esta ejecucion; lo coge la siguiente.")
            return salir(resultado)
        if para_el_partido <= -HASTA:
            aviso("Han pasado tres horas del inicio: si no ha salido, ya no sale.")
            return salir(resultado)

        aviso("%s. Vuelvo a mirar en %d minutos." % (resultado["motivo"], ESPERA / 60))
        time.sleep(ESPERA)


def salir(resultado):
    print(json.dumps(resultado, ensure_ascii=False, indent=1))
    return resultado


if __name__ == "__main__":
    main()
