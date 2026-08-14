-- Familia Rojiblanca 26/27 — autoprueba
--
-- Comprueba de punta a punta el PIN, el cierre de plazo, la convocatoria, la
-- puntuacion y el panel de administracion. Crea datos de prueba y los DESHACE
-- al terminar: al
-- lanzar una excepcion a proposito, PostgreSQL revierte la transaccion entera y
-- no queda absolutamente nada.
--
-- Ejecutalo en el SQL Editor de Supabase. Es NORMAL que termine en rojo:
-- lee el mensaje. Si dice "TODO CORRECTO", todo funciona.

do $$
declare
  v_part   int;
  v_jor    int;
  v_jor2   int;
  v_tok    uuid;
  v_adm    uuid;
  v_picks  int[];
  v_otros  int[];
  v_of     int[];
  v_conv   int[];
  r        json;
  v_pts    int;
  v_pk     text;
  fallos   text := '';
begin
  -- ------------------------------------------------------------ preparacion
  if (select count(*) from jugadores where activo) < 13 then
    raise exception 'AUTOPRUEBA: hacen falta al menos 13 jugadores activos para probar';
  end if;

  select array_agg(id order by id) into v_picks
    from (select id from jugadores where activo order by id limit 11) s;
  select array_agg(id order by id) into v_otros
    from (select id from jugadores where activo and not (id = any(v_picks)) order by id limit 2) s;
  v_of := v_picks[1:9] || v_otros;          -- 9 coincidencias => 25 puntos

  -- Apartamos el calendario para que la prueba no dependa de el (con las 38
  -- jornadas cargadas no quedaria ni un numero libre). Igual que la contrasena
  -- de admin mas abajo: la excepcion del final lo devuelve todo a su sitio.
  delete from jornadas;

  insert into participantes (nombre) values ('ZZ Prueba') returning id into v_part;

  -- la 1 es el "proximo partido"; la 2 esta abierta pero es posterior
  insert into jornadas (numero, rival, en_casa, kickoff, cierre)
  values (1, 'ZZ Prueba', true, now() + interval '2 hours', now() + interval '1 hour')
  returning id into v_jor;
  insert into jornadas (numero, rival, en_casa, kickoff, cierre)
  values (2, 'ZZ Prueba B', false, now() + interval '9 days', now() + interval '8 days')
  returning id into v_jor2;

  -- ------------------------------------------------------------------ PIN
  r := api_login(v_part, '12');
  if (r->>'ok')::boolean then fallos := fallos || E'\n- acepta un PIN de menos de 4 digitos'; end if;

  r := api_login(v_part, '1234');           -- primera vez: fija el PIN
  if not (r->>'ok')::boolean then fallos := fallos || E'\n- no deja fijar el PIN la primera vez'; end if;
  v_tok := (r->>'token')::uuid;

  r := api_login(v_part, '9999');
  if (r->>'ok')::boolean then fallos := fallos || E'\n- acepta un PIN incorrecto'; end if;

  r := api_login(v_part, '1234');
  if not (r->>'ok')::boolean then fallos := fallos || E'\n- no reconoce el PIN correcto'; end if;

  -- ---------------------------------------------------------- alineaciones
  r := api_guardar(v_tok, v_jor, v_picks[1:10]);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- acepta una alineacion de 10 jugadores'; end if;

  r := api_guardar(v_tok, v_jor, v_picks[1:10] || v_picks[1:1]);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- acepta jugadores repetidos'; end if;

  r := api_guardar(gen_random_uuid(), v_jor, v_picks);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- acepta un token inventado'; end if;

  r := api_guardar(v_tok, v_jor, v_picks);
  if not (r->>'ok')::boolean then fallos := fallos || E'\n- no guarda una alineacion valida: ' || (r->>'error'); end if;

  -- solo se juega al proximo partido, no a una jornada posterior aunque este abierta
  r := api_guardar(v_tok, v_jor2, v_picks);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- deja alinear a una jornada que no es la proxima'; end if;

  -- -------------------------------------------- secreto hasta el cierre
  r := api_jornada(v_jor, null);
  select x->>'picks' into v_pk from json_array_elements(r->'filas') x
   where (x->>'participante_id')::int = v_part;
  if v_pk is not null then fallos := fallos || E'\n- ¡se ven las alineaciones ajenas antes del cierre!'; end if;

  r := api_jornada(v_jor, v_tok);
  select x->>'picks' into v_pk from json_array_elements(r->'filas') x
   where (x->>'participante_id')::int = v_part;
  if v_pk is null then fallos := fallos || E'\n- no puedes ver tu propia alineacion antes del cierre'; end if;

  -- ------------------------------------------------------------ el cierre
  update jornadas set cierre = now() - interval '1 minute' where id = v_jor;

  r := api_guardar(v_tok, v_jor, v_otros || v_picks[1:9]);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- ¡deja enviar despues del cierre!'; end if;

  r := api_jornada(v_jor, null);
  select x->>'picks' into v_pk from json_array_elements(r->'filas') x
   where (x->>'participante_id')::int = v_part;
  if v_pk is null then fallos := fallos || E'\n- tras el cierre no se revelan las alineaciones'; end if;

  -- la prorroga vuelve a abrir el plazo.
  -- (apartamos la contrasena real de admin para poder probar con una de mentira:
  --  como todo esto se deshace al final, tu contrasena no se toca)
  delete from config where clave = 'admin_pass_hash';
  r := api_admin_login('prueba-autoprueba');
  v_adm := (r->>'token')::uuid;
  if v_adm is null then fallos := fallos || E'\n- no se puede entrar como administrador'; end if;

  r := api_admin_prorrogar(v_adm, v_jor, 30);
  if not (r->>'ok')::boolean then fallos := fallos || E'\n- la prorroga no funciona'; end if;
  r := api_guardar(v_tok, v_jor, v_picks);
  if not (r->>'ok')::boolean then fallos := fallos || E'\n- tras prorrogar sigue sin dejar enviar'; end if;

  -- ----------------------------------------------------------- convocatoria
  -- Convocamos a 11: los 10 primeros del once guardado y uno de fuera. Asi el
  -- jugador v_picks[11] queda expresamente SIN convocar, que es lo que se prueba.
  v_conv := v_picks[1:10] || v_otros[1:1];

  r := api_admin_convocatoria(gen_random_uuid(), v_jor, v_conv);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- cualquiera puede cargar la convocatoria'; end if;

  r := api_admin_convocatoria(v_adm, v_jor, v_conv[1:5]);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- acepta una convocatoria de 5 jugadores'; end if;

  r := api_admin_convocatoria(v_adm, v_jor, v_conv || v_conv[1:1]);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- acepta una convocatoria con jugadores repetidos'; end if;

  r := api_admin_convocatoria(v_adm, v_jor, v_conv);
  if not (r->>'ok')::boolean then
    fallos := fallos || E'\n- no deja cargar la convocatoria: ' || (r->>'error');
  end if;
  if (r->>'afectadas')::int is distinct from 1 then
    fallos := fallos || E'\n- no avisa de la alineacion que se queda fuera de la convocatoria';
  end if;

  r := api_guardar(v_tok, v_jor, v_picks);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- ¡deja alinear a un jugador sin convocar!'; end if;

  r := api_guardar(v_tok, v_jor, v_conv);
  if not (r->>'ok')::boolean then
    fallos := fallos || E'\n- no deja alinear a los convocados: ' || (r->>'error');
  end if;

  r := api_admin_once(v_adm, v_jor, v_picks);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- marca un once oficial con alguien sin convocar'; end if;

  -- al quitarla vuelve a valer toda la plantilla (y deja el once guardado como
  -- estaba, que es del que se fian las comprobaciones de puntuacion de abajo)
  r := api_admin_convocatoria(v_adm, v_jor, null);
  if not (r->>'ok')::boolean then fallos := fallos || E'\n- no deja quitar la convocatoria'; end if;

  r := api_guardar(v_tok, v_jor, v_picks);
  if not (r->>'ok')::boolean then
    fallos := fallos || E'\n- sin convocatoria sigue sin dejar alinear a toda la plantilla';
  end if;

  -- volvemos a cerrar para puntuar
  update jornadas set cierre = now() - interval '1 minute', prorroga_hasta = null where id = v_jor;

  -- ------------------------------------------------------------ puntuacion
  r := api_admin_once(gen_random_uuid(), v_jor, v_of);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- cualquiera puede marcar el once oficial'; end if;

  r := api_admin_once(v_adm, v_jor, v_of[1:10]);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- acepta un once oficial de 10 jugadores'; end if;

  r := api_admin_once(v_adm, v_jor, v_of);
  if not (r->>'ok')::boolean then fallos := fallos || E'\n- no deja marcar el once oficial: ' || (r->>'error'); end if;

  r := api_jornada(v_jor, null);
  select (x->>'puntos')::int into v_pts from json_array_elements(r->'filas') x
   where (x->>'participante_id')::int = v_part;
  if v_pts is distinct from 25 then
    fallos := fallos || E'\n- 9 aciertos deberian dar 25 puntos y dan ' || coalesce(v_pts::text, 'nulo');
  end if;

  select (x->>'puntos')::int into v_pts from json_array_elements(r->'filas') x
   where (x->>'participante_id')::int <> v_part limit 1;
  if v_pts is distinct from 0 then
    fallos := fallos || E'\n- quien no participa deberia tener 0 puntos y tiene ' || coalesce(v_pts::text, 'nulo');
  end if;

  r := api_general();
  select (x->>'puntos')::int into v_pts from json_array_elements(r->'tabla') x
   where (x->>'participante_id')::int = v_part;
  if v_pts is distinct from 25 then
    fallos := fallos || E'\n- la clasificacion general no suma bien (' || coalesce(v_pts::text, 'nulo') || ')';
  end if;

  -- ----------------------------------------------------------- resultado
  if fallos = '' then
    raise exception E'AUTOPRUEBA: TODO CORRECTO. Nada de lo creado en la prueba se ha guardado.';
  else
    raise exception E'AUTOPRUEBA: HAY FALLOS %', fallos;
  end if;
end $$;
