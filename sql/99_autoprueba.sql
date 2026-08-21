-- Familia Rojiblanca 26/27 — autoprueba
--
-- Comprueba de punta a punta el PIN, el cierre de plazo, la convocatoria, la
-- puntuacion, el horario oficial, las solicitudes para entrar y el panel de
-- administracion. Crea datos de prueba y los DESHACE al terminar: al lanzar una
-- excepcion a proposito, PostgreSQL revierte la transaccion entera y no queda
-- absolutamente nada.
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
  v_n      int;
  v_pk     text;
  v_sol    int;
  v_nuevo  int;
  v_hora   timestamptz;
  v_k      timestamptz;
  v_c      timestamptz;
  v_b      boolean;
  v_correo  text := 'zz.prueba@ejemplo.com';
  v_correo2 text := 'zz.nuevo@ejemplo.com';
  fallos    text := '';
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

  -- ------------------------------------------------------ avisos por correo
  -- (aqui ZZ Prueba todavia no ha enviado alineacion y el partido es dentro de
  --  dos horas, que es justo el caso en el que hay que avisarle)
  r := api_avisos(v_tok, 'esto-no-es-un-correo', true);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- acepta como correo cualquier cosa'; end if;

  r := api_avisos(gen_random_uuid(), v_correo, true);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- deja poner el correo con un token inventado'; end if;

  r := api_avisos(v_tok, v_correo, true);
  if not (r->>'ok')::boolean then
    fallos := fallos || E'\n- no deja activar los avisos por correo: ' || (r->>'error');
  end if;
  if r->>'email_pista' is distinct from 'z***@ejemplo.com' then
    fallos := fallos || E'\n- la pista del correo sale mal: ' || coalesce(r->>'email_pista', 'nula');
  end if;

  -- lo importante: el correo no puede salir en claro por ninguna via de la web,
  -- ni quedarse sin cifrar en la tabla
  if api_estado(v_tok)::text like '%' || v_correo || '%' then
    fallos := fallos || E'\n- ¡api_estado devuelve el correo en claro!';
  end if;
  if api_jornada(v_jor, v_tok)::text like '%' || v_correo || '%' then
    fallos := fallos || E'\n- ¡api_jornada devuelve el correo en claro!';
  end if;
  if (select encode(email_cifrado, 'escape') from participantes where id = v_part)
     like '%ejemplo.com%' then
    fallos := fallos || E'\n- ¡el correo se guarda sin cifrar en la tabla!';
  end if;

  select count(*) into v_n from json_array_elements(robot_avisos_pendientes()->'avisos') x
   where (x->>'participante_id')::int = v_part
     and x->>'tipo' = 'alineacion' and x->>'email' = v_correo;
  if v_n <> 1 then
    fallos := fallos || E'\n- no se avisaria a quien tiene el partido encima y no ha enviado nada';
  end if;

  -- una vez mandado, no se manda otra vez
  r := robot_aviso_enviado(v_jor, v_part, 'alineacion');
  select count(*) into v_n from json_array_elements(robot_avisos_pendientes()->'avisos') x
   where (x->>'participante_id')::int = v_part;
  if v_n <> 0 then fallos := fallos || E'\n- el mismo aviso se mandaria dos veces'; end if;
  delete from recordatorios where jornada_id = v_jor and participante_id = v_part;

  -- apagarlos deja de avisar, pero no borra el correo
  r := api_avisos(v_tok, null, false);
  select count(*) into v_n from json_array_elements(robot_avisos_pendientes()->'avisos') x
   where (x->>'participante_id')::int = v_part;
  if v_n <> 0 then fallos := fallos || E'\n- sigue avisando con los avisos apagados'; end if;
  if (select email_pista from participantes where id = v_part) is null then
    fallos := fallos || E'\n- apagar los avisos borra el correo, y no deberia';
  end if;

  r := api_avisos(v_tok, null, true);        -- se vuelven a encender para lo de abajo
  if not (r->>'avisos')::boolean then
    fallos := fallos || E'\n- no se pueden reactivar los avisos con el correo ya puesto';
  end if;

  -- ---------------------------------------------------------- alineaciones
  r := api_guardar(v_tok, v_jor, v_picks[1:10]);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- acepta una alineacion de 10 jugadores'; end if;

  r := api_guardar(v_tok, v_jor, v_picks[1:10] || v_picks[1:1]);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- acepta jugadores repetidos'; end if;

  r := api_guardar(gen_random_uuid(), v_jor, v_picks);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- acepta un token inventado'; end if;

  r := api_guardar(v_tok, v_jor, v_picks);
  if not (r->>'ok')::boolean then fallos := fallos || E'\n- no guarda una alineacion valida: ' || (r->>'error'); end if;

  -- y en cuanto la envia, deja de estar pendiente de aviso
  select count(*) into v_n from json_array_elements(robot_avisos_pendientes()->'avisos') x
   where (x->>'participante_id')::int = v_part;
  if v_n <> 0 then
    fallos := fallos || E'\n- se avisaria a alguien que ya ha enviado su alineacion';
  end if;

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

  -- El robot mira desde las 10:00 del dia ANTERIOR al partido, que es cuando el
  -- club la publica (rueda de prensa del entrenador la vispera). Aqui el partido
  -- es dentro de dos horas, asi que esa hora ya paso y le toca a la jornada 1; la
  -- 2, que es dentro de nueve dias, no puede salir todavia.
  if robot_pendiente()->'jornada'->>'numero' is distinct from '1' then
    fallos := fallos || E'
- el robot de la convocatoria no coge el partido que toca';
  end if;

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

  -- Con la convocatoria ya puesta el robot se calla, y la jornada 2 sigue sin
  -- entrarle porque su vispera esta a ocho dias: no queda nada pendiente.
  if robot_pendiente()->'jornada'->>'numero' is not null then
    fallos := fallos || E'
- el robot volveria a cargar una convocatoria ya puesta, '
                     || 'o coge un partido cuya vispera no ha llegado';
  end if;

  -- ------------------------------------- el aviso de «ya hay convocatoria»
  -- ZZ Prueba tiene avisos encendidos, ya mando su once y en el lleva a uno que
  -- se ha quedado sin convocar: el correo tiene que salir y tiene que decirselo.
  select nombre into v_pk from jugadores where id = v_picks[11];

  select count(*) into v_n from json_array_elements(robot_avisos_pendientes()->'avisos') x
   where (x->>'participante_id')::int = v_part
     and x->>'tipo' = 'convocatoria'
     and (x->>'enviada')::boolean
     and json_array_length(x->'fuera') = 1
     and x->'fuera'->>0 = v_pk;
  if v_n <> 1 then
    fallos := fallos || E'\n- el aviso de la convocatoria no sale como debe (tendria que '
                     || 'decirle que ' || coalesce(v_pk, '?') || ' se le ha quedado fuera)';
  end if;

  -- y tiene que llevar la lista de convocados, que es lo que se pone en el correo
  select json_array_length(robot_avisos_pendientes()->'jornada'->'convocados') into v_n;
  if v_n is distinct from array_length(v_conv, 1) then
    fallos := fallos || E'\n- el aviso de la convocatoria no lleva la lista de convocados';
  end if;

  -- A quien no ha enviado nada le tocarian los dos avisos a la vez. Solo sale el
  -- de la convocatoria: el de la alineacion espera al siguiente pase, que dos
  -- correos de golpe son uno de mas.
  delete from alineaciones where jornada_id = v_jor and participante_id = v_part;

  select count(*) into v_n from json_array_elements(robot_avisos_pendientes()->'avisos') x
   where (x->>'participante_id')::int = v_part and x->>'tipo' = 'alineacion';
  if v_n <> 0 then
    fallos := fallos || E'\n- manda a la vez el aviso de la convocatoria y el de la alineacion';
  end if;

  perform robot_aviso_enviado(v_jor, v_part, 'convocatoria');

  select count(*) into v_n from json_array_elements(robot_avisos_pendientes()->'avisos') x
   where (x->>'participante_id')::int = v_part;
  if v_n <> 1 then
    fallos := fallos || E'\n- tras avisar de la convocatoria no queda pendiente el de la alineacion';
  end if;

  -- se deja todo como estaba: la alineacion vuelve a su sitio (las
  -- comprobaciones de puntuacion de mas abajo se fian de ella) y sin
  -- recordatorios a medias
  delete from recordatorios where jornada_id = v_jor;
  insert into alineaciones (jornada_id, participante_id, picks) values (v_jor, v_part, v_picks);

  r := api_guardar(v_tok, v_jor, v_picks);
  if (r->>'ok')::boolean then fallos := fallos || E'\n- ¡deja alinear a un jugador sin convocar!'; end if;

  -- Lo enviado ANTES de conocerse la convocatoria sigue contando tal cual. El
  -- jugador que se quedo sin convocar simplemente no puede acertar, pero ni se
  -- borra la alineacion ni se deja de puntuar. (Sigue guardado v_picks, que
  -- lleva uno sin convocar; con v_conv de once oficial son 10 aciertos = 50.)
  r := api_admin_once(v_adm, v_jor, v_conv);
  if not (r->>'ok')::boolean then
    fallos := fallos || E'\n- no deja marcar un once oficial sacado de la convocatoria: ' || (r->>'error');
  end if;

  -- Con el once oficial ya puesto se cierra el envio, aunque el reloj del
  -- cierre normal le siga dando minutos (aqui hay una prorroga en marcha).
  r := api_guardar(v_tok, v_jor, v_conv);
  if (r->>'ok')::boolean then
    fallos := fallos || E'\n- deja enviar la alineacion aunque ya se conoce el once oficial';
  end if;

  r := api_jornada(v_jor, null);
  select x->>'participo', (x->>'puntos')::int into v_pk, v_pts
    from json_array_elements(r->'filas') x
   where (x->>'participante_id')::int = v_part;
  if v_pk is distinct from 'true' then
    fallos := fallos || E'\n- una alineacion con un jugador sin convocar figura como no participo';
  end if;
  if v_pts is distinct from 50 then
    fallos := fallos || E'\n- una alineacion con un jugador sin convocar deberia puntuar 50 y da '
                     || coalesce(v_pts::text, 'nulo');
  end if;

  r := api_admin_once(v_adm, v_jor, null);   -- se despublica y seguimos probando
  if not (r->>'ok')::boolean then fallos := fallos || E'\n- no deja retirar el once oficial'; end if;

  -- Lo mismo tiene que pasar con una PROPUESTA sin confirmar todavia: basta con
  -- que el robot la haya encontrado para que se cierre, sin esperar a que el
  -- administrador la confirme. robot_once() es la funcion que usa el proceso
  -- automatico (no pasa por api_admin_once ni pide token de administrador).
  r := robot_once(v_jor, v_conv, 'prueba-autoprueba');
  if not (r->>'ok')::boolean then
    fallos := fallos || E'\n- no deja guardar la propuesta del robot: ' || (r->>'error');
  end if;

  r := api_guardar(v_tok, v_jor, v_conv);
  if (r->>'ok')::boolean then
    fallos := fallos || E'\n- deja enviar la alineacion aunque hay una propuesta de once sin confirmar';
  end if;

  update jornadas set once_propuesto = null, once_propuesto_en = null, once_propuesto_fuente = null
   where id = v_jor;   -- limpiamos: el resto de la prueba se fia de que no haya nada propuesto

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

  -- ------------------------------------------------------ horario oficial
  -- El robot del calendario pone solo la hora que publica el club. Lo que no
  -- hace es tocar una jornada cerrada ni pisar una hora que puso una persona.

  -- solo mira lo que sigue abierto: la jornada 1 esta cerrada y puntuada
  select count(*) into v_n from json_array_elements(robot_pendiente_horario()->'jornadas') x;
  if v_n <> 1 then
    fallos := fallos || E'\n- el robot del horario no coge solo las jornadas abiertas (coge '
                     || v_n || ')';
  end if;

  -- La jornada 2 tiene la hora orientativa y el cierre un dia antes. Le llega la
  -- oficial: se mueve el partido y el cierre con el, conservando ese margen. En
  -- el mismo lote va la jornada 1, cerrada y puntuada, con una hora disparatada:
  -- esa no se puede tocar.
  v_hora := date_trunc('minute', now()) + interval '9 days' + interval '5 hours';
  select kickoff into v_c from jornadas where id = v_jor;

  r := robot_horario(json_build_array(
         json_build_object('jornada', 1, 'rival', 'ZZ Prueba', 'en_casa', true,
                           'kickoff', to_char((v_c + interval '30 days') at time zone 'UTC',
                                              'YYYY-MM-DD HH24:MI:SS"+00"'),
                           'hora_conocida', true),
         json_build_object('jornada', 2, 'rival', 'ZZ Prueba B', 'en_casa', false,
                           'kickoff', to_char(v_hora at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS"+00"'),
                           'hora_conocida', true)),
       'https://ejemplo/calendario');

  select kickoff into v_k from jornadas where id = v_jor;
  if v_k is distinct from v_c then
    fallos := fallos || E'\n- ¡el robot del horario mueve una jornada ya cerrada!';
  end if;

  select kickoff, cierre into v_k, v_c from jornadas where id = v_jor2;
  if v_k is distinct from v_hora then
    fallos := fallos || E'\n- el robot no pone la hora oficial que publica el club';
  end if;
  if v_c is distinct from v_hora - interval '1 day' then
    fallos := fallos || E'\n- al mover la hora no arrastra el cierre con el mismo margen';
  end if;

  select hora_confirmada, horario_fuente into v_b, v_pk from jornadas where id = v_jor2;
  if not v_b or v_pk is null then
    fallos := fallos || E'\n- el robot no marca como oficial la hora que ha traido del club';
  end if;
  if json_array_length(r->'cambiadas') <> 1 then
    fallos := fallos || E'\n- el robot no cuenta bien los horarios que ha cambiado';
  end if;

  -- Ahora la hora la confirma una persona desde Admin. A partir de ahi el robot
  -- no la pisa: si el club dice otra cosa, la deja apuntada y avisa.
  r := api_admin_jornada(v_adm, v_jor2, 2, 'ZZ Prueba B', false,
                         v_hora + interval '1 hour', 60, true);
  if not (r->>'ok')::boolean then
    fallos := fallos || E'\n- no deja confirmar la hora a mano: ' || (r->>'error');
  end if;

  r := robot_horario(json_build_array(json_build_object(
         'jornada', 2, 'rival', 'ZZ Prueba B', 'en_casa', false,
         'kickoff', to_char(v_hora at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS"+00"'),
         'hora_conocida', true)), 'https://ejemplo/calendario');

  select kickoff, horario_aviso into v_k, v_pk from jornadas where id = v_jor2;
  if v_k is distinct from v_hora + interval '1 hour' then
    fallos := fallos || E'\n- ¡el robot pisa una hora que habia confirmado una persona!';
  end if;
  if v_pk is null then
    fallos := fallos || E'\n- no deja constancia de la discrepancia de horario';
  end if;
  if json_array_length(r->'avisos') <> 1 then
    fallos := fallos || E'\n- el robot no cuenta la discrepancia que se ha encontrado';
  end if;

  -- el aviso es cosa del administrador: nadie mas lo ve
  select x->>'horario_aviso' into v_pk from json_array_elements(api_estado(v_adm)->'jornadas') x
   where (x->>'numero')::int = 2;
  if v_pk is null then
    fallos := fallos || E'\n- el administrador no ve la discrepancia de horario';
  end if;
  select x->>'horario_aviso' into v_pk from json_array_elements(api_estado(v_tok)->'jornadas') x
   where (x->>'numero')::int = 2;
  if v_pk is not null then
    fallos := fallos || E'\n- la discrepancia de horario se ve sin ser administrador';
  end if;

  -- y en cuanto el administrador repasa la jornada y guarda, el aviso se va
  r := api_admin_jornada(v_adm, v_jor2, 2, 'ZZ Prueba B', false,
                         v_hora + interval '1 hour', 60, true);
  select horario_aviso into v_pk from jornadas where id = v_jor2;
  if v_pk is not null then
    fallos := fallos || E'\n- el aviso del horario no se quita al guardar la jornada';
  end if;

  -- ---------------------------------------------- solicitudes para entrar
  -- Cualquiera puede pedir entrar desde la web, pero no entra nadie hasta que
  -- el administrador lo aprueba.
  --
  -- Se apartan las que hubiera de verdad, igual que con el calendario, para que
  -- la prueba no dependa de ellas. La excepcion del final lo devuelve todo.
  delete from solicitudes;

  r := api_solicitar('ZZ Nuevo', '12', null);
  if (r->>'ok')::boolean then
    fallos := fallos || E'
- acepta una solicitud con un PIN de 2 digitos';
  end if;

  r := api_solicitar('ZZ Prueba', '4321', null);
  if (r->>'ok')::boolean then
    fallos := fallos || E'
- deja pedir entrar con el nombre de alguien que ya juega';
  end if;

  r := api_solicitar('ZZ Nuevo', '4321', 'esto-no-es-un-correo');
  if (r->>'ok')::boolean then
    fallos := fallos || E'
- acepta como correo cualquier cosa en la solicitud';
  end if;

  r := api_solicitar('  ZZ   Nuevo  ', '4321', v_correo2);
  if not (r->>'ok')::boolean then
    fallos := fallos || E'
- no deja pedir entrar: ' || (r->>'error');
  end if;
  if r->>'nombre' is distinct from 'ZZ Nuevo' then
    fallos := fallos || E'
- no limpia los espacios de sobra del nombre de la solicitud';
  end if;

  select id into v_sol from solicitudes where nombre = 'ZZ Nuevo' and estado = 'pendiente';
  if v_sol is null then fallos := fallos || E'
- la solicitud no se ha guardado'; end if;

  r := api_solicitar('zz nuevo', '4321', null);
  if (r->>'ok')::boolean then
    fallos := fallos || E'
- deja repetir una solicitud con el mismo nombre';
  end if;

  -- Ni es participante todavia, ni su correo sale de aqui en claro.
  if exists (select 1 from participantes where nombre = 'ZZ Nuevo') then
    fallos := fallos || E'
- ¡pedir entrar crea el participante sin que nadie lo apruebe!';
  end if;
  if api_estado(v_adm)::text like '%' || v_correo2 || '%' then
    fallos := fallos || E'
- ¡api_estado devuelve en claro el correo de la solicitud!';
  end if;
  if (select encode(email_cifrado, 'escape') from solicitudes where id = v_sol)
     like '%ejemplo.com%' then
    fallos := fallos || E'
- ¡el correo de la solicitud se guarda sin cifrar!';
  end if;

  -- y la lista de solicitudes es cosa del administrador
  select json_array_length(api_estado(v_adm)->'solicitudes') into v_n;
  if v_n is distinct from 1 then
    fallos := fallos || E'
- el administrador no ve la solicitud pendiente';
  end if;
  if (api_estado(v_tok)->'solicitudes')::text <> 'null' then
    fallos := fallos || E'
- las solicitudes se ven sin ser administrador';
  end if;

  -- ------------------------------------- el aviso por correo al administrador
  r := api_admin_avisar_a(gen_random_uuid(), v_part);
  if (r->>'ok')::boolean then
    fallos := fallos || E'
- cualquiera puede cambiar a quien se avisa de las solicitudes';
  end if;

  r := api_admin_avisar_a(v_adm, v_part);
  if not (r->>'ok')::boolean then
    fallos := fallos || E'
- no deja elegir a quien se avisa de las solicitudes';
  end if;

  select count(*) into v_n from json_array_elements(robot_solicitudes_pendientes()->'solicitudes') x
   where (x->>'id')::int = v_sol;
  if v_n <> 1 then
    fallos := fallos || E'
- el robot no ve la solicitud de la que hay que avisar';
  end if;
  if robot_solicitudes_pendientes()->'admin'->>'email' is distinct from v_correo then
    fallos := fallos || E'
- el robot no saca el correo del administrador al que avisar';
  end if;

  perform robot_solicitud_avisada(v_sol);
  select json_array_length(robot_solicitudes_pendientes()->'solicitudes') into v_n;
  if v_n <> 0 then
    fallos := fallos || E'
- se avisaria dos veces de la misma solicitud';
  end if;

  -- ------------------------------------------------- aprobar y rechazar
  r := api_admin_solicitud(gen_random_uuid(), v_sol, true);
  if (r->>'ok')::boolean then
    fallos := fallos || E'
- cualquiera puede aprobar una solicitud';
  end if;

  r := api_admin_solicitud(v_adm, v_sol, true);
  if not (r->>'ok')::boolean then
    fallos := fallos || E'
- no deja aprobar la solicitud: ' || (r->>'error');
  end if;

  select id into v_nuevo from participantes where nombre = 'ZZ Nuevo';
  if v_nuevo is null then
    fallos := fallos || E'
- aprobar la solicitud no crea el participante';
  else
    -- entra con el PIN que eligio al pedirlo, sin tener que ponerlo otra vez
    r := api_login(v_nuevo, '1111');
    if (r->>'ok')::boolean then
      fallos := fallos || E'
- el nuevo entra con un PIN que no es el suyo';
    end if;
    r := api_login(v_nuevo, '4321');
    if not (r->>'ok')::boolean then
      fallos := fallos || E'
- el nuevo no puede entrar con el PIN que eligio al pedirlo';
    end if;
    if not (select avisos and avisos_preguntado from participantes where id = v_nuevo) then
      fallos := fallos || E'
- al aprobar no se le pasan los avisos por correo que pidio';
    end if;
  end if;

  r := api_admin_solicitud(v_adm, v_sol, true);
  if (r->>'ok')::boolean then
    fallos := fallos || E'
- deja aprobar dos veces la misma solicitud';
  end if;

  r := api_solicitar('ZZ Otro', '5555', v_correo2);
  select id into v_sol from solicitudes where nombre = 'ZZ Otro' and estado = 'pendiente';

  r := api_admin_solicitud(v_adm, v_sol, false);
  if not (r->>'ok')::boolean then
    fallos := fallos || E'
- no deja rechazar una solicitud: ' || (r->>'error');
  end if;
  if exists (select 1 from participantes where nombre = 'ZZ Otro') then
    fallos := fallos || E'
- ¡rechazar una solicitud crea el participante igualmente!';
  end if;
  if (select email_cifrado is not null or pin_hash <> '' from solicitudes where id = v_sol) then
    fallos := fallos || E'
- al rechazar no se le borran el PIN y el correo';
  end if;

  -- ----------------------------------------------------------- resultado
  if fallos = '' then
    raise exception E'AUTOPRUEBA: TODO CORRECTO. Nada de lo creado en la prueba se ha guardado.';
  else
    raise exception E'AUTOPRUEBA: HAY FALLOS %', fallos;
  end if;
end $$;
