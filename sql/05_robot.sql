-- Familia Rojiblanca 26/27 — el robot de la convocatoria
--
-- El Sevilla FC publica la convocatoria de cada partido en su propia web, y en
-- texto («La lista completa la forman: …»). Un proceso de GitHub la busca el dia
-- del partido y la carga aqui, para no tener que subir la foto a mano.
--
-- Estas funciones NO son para la web: se llaman desde ese proceso, que entra con
-- la cadena de conexion del secret SUPABASE_DB_URL. Por eso al final se les
-- retira el permiso al rol publico: con la clave anon no se pueden tocar.

-- (la columna convocatoria_fuente se crea en 01_esquema.sql, con las demas)

-- Que jornada necesita convocatoria, y con que plantilla comparar los nombres.
-- La decision de "a cual le toca" se queda en SQL, como todo lo que importa.
create or replace function robot_pendiente()
returns json language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select json_build_object(
    'ahora', now(),
    'jornada', (
      select json_build_object('id', id, 'numero', numero, 'rival', rival,
                               'en_casa', en_casa, 'kickoff', kickoff,
                               'cierre', f_cierre_efectivo(cierre, prorroga_hasta))
        from jornadas
       where convocatoria is null                                   -- aun sin cargar
         and now() < f_cierre_efectivo(cierre, prorroga_hasta)      -- y con el plazo abierto
         and kickoff < now() + interval '3 days'                    -- solo el partido que viene
       order by numero
       limit 1),
    'plantilla', (
      select coalesce(json_agg(json_build_object('id', id, 'nombre', nombre, 'dorsal', dorsal)
                    order by id), '[]'::json)
        from jugadores where activo)
  )
$$;

-- Carga la convocatoria que ha encontrado el robot.
--
-- Nunca pisa lo que ya hubiera: si el administrador la cargo a mano (o la
-- corrigio), esa manda y el robot se calla. Tampoco carga nada con el plazo ya
-- cerrado, que solo serviria para estorbar.
create or replace function robot_convocatoria(p_jornada int, p_jugadores int[], p_fuente text)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare j jornadas; n int; v_total int;
begin
  select * into j from jornadas where id = p_jornada;
  if not found then return json_build_object('ok', false, 'error', 'Jornada no encontrada'); end if;

  if j.convocatoria is not null then
    return json_build_object('ok', false, 'error', 'Esa jornada ya tiene convocatoria: no se toca');
  end if;

  if now() >= f_cierre_efectivo(j.cierre, j.prorroga_hasta) then
    return json_build_object('ok', false, 'error', 'El plazo ya esta cerrado');
  end if;

  v_total := coalesce(array_length(p_jugadores, 1), 0);
  if v_total < 11 then
    return json_build_object('ok', false, 'error', 'La convocatoria necesita 11 jugadores como minimo');
  end if;

  select count(distinct x) into n from unnest(p_jugadores) x;
  if n <> v_total then return json_build_object('ok', false, 'error', 'Hay jugadores repetidos'); end if;

  select count(*) into n from jugadores where id = any(p_jugadores) and activo;
  if n <> v_total then
    return json_build_object('ok', false, 'error', 'Algun jugador no esta en la plantilla');
  end if;

  update jornadas
     set convocatoria = p_jugadores, convocatoria_en = now(), convocatoria_fuente = p_fuente
   where id = p_jornada;

  return json_build_object('ok', true, 'jugadores', v_total, 'jornada', j.numero);
end $$;

-- Con la clave publica de la web no se llega a estas dos: solo desde el proceso
-- de GitHub, que entra con la cadena de conexion completa.
--
-- OJO con el orden y con PUBLIC: PostgreSQL da permiso de ejecucion a PUBLIC en
-- cada funcion nueva, y anon lo hereda. Quitarselo solo a anon NO sirve de nada
-- (comprobado en vivo: se podian llamar desde la web con la clave publica).
-- Hay que retirarselo tambien a PUBLIC.
revoke execute on function robot_pendiente()                    from public, anon, authenticated;
revoke execute on function robot_convocatoria(int, int[], text) from public, anon, authenticated;

-- Y se comprueba aqui mismo, que esto no puede quedarse a medias sin que nadie
-- se entere: si alguna siguiera abierta al rol anonimo, el script falla y el
-- proceso de GitHub lo canta en rojo.
do $$
declare v_abiertas text;
begin
  select string_agg(p.proname, ', ') into v_abiertas
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'robot\_%'
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));

  if v_abiertas is not null then
    raise exception 'Las funciones del robot siguen abiertas al rol anonimo: %', v_abiertas;
  end if;
end $$;
