-- ESPN group ids for the eleven FBS conferences (all children of group 80).
insert into public.conferences (id, name, short_name, abbreviation) values
  (1,   'Atlantic Coast Conference',      'ACC',            'ACC'),
  (4,   'Big 12 Conference',              'Big 12',         'B12'),
  (5,   'Big Ten Conference',             'Big Ten',        'B1G'),
  (8,   'Southeastern Conference',        'SEC',            'SEC'),
  (9,   'Pac-12 Conference',              'Pac-12',         'PAC'),
  (12,  'Conference USA',                 'C-USA',          'CUSA'),
  (15,  'Mid-American Conference',        'MAC',            'MAC'),
  (17,  'Mountain West Conference',       'Mountain West',  'MW'),
  (18,  'FBS Independents',               'Independents',   'IND'),
  (37,  'Sun Belt Conference',            'Sun Belt',       'SBC'),
  (151, 'American Athletic Conference',   'American',       'AAC')
on conflict (id) do update
  set name = excluded.name,
      short_name = excluded.short_name,
      abbreviation = excluded.abbreviation;
