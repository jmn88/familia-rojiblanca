-- Familia Rojiblanca 26/27 — calendario completo de LaLiga
--
-- Las 37 jornadas que faltaban (de la 2 a la 38), con el rival y el campo del
-- sorteo oficial. El DIA es el del calendario; la HORA todavia no la ha fijado
-- LaLiga, asi que va una tentativa de las 21:00 y la jornada queda marcada como
-- "hora sin confirmar" (hora_confirmada = false). La web lo avisa por escrito.
--
-- Cada semana, cuando se sepa la hora de verdad: panel Admin -> Editar en esa
-- jornada -> poner dia y hora y marcar "hora confirmada". El cierre se recalcula
-- solo (una hora antes).
--
-- Se puede volver a ejecutar sin miedo: las jornadas que ya existan no se tocan,
-- asi que no pisa nada de lo que hayas corregido desde Admin.
--
-- Las horas se escriben en hora de Madrid y es PostgreSQL quien les pone el huso
-- que toque, con su horario de verano incluido ('at time zone Europe/Madrid').

insert into jornadas (numero, rival, en_casa, kickoff, cierre, hora_confirmada)
select v.numero, v.rival, v.en_casa, k.kickoff, k.kickoff - interval '1 hour', false
  from (values
    ( 2, 'Athletic',           false, timestamp '2026-08-22 21:00'),
    ( 3, 'Atlético de Madrid', true,  timestamp '2026-08-29 21:00'),
    ( 4, 'Espanyol',           false, timestamp '2026-09-06 21:00'),
    ( 5, 'Valencia',           true,  timestamp '2026-09-13 21:00'),
    ( 6, 'Deportivo',          false, timestamp '2026-09-16 21:00'),   -- entre semana
    ( 7, 'Barcelona',          true,  timestamp '2026-09-20 21:00'),
    ( 8, 'Levante',            false, timestamp '2026-10-11 21:00'),
    ( 9, 'Real Madrid',        false, timestamp '2026-10-18 21:00'),
    (10, 'Osasuna',            true,  timestamp '2026-10-25 21:00'),
    (11, 'Getafe',             false, timestamp '2026-11-01 21:00'),
    (12, 'Alavés',             true,  timestamp '2026-11-08 21:00'),
    (13, 'Betis',              true,  timestamp '2026-11-22 21:00'),   -- derbi en el Pizjuán
    (14, 'Real Sociedad',      false, timestamp '2026-11-29 21:00'),
    (15, 'Málaga',             true,  timestamp '2026-12-06 21:00'),
    (16, 'Elche',              false, timestamp '2026-12-13 21:00'),
    (17, 'Racing',             true,  timestamp '2026-12-20 21:00'),
    (18, 'Villarreal',         false, timestamp '2027-01-03 21:00'),
    (19, 'Celta',              true,  timestamp '2027-01-10 21:00'),
    (20, 'Rayo Vallecano',     false, timestamp '2027-01-17 21:00'),
    (21, 'Valencia',           false, timestamp '2027-01-24 21:00'),
    (22, 'Athletic',           true,  timestamp '2027-01-31 21:00'),
    (23, 'Betis',              false, timestamp '2027-02-07 21:00'),   -- derbi en La Cartuja
    (24, 'Espanyol',           true,  timestamp '2027-02-14 21:00'),
    (25, 'Real Madrid',        true,  timestamp '2027-02-21 21:00'),
    (26, 'Osasuna',            false, timestamp '2027-02-28 21:00'),
    (27, 'Real Sociedad',      true,  timestamp '2027-03-07 21:00'),
    (28, 'Alavés',             false, timestamp '2027-03-14 21:00'),
    (29, 'Elche',              true,  timestamp '2027-03-21 21:00'),
    (30, 'Barcelona',          false, timestamp '2027-04-04 21:00'),
    (31, 'Deportivo',          true,  timestamp '2027-04-11 21:00'),
    (32, 'Atlético de Madrid', false, timestamp '2027-04-18 21:00'),
    (33, 'Levante',            true,  timestamp '2027-04-21 21:00'),   -- entre semana
    (34, 'Celta',              false, timestamp '2027-05-02 21:00'),
    (35, 'Racing',             false, timestamp '2027-05-09 21:00'),
    (36, 'Villarreal',         true,  timestamp '2027-05-16 21:00'),
    (37, 'Getafe',             true,  timestamp '2027-05-23 21:00'),
    (38, 'Málaga',             false, timestamp '2027-05-30 21:00')
  ) as v(numero, rival, en_casa, hora_madrid)
  cross join lateral (select v.hora_madrid at time zone 'Europe/Madrid' as kickoff) k
on conflict (numero) do nothing;

-- La jornada 1 si tiene hora oficial (sábado 15 de agosto, 21:30).
update jornadas set hora_confirmada = true where numero = 1;

-- ------------------------------------------------------------- de propina ---
-- Sangante es defensa, no portero. La plantilla vive en la base de datos, asi
-- que cambiarlo en los ficheros no bastaba. Idempotente: si ya esta, no hace nada.

update jugadores set posicion = 'DEF' where nombre = 'Sangante' and posicion <> 'DEF';

-- ---------------------------------------------------------------- repaso ---
-- Deberia decir 38 jornadas, 1 con hora confirmada y 37 sin ella.

select count(*)                                as jornadas,
       count(*) filter (where hora_confirmada) as con_hora_confirmada,
       min(numero) || '-' || max(numero)       as van_de_la_a_la
  from jornadas;
