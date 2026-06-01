-- Seed data for walking-skeleton testing. Mirrors apps/mobile/src/data/stubPantry.ts
-- so that when the PowerSync client pulls these down, the screen renders identically
-- to the stub — clean visual confirmation that the wire works.
--
-- Item UUIDs MUST match the stub's UUIDs exactly. Don't change them without also
-- changing the stub.

INSERT INTO pantry_items (id, household_id, name, brand, category, quantity, unit, location, added_at, expires_at, source, added_by, updated_at, deleted) VALUES
  (
    '11111111-1111-4111-8111-111111111111'::UUID,
    '00000000-0000-0000-0000-000000000001'::UUID,
    'Chicken breast', 'Organic Valley', 'meat',
    1, 'lb', 'fridge',
    NOW() - INTERVAL '2 days',
    NOW() + INTERVAL '2 days',
    'receipt', 'seed-device',
    (EXTRACT(EPOCH FROM NOW() - INTERVAL '1 day') * 1000)::BIGINT,
    FALSE
  ),
  (
    '22222222-2222-4222-8222-222222222222'::UUID,
    '00000000-0000-0000-0000-000000000001'::UUID,
    'Olive oil', NULL, 'pantry',
    1, 'bottle', 'pantry',
    NOW() - INTERVAL '30 days',
    NOW() + INTERVAL '120 days',
    'manual', 'seed-device',
    (EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days') * 1000)::BIGINT,
    FALSE
  ),
  (
    '33333333-3333-4333-8333-333333333333'::UUID,
    '00000000-0000-0000-0000-000000000001'::UUID,
    'Parsley', NULL, 'produce',
    1, 'bunch', 'fridge',
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '4 days',
    'receipt', 'seed-device',
    (EXTRACT(EPOCH FROM NOW() - INTERVAL '1 day') * 1000)::BIGINT,
    FALSE
  ),
  (
    '44444444-4444-4444-8444-444444444444'::UUID,
    '00000000-0000-0000-0000-000000000001'::UUID,
    'Eggs', 'Vital Farms', 'dairy',
    12, 'ct', 'fridge',
    NOW() - INTERVAL '5 days',
    NOW() + INTERVAL '18 days',
    'barcode', 'seed-device',
    (EXTRACT(EPOCH FROM NOW() - INTERVAL '5 days') * 1000)::BIGINT,
    FALSE
  )
ON CONFLICT (id) DO NOTHING;
