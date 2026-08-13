INSERT INTO custom_field_groups (id, entity_type, group_key, group_label, description, is_system, display_order)
VALUES
  ('60000000-0000-4000-8000-000000000001', 'MARKETING_CAMPAIGN', 'basic', U&'Th\00f4ng tin chi\1ebfn d\1ecbch', U&'Th\00f4ng tin ch\00ednh d\00f9ng \0111\1ec3 t\1ea1o v\00e0 theo d\00f5i chi\1ebfn d\1ecbch Marketing.', true, 10),
  ('60000000-0000-4000-8000-000000000002', 'MARKETING_CAMPAIGN', 'additional', U&'Th\00f4ng tin b\1ed5 sung', U&'C\00e1c tr\01b0\1eddng d\1eef li\1ec7u t\1ef1 c\1ea5u h\00ecnh cho form chi\1ebfn d\1ecbch Marketing.', true, 20),
  ('61000000-0000-4000-8000-000000000001', 'MARKETING_LEAD_SOURCE', 'basic', U&'Th\00f4ng tin ngu\1ed3n lead', U&'Th\00f4ng tin ch\00ednh d\00f9ng \0111\1ec3 qu\1ea3n l\00fd ngu\1ed3n lead Marketing.', true, 10),
  ('61000000-0000-4000-8000-000000000002', 'MARKETING_LEAD_SOURCE', 'additional', U&'Th\00f4ng tin b\1ed5 sung', U&'C\00e1c tr\01b0\1eddng d\1eef li\1ec7u t\1ef1 c\1ea5u h\00ecnh cho form ngu\1ed3n lead.', true, 20),
  ('62000000-0000-4000-8000-000000000001', 'MARKETING_UTM', 'basic', U&'Th\00f4ng tin UTM', U&'Th\00f4ng tin ch\00ednh d\00f9ng \0111\1ec3 theo d\00f5i hi\1ec7u qu\1ea3 UTM.', true, 10),
  ('62000000-0000-4000-8000-000000000002', 'MARKETING_UTM', 'additional', U&'Th\00f4ng tin b\1ed5 sung', U&'C\00e1c tr\01b0\1eddng d\1eef li\1ec7u t\1ef1 c\1ea5u h\00ecnh cho form theo d\00f5i UTM.', true, 20),
  ('63000000-0000-4000-8000-000000000001', 'MARKETING_FORM', 'basic', U&'Th\00f4ng tin Form & Survey', U&'Th\00f4ng tin ch\00ednh d\00f9ng \0111\1ec3 c\1ea5u h\00ecnh bi\1ec3u m\1eabu Marketing.', true, 10),
  ('63000000-0000-4000-8000-000000000002', 'MARKETING_FORM', 'additional', U&'Th\00f4ng tin b\1ed5 sung', U&'C\00e1c tr\01b0\1eddng d\1eef li\1ec7u t\1ef1 c\1ea5u h\00ecnh cho Form & Survey.', true, 20),
  ('70000000-0000-4000-8000-000000000001', 'ADMISSION_PROFILE', 'basic', U&'Th\00f4ng tin h\1ed3 s\01a1 tuy\1ec3n sinh', U&'Th\00f4ng tin ch\00ednh d\00f9ng \0111\1ec3 t\1ea1o v\00e0 x\1eed l\00fd h\1ed3 s\01a1 tuy\1ec3n sinh.', true, 10),
  ('70000000-0000-4000-8000-000000000002', 'ADMISSION_PROFILE', 'additional', U&'Th\00f4ng tin b\1ed5 sung', U&'C\00e1c tr\01b0\1eddng d\1eef li\1ec7u t\1ef1 c\1ea5u h\00ecnh cho form h\1ed3 s\01a1 tuy\1ec3n sinh.', true, 20),
  ('71000000-0000-4000-8000-000000000001', 'ADMISSION_DOCUMENT', 'basic', U&'Th\00f4ng tin t\00e0i li\1ec7u h\1ed3 s\01a1', U&'Th\00f4ng tin ch\00ednh d\00f9ng \0111\1ec3 upload v\00e0 ki\1ec3m tra t\00e0i li\1ec7u h\1ed3 s\01a1.', true, 10),
  ('71000000-0000-4000-8000-000000000002', 'ADMISSION_DOCUMENT', 'additional', U&'Th\00f4ng tin b\1ed5 sung', U&'C\00e1c tr\01b0\1eddng d\1eef li\1ec7u t\1ef1 c\1ea5u h\00ecnh cho form t\00e0i li\1ec7u h\1ed3 s\01a1.', true, 20),
  ('72000000-0000-4000-8000-000000000001', 'ADMISSION_STATUS', 'basic', U&'Th\00f4ng tin tr\1ea1ng th\00e1i h\1ed3 s\01a1', U&'Th\00f4ng tin ch\00ednh d\00f9ng \0111\1ec3 khai b\00e1o tr\1ea1ng th\00e1i x\1eed l\00fd h\1ed3 s\01a1.', true, 10),
  ('72000000-0000-4000-8000-000000000002', 'ADMISSION_STATUS', 'additional', U&'Th\00f4ng tin b\1ed5 sung', U&'C\00e1c tr\01b0\1eddng d\1eef li\1ec7u t\1ef1 c\1ea5u h\00ecnh cho form tr\1ea1ng th\00e1i h\1ed3 s\01a1.', true, 20),
  ('73000000-0000-4000-8000-000000000001', 'ADMISSION_MAJOR', 'basic', U&'Th\00f4ng tin ng\00e0nh', U&'Th\00f4ng tin ch\00ednh d\00f9ng \0111\1ec3 qu\1ea3n l\00fd ng\00e0nh tuy\1ec3n sinh.', true, 10),
  ('73000000-0000-4000-8000-000000000002', 'ADMISSION_MAJOR', 'additional', U&'Th\00f4ng tin b\1ed5 sung', U&'C\00e1c tr\01b0\1eddng d\1eef li\1ec7u t\1ef1 c\1ea5u h\00ecnh cho form ng\00e0nh tuy\1ec3n sinh.', true, 20)
ON CONFLICT (entity_type, group_key) DO UPDATE SET
  group_label = EXCLUDED.group_label,
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system,
  display_order = EXCLUDED.display_order;
