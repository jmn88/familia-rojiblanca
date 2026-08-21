#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lee el calendario de LaLiga en la web del Sevilla FC.

El club publica su calendario entero en https://www.sevillafc.es/calendario/sevilla
y, como el resto de la web, va en Next.js: los partidos viajan como JSON dentro
de un <script>, uno por objeto, con todo lo que hace falta:

    "match_day_title":"2", "date_time":"2026-08-22 15:00:00 +0000 UTC",
    "home_team_name":"Athletic Club", "away_team_name":"Sevilla FC",
    "stage_title":"Regular Season", "unknown_datetime":"0"

Asi que no hace falta ni navegador ni la API de LaLiga: se pide la pagina, se
sacan esos objetos y se cruzan con las jornadas que hay en la base de datos.

No escribe nada: recibe por la entrada lo que devuelve robot_pendiente_horario()
y escupe por la salida lo que ha encontrado, en JSON. De guardarlo se encarga el
proceso de GitHub llamando a robot_horario().

    python robot/horario.py < pendiente.json
"""

import json
import re
import sys

import comun

CALENDARIO = comun.BASE + "/calendario/sevilla"

# El id del primer equipo en la web del club. Se comprueba tambien por nombre,
# que de ids ajenos no conviene fiarse del todo (y «Sevilla Atletico», el
# filial, es otro equipo distinto con su propio calendario).
SEVILLA = "41943"


def objetos(texto):
    """Los objetos JSON de partido que hay sueltos dentro de la pagina.

    Se busca "match_id", que solo sale en los partidos, y se abre la llave hacia
    atras y hacia delante contando las que se cierran. Los campos son todos
    planos (cadenas), asi que no hay objetos anidados de por medio."""
    for m in re.finditer(r'"match_id"\s*:', texto):
        i = texto.rfind("{", 0, m.start())
        if i < 0:
            continue
        nivel, dentro, escapa, j = 0, False, False, i
        while j < len(texto):
            c = texto[j]
            if escapa:
                escapa = False
            elif c == "\\":
                escapa = True
            elif c == '"':
                dentro = not dentro
            elif not dentro and c == "{":
                nivel += 1
            elif not dentro and c == "}":
                nivel -= 1
                if nivel == 0:
                    break
            j += 1
        try:
            yield json.loads(texto[i:j + 1])
        except ValueError:
            continue


def cuando(texto):
    """De «2026-08-22 15:00:00 +0000 UTC» saca («2026-08-22 15:00:00+00:00», True).

    Lo segundo es si LaLiga ya ha dicho la hora. El club marca los partidos con
    hora aun sin fijar poniendolos a las 00:00, y unknown_datetime no siempre lo
    canta (comprobado: en agosto de 2026 venia a "0" en las 37 jornadas, con hora
    o sin ella), asi que la medianoche es la senal que vale.

    Aqui NO se toca ningun huso horario: la cadena se deja tal cual la da el club
    y de pasarla a hora de Madrid se encarga PostgreSQL."""
    m = re.match(r"(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)\s*([+-]\d{4})", texto or "")
    if not m:
        return None, False
    dia, hora, huso = m.groups()
    return "%s %s%s:%s" % (dia, hora, huso[:3], huso[3:]), hora != "00:00:00"


def de_liga(p):
    """Solo los de LaLiga: los de Copa no cuentan para la porra."""
    if comun.normal(p.get("championship_title")).find("COPA") >= 0:
        return False
    if comun.normal(p.get("stage_title")) not in ("REGULAR SEASON", ""):
        return False
    return re.fullmatch(r"\d{1,2}", (p.get("match_day_title") or "").strip()) is not None


def leer(html, jornadas):
    """Cruza el calendario del club con las jornadas que hay aqui.

    Se casa por NUMERO de jornada, y el rival y el campo se usan para comprobar
    que la fila es la que parece: si el club dice que la 12 es contra el
    Deportivo Alaves y aqui pone otra cosa, esa jornada se deja en paz."""
    porta = {j["numero"]: j for j in jornadas}
    partidos, dudosos, vistos = [], [], set()

    for p in objetos(comun.desescapar(html)):
        if not de_liga(p) or p.get("match_id") in vistos:
            continue
        vistos.add(p.get("match_id"))

        numero = int(p["match_day_title"].strip())
        mia = porta.get(numero)
        if not mia:
            continue                                  # jugada, o no la tenemos

        en_casa = (p.get("home_team_id") == SEVILLA
                   or comun.normal(p.get("home_team_name")) == "SEVILLA FC")
        rival = p["away_team_name"] if en_casa else p["home_team_name"]
        kickoff, conocida = cuando(p.get("date_time"))

        if not kickoff:
            dudosos.append("Jornada %d: no entiendo la fecha %r" % (numero, p.get("date_time")))
            continue
        if en_casa is not bool(mia["en_casa"]):
            dudosos.append("Jornada %d: el club la pone %s y aqui esta al reves"
                           % (numero, "en el Pizjuan" if en_casa else "fuera"))
            continue
        if comun.nota(mia["rival"], rival) < comun.ACIERTO:
            dudosos.append("Jornada %d: el club dice %r y aqui pone %r"
                           % (numero, rival, mia["rival"]))
            continue

        partidos.append({"jornada": numero, "rival": rival, "en_casa": en_casa,
                         "kickoff": kickoff, "hora_conocida": conocida})

    partidos.sort(key=lambda x: x["jornada"])
    return partidos, dudosos


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    # La entrada trae acentos («Alavés») y en Windows se lee con la pagina de
    # codigos de la consola, que se los carga y luego el rival no cuadra con el
    # del club. En GitHub no pasa, pero asi se puede probar aqui.
    sys.stdin.reconfigure(encoding="utf-8")
    datos = json.load(sys.stdin)
    jornadas = datos.get("jornadas") or []

    if not jornadas:
        return salir({"ok": False, "motivo": "no queda ninguna jornada por delante"})

    partidos, dudosos = leer(comun.pedir(CALENDARIO), jornadas)
    if not partidos:
        return salir({"ok": False, "fuente": CALENDARIO, "dudosos": dudosos,
                      "motivo": "el calendario del club no cuadra con ninguna jornada de las que quedan"})

    salir({"ok": True, "fuente": CALENDARIO, "partidos": partidos,
           "dudosos": dudosos, "leidas": len(partidos)})


def salir(resultado):
    print(json.dumps(resultado, ensure_ascii=False, indent=1))
    return resultado


if __name__ == "__main__":
    main()
