-- Standard unit-of-measure reference data. Global, not tenant-scoped.
insert into units_of_measure (name, abbreviation, unit_type) values
  ('each', 'ea', 'count'),
  ('dozen', 'dz', 'count'),
  ('case', 'cs', 'count'),
  ('box', 'bx', 'count'),
  ('bag', 'bg', 'count'),
  ('bottle', 'btl', 'count'),
  ('keg', 'keg', 'count'),
  ('can', 'can', 'count'),
  ('ounce', 'oz', 'weight'),
  ('pound', 'lb', 'weight'),
  ('gram', 'g', 'weight'),
  ('kilogram', 'kg', 'weight'),
  ('fluid_ounce', 'fl oz', 'volume'),
  ('cup', 'cup', 'volume'),
  ('pint', 'pt', 'volume'),
  ('quart', 'qt', 'volume'),
  ('gallon', 'gal', 'volume'),
  ('milliliter', 'mL', 'volume'),
  ('liter', 'L', 'volume')
on conflict (name) do nothing;
