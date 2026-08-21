#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""El resumen que sale en la pestaña Actions despues de repasar el calendario.

Va en un fichero aparte y no dentro del workflow porque un heredoc de Python
metido en un «run: |» de YAML rompe la indentacion del propio YAML. Ya paso.

    python robot/resumen_horario.py resultado.json guardado.json
"""

import json
import sys


def lista(titulo, filas, vacio):
    print("**%s**" % titulo)
    print("")
    for f in filas or []:
        print("- " + f)
    if not filas:
        print("- " + vacio)
    print("")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    leido = json.load(open(sys.argv[1], encoding="utf-8"))
    hecho = json.load(open(sys.argv[2], encoding="utf-8"))

    print("## Calendario repasado")
    print("")
    print("Fuente: %s" % leido.get("fuente", ""))
    print("")
    lista("Horarios cambiados", hecho.get("cambiadas"),
          "ninguno: todo estaba ya al dia")
    lista("Discrepancias sin aplicar (esa hora la puso una persona)", hecho.get("avisos"),
          "ninguna")
    lista("Filas del club que no cuadran con lo que hay aqui", leido.get("dudosos"),
          "ninguna")
    print("Jornadas que ya estaban bien: %s. Sin tocar (plazo cerrado o que no tenemos): %s."
          % (hecho.get("sin_cambio"), hecho.get("no_tocadas")))


if __name__ == "__main__":
    main()
