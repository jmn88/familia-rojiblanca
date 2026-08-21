#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Convierte lo que ha encontrado un robot en la orden de SQL que lo guarda.

Antes esto se hacia con las variables de psql (`:'jornada'`), y no funcionaba:
psql NO sustituye variables en las ordenes que se le pasan con -c, se las manda
al servidor tal cual, y el servidor se atraganta con los dos puntos:

    ERROR:  syntax error at or near ":"

Asi que la orden se arma aqui, entera y ya escapada, y se le da a psql por la
entrada. Los numeros pasan por int(), de modo que por ahi no puede colarse nada,
y el texto va con las comillas dobladas, como manda SQL.

    python robot/orden_sql.py once < resultado.json | psql "$PGCONN" -f -
"""

import json
import sys

FUNCIONES = {
    "convocatoria": "robot_convocatoria",
    "once": "robot_once",
}


def texto(valor):
    """Un literal de texto de SQL: entre comillas simples y con las de dentro dobladas."""
    return "'" + str(valor).replace("'", "''") + "'"


def orden(cual, datos):
    if cual not in FUNCIONES:
        raise SystemExit("no se que guardar: %r" % cual)
    if not datos.get("ok"):
        raise SystemExit("el robot no ha encontrado nada que guardar")

    jornada = int(datos["jornada_id"])
    ids = ",".join(str(int(i)) for i in datos["ids"])
    return "select %s(%d, '{%s}'::int[], %s);" % (
        FUNCIONES[cual], jornada, ids, texto(datos.get("fuente") or ""))


def avisos(datos):
    """Las ordenes que apuntan los recordatorios que SI han salido.

    Una por persona y clase de aviso, y solo de las que han salido: si a alguien
    le fallo el correo, no se apunta y se le vuelve a intentar en el siguiente
    pase."""
    jornada = int(datos["jornada_id"])
    filas = datos.get("enviados") or []
    if not filas:
        raise SystemExit("no ha salido ningun aviso que apuntar")
    return "\n".join(
        "select robot_aviso_enviado(%d, %d, %s);"
        % (jornada, int(f["participante_id"]), texto(f.get("tipo") or "alineacion"))
        for f in filas)


def horario(datos):
    """La orden que aplica el calendario que ha leido robot/horario.py.

    Va la lista entera en un solo json: quien decide que jornada se toca y cual
    no es robot_horario(), en SQL, como en todo lo que importa."""
    if not datos.get("ok"):
        raise SystemExit("el robot no ha encontrado nada que guardar")
    partidos = json.dumps(datos.get("partidos") or [], ensure_ascii=False)
    return "select robot_horario(%s::json, %s);" % (texto(partidos),
                                                    texto(datos.get("fuente") or ""))


def nota(pendiente, motivo):
    """La orden que apunta un intento fallido del robot del once.

    Recibe lo que devolvio robot_pendiente_once(): si no habia ningun partido
    esperando, no hay nada que apuntar."""
    jornada = (pendiente.get("jornada") or {}).get("id")
    if not jornada:
        raise SystemExit("no habia ningun partido esperando el once")
    return "select robot_once_nota(%d, %s);" % (int(jornada), texto(motivo or ""))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    # Lo que llega trae acentos, y en Windows la entrada se lee con la pagina de
    # codigos de la consola: sin esto, «Alavés» sale destrozado al probarlo aqui.
    sys.stdin.reconfigure(encoding="utf-8")
    cual = sys.argv[1] if len(sys.argv) > 1 else ""
    if cual == "nota":
        print(nota(json.load(sys.stdin), sys.argv[2] if len(sys.argv) > 2 else ""))
    elif cual == "horario":
        print(horario(json.load(sys.stdin)))
    elif cual == "avisos":
        print(avisos(json.load(sys.stdin)))
    else:
        print(orden(cual, json.load(sys.stdin)))


if __name__ == "__main__":
    main()
