-- Familia Rojiblanca 26/27 — datos de partida
-- Se puede volver a ejecutar sin duplicar nada.

-- ---------------------------------------------------------- participantes ---

insert into participantes (nombre) values
  ('Andrii'), ('Chiquitín'), ('Javi'), ('Jesús'), ('Tio P'), ('Tito')
on conflict (nombre) do nothing;

-- --------------------------------------------------------------- plantilla ---
-- Lista oficial de dorsales 2026/27, pendiente del cierre del mercado.
-- La posición solo sirve para dibujar el campo: no influye en la puntuación.
-- Solo se cargan si la tabla está vacía; a partir de ahí se gestiona desde Admin.

insert into jugadores (dorsal, nombre, posicion)
select * from (values
  ( 1, 'Odysseas',     'POR'),
  (13, 'Fran González','POR'),
  (12, 'Sangante',     'POR'),
  ( 2, 'Iglesias',     'DEF'),
  ( 3, 'Julio Díaz',   'DEF'),
  ( 4, 'Kike Salas',   'DEF'),
  ( 5, 'A. Castrín',   'DEF'),
  (23, 'Marcao',       'DEF'),
  (22, 'Carmona',      'DEF'),
  (17, 'Suazo',        'DEF'),
  ( 6, 'Agoumé',       'MED'),
  (10, 'Peque',        'MED'),
  (18, 'Guridi',       'MED'),
  (26, 'Manuel Ángel', 'MED'),
  (28, 'Manu Bueno',   'MED'),
  (30, 'M. Sierra',    'MED'),
  (27, 'Nico Guillén', 'MED'),
  ( 7, 'Alfon',        'DEL'),
  (11, 'Vargas',       'DEL'),
  (21, 'Ejuke',        'DEL'),
  (16, 'Isaac Romero', 'DEL'),
  ( 9, 'Robbie Ure',   'DEL'),
  (19, 'Oso',          'DEL')
) as v(dorsal, nombre, posicion)
where not exists (select 1 from jugadores);

-- ---------------------------------------------------------------- jornada ---
-- Jornada 1: Sevilla - Rayo Vallecano, sábado 15 de agosto de 2026, 21:30.
-- Cierre automático una hora antes: 20:30.

insert into jornadas (numero, rival, en_casa, kickoff, cierre) values
  (1, 'Rayo Vallecano', true,
   timestamptz '2026-08-15 21:30:00+02',
   timestamptz '2026-08-15 21:30:00+02' - interval '1 hour')
on conflict (numero) do nothing;
