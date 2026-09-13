#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Manda el correo con los resultados de la jornada.

En cuanto se conoce el once inicial y el plazo esta cerrado, a cada
participante con avisos le llega un correo con el once del Sevilla, lo que ha
hecho el (aciertos, puntos y puesto), la clasificacion del dia y la general,
y la imagen del resumen —la misma que se comparte por WhatsApp— adjunta.

Lee por la entrada lo que devuelve robot_resultados_pendientes(): la jornada,
las filas ya puntuadas, el once, la general y a quien hay que escribir, con su
correo descifrado. Reutiliza de robot/avisos.py el envio por Brevo y los trozos
de texto. Por la salida escupe lo hecho en JSON y SIN correos, solo nombres:
los registros de GitHub los lee cualquiera.

    python robot/resultados.py [--imagen resumen.png] < pendientes.json

Con --esperar no manda nada: imprime cuantos segundos faltan para que se cierre
el plazo por el reloj (0 si ya esta cerrado o no hay jornada). El correo lleva
las alineaciones de todos, y la web no las revela hasta el cierre: lo mismo
tiene que hacer el correo, asi que el proceso de GitHub espera ese rato.
"""

import base64
import json
import os
import sys
import urllib.error
from datetime import datetime

import avisos
from avisos import WEB, cuando, enumerar, partido_de, sin_correos

# a cuantos se pone en la general del correo, para no alargarlo
TOPE_GENERAL = 12


# ------------------------------------------------------------ el texto ---

def ordinal(n):
    return "%dº" % n


def fila_de(datos, participante_id):
    for f in datos.get("filas") or []:
        if f["participante_id"] == participante_id:
            return f
    return None


def mi_resultado(f, filas, once, nombre):
    """El parrafo de «tu resultado», con los empates y los fallos."""
    if not f or not f.get("participo"):
        return ["No enviaste alineación en esta jornada, así que te quedas con 0 puntos."]

    empatados = [x["nombre"] for x in filas
                 if x["puesto"] == f["puesto"] and x["participante_id"] != f["participante_id"]]
    lineas = ["Acertaste %d de 11: %d %s. Quedas %s de la jornada%s."
              % (f["aciertos"], f["puntos"], "punto" if f["puntos"] == 1 else "puntos",
                 ordinal(f["puesto"]),
                 " (empatado con %s)" % enumerar(empatados) if empatados else "")]
    if f["aciertos"] == 11:
        lineas.append("¡PLENO! Los once, clavados.")
    else:
        fallos = [nombre(id) for id in (f.get("picks") or []) if id not in once]
        if fallos:
            lineas.append("Te %s: %s." % ("falló" if len(fallos) == 1 else "fallaron", enumerar(fallos)))
    return lineas


def mensaje(a, datos, hoy, con_imagen):
    j = datos["jornada"]
    partido = partido_de(j)
    once = j.get("once_oficial") or []
    filas = datos.get("filas") or []
    general = datos.get("general") or []
    jugadores = {x["id"]: x for x in datos.get("jugadores") or []}
    nombre = lambda id: (jugadores.get(id) or {}).get("nombre") or ("#%s" % id)
    dorsal = lambda x: x.get("dorsal") if x.get("dorsal") is not None else "·"

    yo = fila_de(datos, a["participante_id"])

    lineas = [
        "Hola %s:" % a["nombre"],
        "",
        "Ya está puntuada la jornada %d, %s, que se juega %s."
        % (j["numero"], partido, cuando(j["kickoff_local"], hoy)),
        "",
        "TU RESULTADO",
    ] + mi_resultado(yo, filas, once, nombre)

    lineas += ["", "ONCE INICIAL DEL SEVILLA"]
    lineas += ["  %2s  %s" % (dorsal(x), x["nombre"]) for x in datos.get("once") or []]

    if yo and yo.get("participo"):
        lineas += ["", "TU ALINEACIÓN (✓ acierto · ✗ fallo)"]
        lineas += ["  %s  %s" % ("✓" if id in once else "✗", nombre(id)) for id in yo.get("picks") or []]

    lineas += ["", "CLASIFICACIÓN DE LA JORNADA"]
    for f in filas:
        if f.get("participo"):
            lineas.append("  %s  %s — %d de 11 — %d %s%s"
                          % (ordinal(f["puesto"]), f["nombre"], f["aciertos"], f["puntos"],
                             "punto" if f["puntos"] == 1 else "puntos",
                             "  ← tú" if f["participante_id"] == a["participante_id"] else ""))
        else:
            lineas.append("  %s  %s — no envió alineación — 0 puntos%s"
                          % (ordinal(f["puesto"]), f["nombre"],
                             "  ← tú" if f["participante_id"] == a["participante_id"] else ""))

    n = datos.get("jornadas_jugadas") or 0
    lineas += ["", "CLASIFICACIÓN GENERAL (después de %d %s)" % (n, "jornada" if n == 1 else "jornadas")]
    for t in general[:TOPE_GENERAL]:
        lineas.append("  %s  %s — %d %s%s"
                      % (ordinal(t["puesto"]), t["nombre"], t["puntos"],
                         "punto" if t["puntos"] == 1 else "puntos",
                         "  ← tú" if t["participante_id"] == a["participante_id"] else ""))
    if len(general) > TOPE_GENERAL:
        lineas.append("  … y %d más." % (len(general) - TOPE_GENERAL))

    if con_imagen:
        lineas += ["", "Va adjunta la imagen con el resumen de la jornada, por si la quieres "
                       "mandar al grupo."]

    lineas += ["", "Las alineaciones de todos, con sus aciertos, están en la web:", WEB, "", "—",
               "Familia Rojiblanca. Recibes este correo porque activaste los avisos. Para "
               "dejar de recibirlos, entra en la web, ve a «Mi alineación» y apágalos abajo "
               "del todo."]

    return ("Resultados · Jornada %d · %s" % (j["numero"], partido)), "\n".join(lineas)


# ------------------------------------------------------------- esperar ---

def segundos_para_el_cierre(datos):
    """Cuanto falta para que el plazo se cierre por el reloj; 0 si ya lo esta."""
    j = datos.get("jornada")
    if not j or j.get("cerrada"):
        return 0
    try:
        falta = (datetime.fromisoformat(j["cierre"])
                 - datetime.fromisoformat(datos["ahora"])).total_seconds()
    except Exception:
        return 0
    return max(0, int(falta) + 5)     # cinco segundos de margen, por el reloj


# ---------------------------------------------------------------- main ---

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    datos = json.load(sys.stdin)

    if "--esperar" in sys.argv:
        print(segundos_para_el_cierre(datos))
        return

    jornada = datos.get("jornada")
    pendientes = datos.get("avisos") or []

    if not jornada:
        return salir({"ok": False, "motivo": "no hay ninguna jornada con resultados que mandar"})
    if not jornada.get("cerrada"):
        return salir({"ok": False, "jornada": jornada["numero"],
                      "motivo": "el plazo de la jornada %d aun no se ha cerrado por el reloj"
                                % jornada["numero"]})
    if not pendientes:
        return salir({"ok": False, "jornada": jornada["numero"],
                      "motivo": "no hay a quien mandar los resultados: o ya los tienen, o no tienen avisos"})

    clave     = (os.environ.get("BREVO_API_KEY") or "").strip()
    remitente = (os.environ.get("BREVO_REMITENTE") or "").strip()
    if not clave or not remitente:
        print("::error::Hay %d correo(s) de resultados que mandar, pero faltan los secrets "
              "BREVO_API_KEY y/o BREVO_REMITENTE. Esta explicado en el README." % len(pendientes))
        raise SystemExit(1)

    # la imagen del resumen, si el paso anterior la ha podido dibujar
    adjuntos = None
    if "--imagen" in sys.argv:
        ruta = sys.argv[sys.argv.index("--imagen") + 1]
        if os.path.isfile(ruta) and os.path.getsize(ruta) > 0:
            with open(ruta, "rb") as f:
                adjuntos = [{"name": "familia-rojiblanca-jornada-%d.png" % jornada["numero"],
                             "content": base64.b64encode(f.read()).decode("ascii")}]

    enviados, nombres, fallos = [], [], []
    for a in pendientes:
        asunto, texto = mensaje(a, datos, datos.get("hoy"), bool(adjuntos))
        try:
            avisos.mandar(clave, remitente, a["email"], a["nombre"], asunto, texto, adjuntos)
            enviados.append({"participante_id": int(a["participante_id"]), "tipo": "resultado"})
            nombres.append(a["nombre"])
        except urllib.error.HTTPError as e:
            detalle = sin_correos(e.read().decode("utf-8", "replace"))[:200]
            fallos.append({"nombre": a["nombre"], "tipo": "resultado",
                           "motivo": "Brevo contesta %d: %s" % (e.code, detalle)})
        except Exception as e:                       # red caida, tiempo agotado…
            fallos.append({"nombre": a["nombre"], "tipo": "resultado",
                           "motivo": sin_correos(str(e))[:200]})

    salir({"ok": bool(enviados),
           "prueba": bool(datos.get("prueba")),
           "jornada_id": jornada["id"], "jornada": jornada["numero"],
           "con_imagen": bool(adjuntos),
           "enviados": enviados, "nombres": nombres,
           "n_enviados": len(enviados), "n_fallos": len(fallos), "fallos": fallos,
           "motivo": "" if enviados else "no ha salido ningun correo"})


def salir(resultado):
    print(json.dumps(resultado, ensure_ascii=False, indent=1))
    return resultado


if __name__ == "__main__":
    main()
