#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Avisa al administrador de que alguien ha pedido entrar en la porra.

Lee por la entrada lo que devuelve robot_solicitudes_pendientes() —las
solicitudes que aun no se han avisado y el correo del administrador, ya
descifrado— y manda UN correo con todas ellas. Uno solo, no uno por solicitud:
si entran tres seguidas, tres correos serian dos de mas.

Por la salida escupe lo que ha hecho, en JSON y SIN correos: solo nombres. Los
registros de GitHub Actions de un repositorio publico los puede leer cualquiera.
De apuntar lo avisado se encarga el proceso de GitHub llamando a
robot_solicitud_avisada().

El envio es el mismo de siempre (Brevo), asi que se reutiliza tal cual el de
robot/avisos.py con sus dos secrets:

    BREVO_API_KEY     la clave de la API de Brevo
    BREVO_REMITENTE   la direccion verificada desde la que salen los correos

    python robot/solicitudes.py < pendientes.json
"""

import json
import os
import sys
import urllib.error

import avisos


def cuando(local):
    """«el 21 de agosto a las 14:05», de «2026-08-21 14:05» (ya en hora de Madrid)."""
    t = avisos.momento(local)
    return "el %d de %s a las %s" % (t.day, avisos.MESES[t.month - 1], t.strftime("%H:%M"))


def mensaje(admin, solicitudes, pendientes):
    una = len(solicitudes) == 1

    lineas = [
        "Hola %s:" % admin["nombre"],
        "",
        ("Alguien ha pedido entrar en la porra." if una
         else "Han pedido entrar en la porra %d personas." % len(solicitudes)),
        "",
    ]
    for s in solicitudes:
        lineas.append("  %s — lo pidió %s%s"
                      % (s["nombre"], cuando(s["creada_local"]),
                         ", y quiere los avisos por correo" if s.get("avisos") else ""))

    lineas += [
        "",
        "Nadie entra hasta que tú lo apruebes: hasta entonces no sale en la lista "
        "de la pantalla de entrar, ni en la clasificación, ni recibe nada.",
        "",
        "Para aprobarlo o rechazarlo, entra en la web y ve a Admin, a la tarjeta "
        "«Solicitudes para entrar».",
    ]
    if pendientes and pendientes > len(solicitudes):
        lineas += ["", "(En total tienes %d solicitudes esperando.)" % pendientes]

    lineas += ["", "Abre la porra aquí:", avisos.WEB, "", "—",
               "Familia Rojiblanca. Recibes este aviso porque eres el administrador."]

    asunto = ("Alguien quiere entrar en la porra: %s" % solicitudes[0]["nombre"] if una
              else "%d personas quieren entrar en la porra" % len(solicitudes))
    return asunto, "\n".join(lineas)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    datos = json.load(sys.stdin)

    solicitudes = datos.get("solicitudes") or []
    admin = datos.get("admin")

    if not solicitudes:
        return salir({"ok": False, "motivo": "no hay ninguna solicitud sin avisar"})
    if not admin or not admin.get("email"):
        # No es un error del proceso: es que falta configurarlo. Se dice y ya.
        return salir({"ok": False, "n_solicitudes": len(solicitudes),
                      "motivo": "hay %d solicitud(es) esperando, pero no hay a quien avisar: "
                                "en Admin, en la tarjeta de solicitudes, elige a quien se "
                                "le avisa (y que esa persona tenga su correo puesto)"
                                % len(solicitudes)})

    clave     = (os.environ.get("BREVO_API_KEY") or "").strip()
    remitente = (os.environ.get("BREVO_REMITENTE") or "").strip()
    if not clave or not remitente:
        print("::error::Hay %d solicitud(es) que avisar, pero faltan los secrets "
              "BREVO_API_KEY y/o BREVO_REMITENTE. Esta explicado en el README."
              % len(solicitudes))
        raise SystemExit(1)

    asunto, texto = mensaje(admin, solicitudes, datos.get("pendientes"))
    nombres = [s["nombre"] for s in solicitudes]

    try:
        avisos.mandar(clave, remitente, admin["email"], admin["nombre"], asunto, texto)
    except urllib.error.HTTPError as e:
        detalle = avisos.sin_correos(e.read().decode("utf-8", "replace"))[:200]
        return salir({"ok": False, "nombres": nombres, "n_fallos": 1,
                      "motivo": "Brevo contesta %d: %s" % (e.code, detalle)})
    except Exception as e:                           # red caida, tiempo agotado…
        return salir({"ok": False, "nombres": nombres, "n_fallos": 1,
                      "motivo": avisos.sin_correos(str(e))[:200]})

    salir({"ok": True, "avisadas": [int(s["id"]) for s in solicitudes],
           "nombres": nombres, "n_enviados": 1, "n_fallos": 0, "motivo": ""})


def salir(resultado):
    print(json.dumps(resultado, ensure_ascii=False, indent=1))
    return resultado


if __name__ == "__main__":
    main()
