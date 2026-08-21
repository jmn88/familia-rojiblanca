-- Familia Rojiblanca 26/27 — el robot del horario oficial
--
-- LaLiga fija el dia y la hora exactos de cada partido pocas semanas antes, y
-- ademas los mueve: un partido de sabado puede acabar jugandose el domingo. Eso
-- se venia corrigiendo a mano, jornada a jornada, desde el panel Admin.
--
-- El club publica su calendario entero (las 38 jornadas, con hora) dentro de
-- https://www.sevillafc.es/calendario/sevilla, asi que un proceso de GitHub lo
-- repasa dos veces por semana y trae lo que falte.
--
-- Como en los demas robots, quien decide que se toca y que no es SQL:
--
--   * con el plazo ya cerrado no se toca nada — el partido se esta jugando o ya
--     se jugo, y mover el kickoff moveria tambien el cierre de algo que ya paso;
--   * si la hora la confirmo UNA PERSONA (hora_confirmada con horario_fuente a
--     null), el robot no la pisa: apunta la discrepancia en horario_aviso para
--     que salga en rojo en Admin y que decida el administrador;
--   * lo que puso el propio robot si lo puede volver a mover, que para eso esta.
--
-- Estas funciones NO son para la web: se llaman desde el proceso de GitHub, que
-- entra con la cadena de conexion del secret SUPABASE_DB_URL. Por eso al final
-- se les retira el permiso al rol publico.

-- (las columnas horario_* se crean en 01_esquema.sql, con las demas)

-- Que jornadas tienen sentido repasar: las que aun no han cerrado. Si no queda
-- ninguna (temporada terminada) el robot se va de vacio sin pedir la pagina.
--
-- Va el rival de cada una porque los nombres del club son mas largos que los de
-- aqui («Deportivo Alaves» / «Alaves»), y quien los cruza es robot/comun.py: si
-- no cuadran, esa jornada se deja en paz en vez de escribirle la hora de otra.
create or replace function robot_pendiente_horario()
returns json language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select json_build_object(
    'ahora', now(),
    'jornadas', (
      select coalesce(json_agg(json_build_object(
               'numero', numero, 'rival', rival, 'en_casa', en_casa,
               'kickoff', kickoff, 'hora_confirmada', hora_confirmada)
             order by numero), '[]'::json)
        from jornadas
       where now() < f_cierre_efectivo(cierre, prorroga_hasta))
  )
$$;

-- Aplica el calendario que ha leido el robot.
--
-- Recibe una lista de {jornada, rival, en_casa, kickoff, hora_conocida}. El
-- kickoff viene en UTC tal cual lo publica el club; de pasarlo a hora de Madrid
-- se encarga PostgreSQL, que para eso sabe de husos y de horarios de verano.
--
-- hora_conocida a false = el club sabe el dia pero LaLiga aun no ha dicho la
-- hora (la publica a las 00:00). Entonces solo se mueve el dia y se respeta la
-- hora orientativa que hubiera, que sigue marcada como sin confirmar.
create or replace function robot_horario(p_partidos json, p_fuente text)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  p          json;
  j          jornadas;
  v_conocida boolean;
  v_nuevo    timestamptz;
  v_margen   interval;
  v_cambia   boolean;
  v_antes    text;
  v_ahora    text;
  v_cambios  text[] := '{}';
  v_avisos   text[] := '{}';
  v_igual    int := 0;
  v_fuera    int := 0;
begin
  for p in select value from json_array_elements(p_partidos) loop
    select * into j from jornadas where numero = (p->>'jornada')::int;
    if not found then v_fuera := v_fuera + 1; continue; end if;

    -- plazo cerrado: ni se mira
    if now() >= f_cierre_efectivo(j.cierre, j.prorroga_hasta) then
      v_fuera := v_fuera + 1;
      continue;
    end if;

    v_conocida := coalesce((p->>'hora_conocida')::boolean, false);

    if v_conocida then
      v_nuevo := (p->>'kickoff')::timestamptz;
      -- tambien cuenta como cambio pasar de orientativa a oficial, aunque la
      -- hora que hubiera puesta resulte ser la buena
      v_cambia := v_nuevo <> j.kickoff or not j.hora_confirmada;
    else
      -- el dia que dice el club, con la hora orientativa que ya tuviera aqui
      v_nuevo := ((((p->>'kickoff')::timestamptz at time zone 'UTC')::date)
                  + (j.kickoff at time zone 'Europe/Madrid')::time)
                 at time zone 'Europe/Madrid';
      v_cambia := v_nuevo <> j.kickoff;
    end if;

    update jornadas set horario_visto_en = now() where id = j.id;

    if not v_cambia then v_igual := v_igual + 1; continue; end if;

    v_antes := to_char(j.kickoff at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI');
    v_ahora := to_char(v_nuevo   at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI');

    -- La hora la confirmo una persona: manda ella. Se apunta la discrepancia y
    -- se enseña en Admin, que es donde hay alguien para decidir.
    if j.hora_confirmada and j.horario_fuente is null then
      update jornadas
         set horario_aviso = case when v_conocida
               then format('El club dice ahora %s, y aqui esta puesto el %s como hora oficial.',
                           v_ahora, v_antes)
               else format('El club ha movido el partido al %s, y aqui esta puesto el %s; todavia no dice a que hora.',
                           to_char(v_nuevo at time zone 'Europe/Madrid', 'DD/MM/YYYY'), v_antes)
             end
       where id = j.id;
      v_avisos := v_avisos || format('Jornada %s (%s): %s -> %s, pero la hora la puso una persona: no se toca',
                                     j.numero, j.rival, v_antes, v_ahora);
      continue;
    end if;

    -- Se mueve la hora y con ella el cierre, manteniendo el margen que hubiera
    -- (una hora, salvo que el administrador lo cambiara para esa jornada).
    v_margen := j.kickoff - j.cierre;

    update jornadas
       set kickoff         = v_nuevo,
           cierre          = v_nuevo - v_margen,
           hora_confirmada = v_conocida,
           horario_fuente  = p_fuente,
           horario_aviso   = null
     where id = j.id;

    v_cambios := v_cambios || format('Jornada %s (%s): %s -> %s%s',
                                     j.numero, j.rival, v_antes, v_ahora,
                                     case when v_conocida then ''
                                          else ' (solo el dia; la hora sigue sin confirmar)' end);
  end loop;

  return json_build_object(
    'ok', true,
    'cambiadas',  array_to_json(v_cambios),
    'avisos',     array_to_json(v_avisos),
    'sin_cambio', v_igual,
    'no_tocadas', v_fuera);
end $$;

-- ------------------------------------------------------------- permisos ---
-- Solo el proceso de GitHub con la cadena de conexion. Como se explica en
-- 05_robot.sql, no basta con quitarselo a anon: PostgreSQL da execute a PUBLIC
-- en cada funcion nueva y anon lo hereda. Y hay que hacerlo aqui mismo, porque
-- 02_api.sql vuelve a dar permiso a todas las funciones cada vez que se aplica
-- y el bucle de 05_robot.sql ya ha pasado cuando se llega a este fichero.

revoke execute on function robot_pendiente_horario() from public, anon, authenticated;
revoke execute on function robot_horario(json, text) from public, anon, authenticated;

-- Y se comprueba, que esto no puede quedarse a medias sin que nadie se entere.
do $$
declare v_abiertas text;
begin
  select string_agg(p.proname, ', ') into v_abiertas
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('robot_pendiente_horario', 'robot_horario')
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));

  if v_abiertas is not null then
    raise exception 'El robot del horario sigue abierto al rol anonimo: %', v_abiertas;
  end if;
end $$;
