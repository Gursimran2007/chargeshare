-- Configurable reference data. Admins can add connector categories or vehicle
-- models without code changes. Vehicle figures are indicative public specs;
-- the UI tells drivers to confirm against their own vehicle manual.

insert into public.connector_types (code, label, current, description, max_kw, listable, sort_order) values
  ('type2_ac', 'Type 2 AC (IEC 62196-2)', 'AC',
   'Tethered or socketed Type 2 wallbox. Common on home and workplace chargers in India; typically 3.3 to 22 kW.', 22, true, 1),
  ('bharat_ac001', 'Bharat AC-001', 'AC',
   'BIS public AC charger with IEC 60309 outlets, 3.3 kW per outlet. Vehicle needs a compatible charging cable.', 10, true, 2),
  ('ccs2', 'CCS2 DC fast', 'DC',
   'Combined Charging System (DC). Typically commercial installations only.', 150, true, 3),
  ('domestic_socket', 'Domestic 15A socket', 'AC',
   'Ordinary household sockets cannot be listed on ChargeShare. Use a certified EV charger (EVSE) installed by a qualified electrician.', 3, false, 9);

insert into public.vehicle_models (id, make, model, battery_kwh, max_ac_kw, max_dc_kw, connectors, notes) values
  ('tata-nexon-ev-45', 'Tata', 'Nexon EV 45', 45, 7.2, 60, '{type2_ac,ccs2}', ''),
  ('tata-punch-ev-lr', 'Tata', 'Punch EV Long Range', 35, 7.2, 50, '{type2_ac,ccs2}', ''),
  ('tata-tiago-ev-lr', 'Tata', 'Tiago EV Long Range', 24, 3.3, 25, '{type2_ac,ccs2}', '7.2 kW AC on variants with the optional fast charger.'),
  ('mg-zs-ev', 'MG', 'ZS EV', 50.3, 7.4, 50, '{type2_ac,ccs2}', ''),
  ('mg-windsor-ev', 'MG', 'Windsor EV', 38, 7.4, 45, '{type2_ac,ccs2}', ''),
  ('mg-comet-ev', 'MG', 'Comet EV', 17.3, 3.3, null, '{type2_ac}', 'AC charging only.'),
  ('mahindra-xuv400', 'Mahindra', 'XUV400 EL Pro', 39.4, 7.2, 50, '{type2_ac,ccs2}', ''),
  ('mahindra-be6', 'Mahindra', 'BE 6', 79, 11, 175, '{type2_ac,ccs2}', ''),
  ('hyundai-creta-electric', 'Hyundai', 'Creta Electric', 51.4, 11, 50, '{type2_ac,ccs2}', ''),
  ('byd-atto-3', 'BYD', 'Atto 3', 60.5, 7, 80, '{type2_ac,ccs2}', ''),
  ('citroen-ec3', 'Citroen', 'eC3', 29.2, 3.3, 30, '{type2_ac,ccs2}', '');
