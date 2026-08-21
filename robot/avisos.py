#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Manda los avisos por correo que ha decidido la base de datos.

Lee por la entrada lo que devuelve robot_avisos_pendientes() —el partido y a
quien hay que escribir, con su correo ya descifrado— y manda un correo a cada
uno a traves de Brevo. Hay dos clases, y cada aviso trae la suya en 'tipo':

    convocatoria   ya se sabe a quien ha convocado el Sevilla
    alineacion     faltan 3 horas y esa persona sigue sin enviar su once

Por la salida escupe lo que ha hecho, en JSON y SIN correos: solo nombres. Los
registros de GitHub Actions de un repositorio publico los puede leer cualquiera,
asi que el correo de nadie puede acabar impreso ahi. De apuntar lo enviado se
encarga el proceso de GitHub llamando a robot_aviso_enviado().

Necesita dos variables de entorno, que en GitHub son secrets:

    BREVO_API_KEY     la clave de la API de Brevo
    BREVO_REMITENTE   la direccion verificada desde la que salen los correos

    python robot/avisos.py < pendientes.json
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime

WEB   = "https://jmn88.github.io/familia-rojiblanca/"
BREVO = "https://api.brevo.com/v3/smtp/email"
DE    = "Familia Rojiblanca"

DIAS  = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


# ------------------------------------------------------------ las fechas ---
# Vienen ya en hora de Madrid y escritas como «2026-08-15 21:30», que las pasa
# PostgreSQL: aqui solo se les pone nombre al dia y al mes. Asi no hace falta
# que la maquina que manda los correos sepa nada de husos horarios.

def momento(local):
    return datetime.strptime(local, "%Y-%m-%d %H:%M")


def hora(local):
    return momento(local).strftime("%H:%M")


def cuando(local, hoy):
    """«hoy a las 21:30» o «el sábado 15 de agosto a las 21:30»."""
    t = momento(local)
    if local.startswith(hoy or ""):
        return "hoy a las %s" % t.strftime("%H:%M")
    return "el %s %d de %s a las %s" % (DIAS[t.weekday()], t.day, MESES[t.month - 1],
                                        t.strftime("%H:%M"))


# ------------------------------------------------- trozos que se repiten ---

def partido_de(j):
    return ("Sevilla – %s" if j["en_casa"] else "%s – Sevilla") % j["rival"]


def enumerar(nombres):
    """«Marcao», «Marcao y Alfon», «Marcao, Alfon y Peque»."""
    if len(nombres) == 1:
        return nombres[0]
    return ", ".join(nombres[:-1]) + " y " + nombres[-1]


def cierre_de(j):
    return ("El plazo cierra a las %s —una hora antes del partido, o antes si el Sevilla "
            "publica el once—. Después ya no se admiten envíos ni cambios."
            % hora(j["cierre_local"]))


def sin_hora(j):
    if j.get("hora_confirmada") is False:
        return ["", "(LaLiga aún no ha confirmado la hora de este partido, así que tanto "
                    "ella como el cierre pueden moverse.)"]
    return []


def pie(enlace="Manda tu once aquí:"):
    return ["", enlace, WEB, "", "—",
            "Familia Rojiblanca. Recibes este aviso porque lo activaste tú. Para dejar de "
            "recibirlos, entra en la web, ve a «Mi alineación» y apágalos abajo del todo."]


# --------------------------------------------------------- los dos correos ---

def mensaje_alineacion(a, j, hoy):
    partido = partido_de(j)
    lineas = [
        "Hola %s:" % a["nombre"],
        "",
        "Todavía no has enviado tu alineación para la jornada %d, %s, que se juega %s."
        % (j["numero"], partido, cuando(j["kickoff_local"], hoy)),
        "",
        cierre_de(j),
    ] + sin_hora(j) + pie()
    return "Te falta la alineación · Jornada %d · %s" % (j["numero"], partido), "\n".join(lineas)


def mensaje_convocatoria(a, j, hoy):
    partido = partido_de(j)
    convocados = j.get("convocados") or []
    fuera = a.get("fuera") or []

    lineas = [
        "Hola %s:" % a["nombre"],
        "",
        "Ya se conoce la convocatoria del Sevilla para la jornada %d, %s, que se juega %s."
        % (j["numero"], partido, cuando(j["kickoff_local"], hoy)),
        "",
        "Convocados (%d):" % len(convocados),
    ]
    lineas += ["  %2s  %s" % (c.get("dorsal") if c.get("dorsal") is not None else "·", c["nombre"])
               for c in convocados]
    lineas += ["", "A partir de ahora solo se puede alinear a estos."]

    # y lo que le toca a cada uno segun como tenga su once
    if fuera:
        lineas += [
            "",
            "OJO: en tu alineación tienes a %s, que se %s quedado fuera. Tu alineación "
            "sigue contando tal cual, pero %s acertar, porque no %s a salir en el once "
            "inicial: te interesa cambiar%s antes del cierre."
            % (enumerar(fuera),
               "ha" if len(fuera) == 1 else "han",
               "ese jugador no puede" if len(fuera) == 1 else "esos jugadores no pueden",
               "va" if len(fuera) == 1 else "van",
               "lo" if len(fuera) == 1 else "los"),
        ]
    elif not a.get("enviada"):
        lineas += ["", "Todavía no has enviado tu alineación."]
    else:
        lineas += ["", "Tu alineación ya está enviada y todos los tuyos están convocados: "
                       "no tienes que hacer nada."]

    lineas += ["", cierre_de(j)] + sin_hora(j) + pie(
        "Repasa o cambia tu once aquí:" if a.get("enviada") else "Manda tu once aquí:")
    return "Ya hay convocatoria · Jornada %d · %s" % (j["numero"], partido), "\n".join(lineas)


def mensaje(a, j, hoy):
    if a.get("tipo") == "convocatoria":
        return mensaje_convocatoria(a, j, hoy)
    return mensaje_alineacion(a, j, hoy)


# ---------------------------------------------------------------- enviar ---

def como_html(texto):
    """El mismo texto, para los clientes de correo que prefieren HTML."""
    limpio = texto.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    limpio = limpio.replace(WEB, '<a href="%s">%s</a>' % (WEB, WEB))
    return ('<div style="font:15px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif">%s</div>'
            % limpio.replace("\n", "<br>"))


def sin_correos(texto):
    """Tapa cualquier direccion antes de que pueda acabar en el registro."""
    return re.sub(r"[^\s\"'<>]+@[^\s\"'<>]+", "***@***", texto or "")


def mandar(clave, remitente, destino, nombre, asunto, texto):
    cuerpo = json.dumps({
        "sender":      {"name": DE, "email": remitente},
        "to":          [{"email": destino, "name": nombre}],
        "subject":     asunto,
        "textContent": texto,
        "htmlContent": como_html(texto),
    }).encode("utf-8")

    peticion = urllib.request.Request(BREVO, data=cuerpo, headers={
        "api-key":      clave,
        "content-type": "application/json",
        "accept":       "application/json",
    })
    with urllib.request.urlopen(peticion, timeout=30) as respuesta:
        return respuesta.status


# ------------------------------------------------------------------ main ---

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    datos = json.load(sys.stdin)
    jornada = datos.get("jornada")
    pendientes = datos.get("avisos") or []

    if not jornada:
        return salir({"ok": False, "motivo": "no hay ningun partido esperando avisos"})
    if not pendientes:
        return salir({"ok": False, "jornada": jornada["numero"],
                      "motivo": "no hay a quien avisar: o ya lo saben, o no tienen avisos"})

    clave     = (os.environ.get("BREVO_API_KEY") or "").strip()
    remitente = (os.environ.get("BREVO_REMITENTE") or "").strip()
    if not clave or not remitente:
        print("::error::Hay %d aviso(s) que mandar, pero faltan los secrets BREVO_API_KEY "
              "y/o BREVO_REMITENTE. Esta explicado en el README." % len(pendientes))
        raise SystemExit(1)

    enviados, nombres, fallos = [], [], []
    for a in pendientes:
        tipo = a.get("tipo") or "alineacion"
        asunto, texto = mensaje(a, jornada, datos.get("hoy"))
        try:
            mandar(clave, remitente, a["email"], a["nombre"], asunto, texto)
            enviados.append({"participante_id": int(a["participante_id"]), "tipo": tipo})
            nombres.append("%s (%s)" % (a["nombre"], tipo))
        except urllib.error.HTTPError as e:
            detalle = sin_correos(e.read().decode("utf-8", "replace"))[:200]
            fallos.append({"nombre": a["nombre"], "tipo": tipo,
                           "motivo": "Brevo contesta %d: %s" % (e.code, detalle)})
        except Exception as e:                       # red caida, tiempo agotado…
            fallos.append({"nombre": a["nombre"], "tipo": tipo,
                           "motivo": sin_correos(str(e))[:200]})

    salir({"ok": bool(enviados),
           "jornada_id": jornada["id"], "jornada": jornada["numero"],
           "enviados": enviados, "nombres": nombres,
           "n_enviados": len(enviados), "n_fallos": len(fallos), "fallos": fallos,
           "motivo": "" if enviados else "no ha salido ningun correo"})


def salir(resultado):
    print(json.dumps(resultado, ensure_ascii=False, indent=1))
    return resultado


if __name__ == "__main__":
    main()
