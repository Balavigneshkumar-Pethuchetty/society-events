-- =============================================================================
-- Society Events — Seed Data
-- Society: Prestige Verdant Heights, Whitefield, Bengaluru
-- All UUIDs are fixed so FK references are predictable.
-- Keycloak sub UUIDs match the test users in keycloak/realm.json
-- =============================================================================

\c society_events;

-- ---------------------------------------------------------------------------
-- CURRENCY
-- ---------------------------------------------------------------------------
INSERT INTO currency (code, name, symbol, is_active, is_base) VALUES
    ('INR', 'Indian Rupee',       '₹', TRUE,  TRUE),
    ('USD', 'US Dollar',          '$', TRUE,  FALSE),
    ('GBP', 'British Pound',      '£', TRUE,  FALSE),
    ('EUR', 'Euro',               '€', TRUE,  FALSE),
    ('SGD', 'Singapore Dollar',   'S$',TRUE,  FALSE),
    ('AED', 'UAE Dirham',         'د.إ',TRUE, FALSE)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- EXCHANGE RATE  (rates valid from seed time; valid_to = NULL = active)
-- ---------------------------------------------------------------------------
INSERT INTO exchange_rate (id, from_currency, to_currency, rate, source, valid_from) VALUES
    ('71100000-0000-0000-0000-000000000001', 'USD', 'INR', 83.50000000, 'manual', NOW()),
    ('71100000-0000-0000-0000-000000000002', 'GBP', 'INR', 106.2000000, 'manual', NOW()),
    ('71100000-0000-0000-0000-000000000003', 'EUR', 'INR', 91.30000000, 'manual', NOW()),
    ('71100000-0000-0000-0000-000000000004', 'SGD', 'INR', 62.50000000, 'manual', NOW()),
    ('71100000-0000-0000-0000-000000000005', 'AED', 'INR', 22.73000000, 'manual', NOW()),
    -- inverse: INR → foreign (useful for display conversion)
    ('71100000-0000-0000-0000-000000000006', 'INR', 'USD', 0.01197000,  'manual', NOW()),
    ('71100000-0000-0000-0000-000000000007', 'INR', 'GBP', 0.00941000,  'manual', NOW())
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- SOCIETY
-- ---------------------------------------------------------------------------
INSERT INTO society (id, name, address, city, contact_email, base_currency) VALUES
    ('11100000-0000-0000-0000-000000000001',
     'Prestige Verdant Heights',
     '14/1, Varthur Road, Whitefield',
     'Bengaluru',
     'admin@pvh-blr.in',
     'INR')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- APARTMENT  (6 flats across 3 blocks)
-- ---------------------------------------------------------------------------
INSERT INTO apartment (id, society_id, block, unit_number, type) VALUES
    ('21100000-0000-0000-0000-000000000001', '11100000-0000-0000-0000-000000000001', 'A', '101', '2BHK'),
    ('21100000-0000-0000-0000-000000000002', '11100000-0000-0000-0000-000000000001', 'A', '203', '3BHK'),
    ('21100000-0000-0000-0000-000000000003', '11100000-0000-0000-0000-000000000001', 'B', '204', '2BHK'),
    ('21100000-0000-0000-0000-000000000004', '11100000-0000-0000-0000-000000000001', 'B', '301', '3BHK'),
    ('21100000-0000-0000-0000-000000000005', '11100000-0000-0000-0000-000000000001', 'C', '102', '1BHK'),
    ('21100000-0000-0000-0000-000000000006', '11100000-0000-0000-0000-000000000001', 'C', '405', '3BHK')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- USERS
-- keycloak_sub values match 'id' fields in keycloak/realm.json test users.
-- Passwords for all test users: Test@1234
-- ---------------------------------------------------------------------------
INSERT INTO users (id, apartment_id, name, email, phone, role, keycloak_sub, identity_provider) VALUES
    -- Society admin / committee chair
    ('31100000-0000-0000-0000-000000000001',
     '21100000-0000-0000-0000-000000000001',
     'Rajesh Iyer', 'rajesh.iyer@pvh-blr.in', '+91-98450-11111',
     'admin',
     'a1000000-0000-0000-0000-000000000001', 'keycloak'),

    -- Committee member (organises most events)
    ('31100000-0000-0000-0000-000000000002',
     '21100000-0000-0000-0000-000000000003',
     'Meera Krishnan', 'meera.krishnan@gmail.com', '+91-99001-22222',
     'committee_member',
     'a1000000-0000-0000-0000-000000000002', 'keycloak'),

    -- Resident (regular participation)
    ('31100000-0000-0000-0000-000000000003',
     '21100000-0000-0000-0000-000000000002',
     'Arjun Sharma', 'arjun.sharma@gmail.com', '+91-98765-33333',
     'resident',
     'a1000000-0000-0000-0000-000000000003', 'keycloak'),

    -- Resident (Google SSO in Keycloak)
    ('31100000-0000-0000-0000-000000000004',
     '21100000-0000-0000-0000-000000000005',
     'Priya Nair', 'priya.nair@gmail.com', '+91-97789-44444',
     'resident',
     'a1000000-0000-0000-0000-000000000004', 'keycloak'),

    -- Resident
    ('31100000-0000-0000-0000-000000000005',
     '21100000-0000-0000-0000-000000000004',
     'Sanjay Mehta', 'sanjay.mehta@outlook.com', '+91-90001-55555',
     'resident',
     'a1000000-0000-0000-0000-000000000005', 'keycloak'),

    -- NRI resident (pays in USD, lives in San Francisco)
    ('31100000-0000-0000-0000-000000000006',
     '21100000-0000-0000-0000-000000000006',
     'Vikram Patel', 'vikram.patel@gmail.com', '+1-415-999-6666',
     'resident',
     'a1000000-0000-0000-0000-000000000006', 'keycloak'),

    -- Sponsor user — TechCorp Solutions rep (no apartment; external org)
    ('31100000-0000-0000-0000-000000000007',
     NULL,
     'Kavya Reddy', 'kavya.reddy@techcorp.com', '+91-98800-77777',
     'sponsor',
     'a1000000-0000-0000-0000-000000000007', 'keycloak')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- EVENT CATEGORY
-- ---------------------------------------------------------------------------
INSERT INTO event_category (id, society_id, name, icon, color_hex) VALUES
    ('41100000-0000-0000-0000-000000000001', '11100000-0000-0000-0000-000000000001', 'Festival',    'sparkles',    '#F59E0B'),
    ('41100000-0000-0000-0000-000000000002', '11100000-0000-0000-0000-000000000001', 'Sports',      'trophy',      '#10B981'),
    ('41100000-0000-0000-0000-000000000003', '11100000-0000-0000-0000-000000000001', 'Wellness',    'heart',       '#8B5CF6'),
    ('41100000-0000-0000-0000-000000000004', '11100000-0000-0000-0000-000000000001', 'Governance',  'building',    '#6B7280'),
    ('41100000-0000-0000-0000-000000000005', '11100000-0000-0000-0000-000000000001', 'Kids',        'star',        '#EC4899')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- EVENTS  (mix of free/paid, past/upcoming, various statuses)
-- ---------------------------------------------------------------------------
INSERT INTO event (id, society_id, category_id, organizer_id, title, description,
                   start_time, end_time, venue, capacity, status,
                   ticket_price, price_currency, is_free) VALUES

    -- 1. Diwali Mela — free, upcoming
    ('51100000-0000-0000-0000-000000000001',
     '11100000-0000-0000-0000-000000000001',
     '41100000-0000-0000-0000-000000000001',
     '31100000-0000-0000-0000-000000000002',
     'Diwali Mela 2025',
     'Annual Diwali celebration with rangoli competition, diyas, cultural performances, and a grand potluck dinner. All residents and their guests are welcome.',
     NOW() + INTERVAL '45 days',
     NOW() + INTERVAL '45 days' + INTERVAL '5 hours',
     'Society Clubhouse & Garden', 500, 'published',
     0.00, 'INR', TRUE),

    -- 2. Annual Sports Day — paid INR, upcoming
    ('51100000-0000-0000-0000-000000000002',
     '11100000-0000-0000-0000-000000000001',
     '41100000-0000-0000-0000-000000000002',
     '31100000-0000-0000-0000-000000000002',
     'Annual Sports Day 2026',
     'Cricket, badminton, throwball, tug-of-war and 100m sprint. Medals and trophies for top three in each category. Registration covers sports kit and refreshments.',
     NOW() + INTERVAL '80 days',
     NOW() + INTERVAL '80 days' + INTERVAL '8 hours',
     'Society Sports Ground', 200, 'published',
     150.00, 'INR', FALSE),

    -- 3. Sunday Yoga — free, ongoing
    ('51100000-0000-0000-0000-000000000003',
     '11100000-0000-0000-0000-000000000001',
     '41100000-0000-0000-0000-000000000003',
     '31100000-0000-0000-0000-000000000001',
     'Sunday Morning Yoga',
     'Guided yoga and pranayama session every Sunday at 6:30 AM. Suitable for all levels. Bring your own mat.',
     NOW() + INTERVAL '5 days',
     NOW() + INTERVAL '5 days' + INTERVAL '1 hour',
     'Rooftop Terrace — Block A', 30, 'published',
     0.00, 'INR', TRUE),

    -- 4. Society AGM — free, upcoming
    ('51100000-0000-0000-0000-000000000004',
     '11100000-0000-0000-0000-000000000001',
     '41100000-0000-0000-0000-000000000004',
     '31100000-0000-0000-0000-000000000001',
     'Annual General Meeting 2025',
     'Mandatory AGM covering FY2025 accounts, maintenance fee revision, upcoming infrastructure projects, and election of new committee members.',
     NOW() + INTERVAL '20 days',
     NOW() + INTERVAL '20 days' + INTERVAL '3 hours',
     'Conference Room, Clubhouse', 150, 'published',
     0.00, 'INR', TRUE),

    -- 5. Children's Day Carnival — paid INR, upcoming
    ('51100000-0000-0000-0000-000000000005',
     '11100000-0000-0000-0000-000000000001',
     '41100000-0000-0000-0000-000000000005',
     '31100000-0000-0000-0000-000000000002',
     'Children''s Day Carnival',
     'Games, face painting, puppet show, and an art competition for kids aged 4-14. Fee covers activity kits, snacks, and participation gifts.',
     NOW() + INTERVAL '12 days',
     NOW() + INTERVAL '12 days' + INTERVAL '4 hours',
     'Society Amphitheatre', 100, 'published',
     100.00, 'INR', FALSE)

ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- REGISTRATION
-- ---------------------------------------------------------------------------
INSERT INTO registration (id, event_id, user_id, ticket_count, total_amount,
                           display_currency, status, qr_code) VALUES

    -- Diwali (free) — 3 registrations
    ('61100000-0000-0000-0000-000000000001',
     '51100000-0000-0000-0000-000000000001', '31100000-0000-0000-0000-000000000003',
     3, 0.00, 'INR', 'confirmed', 'QR-DIWALI-ARJUN-001'),

    ('61100000-0000-0000-0000-000000000002',
     '51100000-0000-0000-0000-000000000001', '31100000-0000-0000-0000-000000000004',
     2, 0.00, 'INR', 'confirmed', 'QR-DIWALI-PRIYA-001'),

    ('61100000-0000-0000-0000-000000000003',
     '51100000-0000-0000-0000-000000000001', '31100000-0000-0000-0000-000000000005',
     4, 0.00, 'INR', 'confirmed', 'QR-DIWALI-SANJAY-001'),

    -- Sports Day (paid INR) — Arjun: 2 tickets = ₹300
    ('61100000-0000-0000-0000-000000000004',
     '51100000-0000-0000-0000-000000000002', '31100000-0000-0000-0000-000000000003',
     2, 300.00, 'INR', 'confirmed', 'QR-SPORTS-ARJUN-001'),

    -- Sports Day (paid USD) — Vikram: 1 ticket; USD equivalent of ₹150 ≈ $1.80
    ('61100000-0000-0000-0000-000000000005',
     '51100000-0000-0000-0000-000000000002', '31100000-0000-0000-0000-000000000006',
     1, 1.80, 'USD', 'confirmed', 'QR-SPORTS-VIKRAM-001'),

    -- Children's Carnival (paid INR) — Priya: 2 tickets = ₹200
    ('61100000-0000-0000-0000-000000000006',
     '51100000-0000-0000-0000-000000000005', '31100000-0000-0000-0000-000000000004',
     2, 200.00, 'INR', 'confirmed', 'QR-KIDS-PRIYA-001'),

    -- Yoga (free)
    ('61100000-0000-0000-0000-000000000007',
     '51100000-0000-0000-0000-000000000003', '31100000-0000-0000-0000-000000000003',
     1, 0.00, 'INR', 'confirmed', 'QR-YOGA-ARJUN-001'),

    -- AGM (free) — Sanjay, pending (hasn't confirmed yet)
    ('61100000-0000-0000-0000-000000000008',
     '51100000-0000-0000-0000-000000000004', '31100000-0000-0000-0000-000000000005',
     1, 0.00, 'INR', 'pending', NULL)

ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- PAYMENT  (only paid registrations get a payment row)
-- ---------------------------------------------------------------------------
INSERT INTO payment (id, registration_id, gateway_name, gateway_order_id, gateway_txn_id,
                     original_amount, original_currency,
                     settled_amount, settled_currency,
                     exchange_rate_used, exchange_rate_id,
                     status, gateway_response, paid_at) VALUES

    -- Arjun pays ₹300 for Sports Day (INR → INR, rate = 1)
    ('81100000-0000-0000-0000-000000000001',
     '61100000-0000-0000-0000-000000000004',
     'razorpay', 'order_RZP_sports_arjun_001', 'pay_RZP_sports_arjun_001',
     300.00, 'INR',
     300.00, 'INR',
     1.0, NULL,
     'success',
     '{"razorpay_payment_id":"pay_RZP_sports_arjun_001","razorpay_order_id":"order_RZP_sports_arjun_001","method":"upi","bank":null,"wallet":null,"vpa":"arjun@oksbi","fee":600,"tax":91}'::jsonb,
     NOW() - INTERVAL '2 days'),

    -- Vikram pays $1.80 USD for Sports Day (USD → INR at 83.50)
    -- settled: 1.80 × 83.50 = 150.30 INR (≈ ₹150 ticket)
    ('81100000-0000-0000-0000-000000000002',
     '61100000-0000-0000-0000-000000000005',
     'razorpay', 'order_RZP_sports_vikram_001', 'pay_RZP_sports_vikram_001',
     1.80, 'USD',
     150.30, 'INR',
     83.50000000, '71100000-0000-0000-0000-000000000001',
     'success',
     '{"razorpay_payment_id":"pay_RZP_sports_vikram_001","razorpay_order_id":"order_RZP_sports_vikram_001","method":"card","bank":"HDFC","international":true,"currency":"USD","dcc_markup":0}'::jsonb,
     NOW() - INTERVAL '3 days'),

    -- Priya pays ₹200 for Children's Carnival
    ('81100000-0000-0000-0000-000000000003',
     '61100000-0000-0000-0000-000000000006',
     'razorpay', 'order_RZP_kids_priya_001', 'pay_RZP_kids_priya_001',
     200.00, 'INR',
     200.00, 'INR',
     1.0, NULL,
     'success',
     '{"razorpay_payment_id":"pay_RZP_kids_priya_001","razorpay_order_id":"order_RZP_kids_priya_001","method":"netbanking","bank":"SBIN","wallet":null}'::jsonb,
     NOW() - INTERVAL '1 day')

ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- REFUND  (Priya requested a refund for the carnival — partial, ₹100)
-- ---------------------------------------------------------------------------
INSERT INTO refund (id, payment_id, initiated_by,
                    original_refund_amount, original_currency,
                    settled_refund_amount, settled_currency,
                    reason, status, gateway_refund_id) VALUES
    ('91100000-0000-0000-0000-000000000001',
     '81100000-0000-0000-0000-000000000003',
     '31100000-0000-0000-0000-000000000004',
     100.00, 'INR',
     100.00, 'INR',
     'One family member unable to attend due to travel. Requesting partial refund for 1 ticket.',
     'processed',
     'rfnd_RZP_kids_priya_001')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- ANNOUNCEMENT
-- ---------------------------------------------------------------------------
INSERT INTO announcement (id, event_id, author_id, title, body, sent_at) VALUES
    ('a1100000-0000-0000-0000-000000000001',
     '51100000-0000-0000-0000-000000000001',
     '31100000-0000-0000-0000-000000000002',
     'Diwali Mela — Rangoli Competition Details',
     'Dear residents, the rangoli competition will begin at 5 PM sharp. Each flat may register one team of up to 4 members. Colours and stencils will be provided. Theme this year: "Unity in Diversity".',
     NOW() - INTERVAL '5 days'),

    ('a1100000-0000-0000-0000-000000000002',
     '51100000-0000-0000-0000-000000000002',
     '31100000-0000-0000-0000-000000000002',
     'Sports Day — Schedule Released',
     'The final event schedule is now available on the notice board and app. Cricket registration closes in 48 hours. Please confirm your team composition by replying to this message.',
     NOW() - INTERVAL '1 day'),

    ('a1100000-0000-0000-0000-000000000003',
     '51100000-0000-0000-0000-000000000004',
     '31100000-0000-0000-0000-000000000001',
     'AGM Agenda Published',
     'The agenda for the Annual General Meeting has been published. Key items: (1) FY2025 audited accounts, (2) Maintenance fee increase proposal of 8%, (3) EV charging station installation in B Block, (4) New committee election. Please review the documents shared on WhatsApp.',
     NOW() - INTERVAL '3 days')

ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- NOTIFICATION  (per-user inbox entries)
-- ---------------------------------------------------------------------------
INSERT INTO notification (id, user_id, event_id, type, title, message, is_read) VALUES

    -- Arjun: payment confirmed for Sports Day
    ('b1100000-0000-0000-0000-000000000001',
     '31100000-0000-0000-0000-000000000003',
     '51100000-0000-0000-0000-000000000002',
     'payment_success',
     'Payment confirmed — Annual Sports Day 2026',
     'Your payment of ₹300 for 2 tickets to Annual Sports Day 2026 was successful. Your QR code is ready under My Tickets.',
     TRUE),

    -- Arjun: reminder for Diwali Mela
    ('b1100000-0000-0000-0000-000000000002',
     '31100000-0000-0000-0000-000000000003',
     '51100000-0000-0000-0000-000000000001',
     'event_reminder',
     'Diwali Mela is 3 days away!',
     'The Diwali Mela starts in 3 days at the Society Clubhouse. You have 3 tickets registered. Don''t forget to bring your potluck dish!',
     FALSE),

    -- Vikram: payment confirmed for Sports Day (USD)
    ('b1100000-0000-0000-0000-000000000003',
     '31100000-0000-0000-0000-000000000006',
     '51100000-0000-0000-0000-000000000002',
     'payment_success',
     'Payment confirmed — Annual Sports Day 2026',
     'Your payment of $1.80 USD (₹150.30 settled) for 1 ticket to Annual Sports Day 2026 was successful.',
     TRUE),

    -- Priya: refund processed for Children's Carnival
    ('b1100000-0000-0000-0000-000000000004',
     '31100000-0000-0000-0000-000000000004',
     '51100000-0000-0000-0000-000000000005',
     'refund_processed',
     'Refund of ₹100 processed',
     'Your partial refund of ₹100 for Children''s Day Carnival has been processed. It will reflect in your account within 5-7 business days.',
     FALSE),

    -- Sanjay: registration reminder to complete AGM registration
    ('b1100000-0000-0000-0000-000000000005',
     '31100000-0000-0000-0000-000000000005',
     '51100000-0000-0000-0000-000000000004',
     'event_reminder',
     'Confirm your AGM attendance',
     'The Annual General Meeting is 20 days away. Please confirm your attendance by clicking the button in the app. Quorum requires 51% of flat owners.',
     FALSE),

    -- Meera: announcement for Sports Day
    ('b1100000-0000-0000-0000-000000000006',
     '31100000-0000-0000-0000-000000000002',
     '51100000-0000-0000-0000-000000000002',
     'announcement',
     'Sports Day — Schedule Released',
     'The event schedule for Annual Sports Day 2026 has been published. Cricket registration closes in 48 hours.',
     TRUE),

    -- Priya: Diwali registration confirmed
    ('b1100000-0000-0000-0000-000000000007',
     '31100000-0000-0000-0000-000000000004',
     '51100000-0000-0000-0000-000000000001',
     'registration_confirmed',
     'You''re registered for Diwali Mela 2025',
     'Your registration for Diwali Mela 2025 (2 tickets) is confirmed. See you at the Clubhouse!',
     TRUE),

    -- Sanjay: Diwali registration confirmed
    ('b1100000-0000-0000-0000-000000000008',
     '31100000-0000-0000-0000-000000000005',
     '51100000-0000-0000-0000-000000000001',
     'registration_confirmed',
     'You''re registered for Diwali Mela 2025',
     'Your registration for Diwali Mela 2025 (4 tickets) is confirmed. See you there!',
     FALSE)

ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- SPONSOR  (two sponsors: one linked to platform user, one external org)
-- ---------------------------------------------------------------------------
INSERT INTO sponsor (id, user_id, organization_name, organization_type,
                     contact_name, contact_email, contact_phone) VALUES
    ('c1100000-0000-0000-0000-000000000001',
     '31100000-0000-0000-0000-000000000007',
     'TechCorp Solutions Pvt. Ltd.', 'private',
     'Kavya Reddy', 'kavya.reddy@techcorp.com', '+91-98800-77777'),
    ('c1100000-0000-0000-0000-000000000002',
     NULL,
     'Community Welfare Foundation', 'ngo',
     'Anand Kumar', 'anand.kumar@cwf.org', '+91-99900-88888')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- EVENT_SPONSORSHIP
-- ---------------------------------------------------------------------------
INSERT INTO event_sponsorship (id, event_id, sponsor_id, amount, currency_code,
                                status, payment_reference, notes) VALUES
    -- TechCorp sponsors Diwali Mela — ₹25,000 received
    ('d1100000-0000-0000-0000-000000000001',
     '51100000-0000-0000-0000-000000000001',
     'c1100000-0000-0000-0000-000000000001',
     25000.00, 'INR', 'received', 'TXN-DIWALI-TECHCORP-001',
     'Sponsoring decorations and prizes for rangoli competition'),

    -- Community Welfare Foundation sponsors Sports Day — ₹15,000 received
    ('d1100000-0000-0000-0000-000000000002',
     '51100000-0000-0000-0000-000000000002',
     'c1100000-0000-0000-0000-000000000002',
     15000.00, 'INR', 'received', 'TXN-SPORTS-CWF-001',
     'Sponsoring sports kits and medals for all categories'),

    -- TechCorp also sponsors Sports Day — ₹10,000 pledged (not yet received)
    ('d1100000-0000-0000-0000-000000000003',
     '51100000-0000-0000-0000-000000000002',
     'c1100000-0000-0000-0000-000000000001',
     10000.00, 'INR', 'pledged', NULL,
     'Pledged to sponsor the refreshment counter')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- SPONSORSHIP_REFUND  (TechCorp requests partial refund on Sports Day pledge)
-- ---------------------------------------------------------------------------
INSERT INTO sponsorship_refund (id, sponsorship_id, requested_by, amount,
                                currency_code, reason, status) VALUES
    ('e1100000-0000-0000-0000-000000000001',
     'd1100000-0000-0000-0000-000000000003',
     '31100000-0000-0000-0000-000000000007',
     5000.00, 'INR',
     'Event capacity was reduced; requesting partial refund for the unsupported portion.',
     'pending')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- EVENT_EXPENSE  (Diwali Mela & Sports Day expenses logged by Meera)
-- ---------------------------------------------------------------------------
INSERT INTO event_expense (id, event_id, description, amount, currency_code,
                            category, created_by) VALUES
    -- Diwali Mela
    ('f1100000-0000-0000-0000-000000000001',
     '51100000-0000-0000-0000-000000000001',
     'Decoration materials — diyas, lanterns, flowers', 8500.00, 'INR',
     'venue', '31100000-0000-0000-0000-000000000002'),

    ('f1100000-0000-0000-0000-000000000002',
     '51100000-0000-0000-0000-000000000001',
     'Potluck setup and utensils', 3200.00, 'INR',
     'catering', '31100000-0000-0000-0000-000000000002'),

    ('f1100000-0000-0000-0000-000000000003',
     '51100000-0000-0000-0000-000000000001',
     'Sound system rental', 5000.00, 'INR',
     'equipment', '31100000-0000-0000-0000-000000000002'),

    -- Annual Sports Day
    ('f1100000-0000-0000-0000-000000000004',
     '51100000-0000-0000-0000-000000000002',
     'Cricket set and badminton nets', 6000.00, 'INR',
     'equipment', '31100000-0000-0000-0000-000000000002'),

    ('f1100000-0000-0000-0000-000000000005',
     '51100000-0000-0000-0000-000000000002',
     'Medals and trophies for all categories', 4500.00, 'INR',
     'other', '31100000-0000-0000-0000-000000000002'),

    ('f1100000-0000-0000-0000-000000000006',
     '51100000-0000-0000-0000-000000000002',
     'Refreshments for participants', 3800.00, 'INR',
     'catering', '31100000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- COMPLIMENTARY_TICKET  (free entries by type; walk-ins have no user linked)
-- ---------------------------------------------------------------------------
INSERT INTO complimentary_ticket (id, event_id, invited_by_user_id, inviter_type,
                                  ticket_count, notes, created_by) VALUES
    -- Diwali: committee member (Meera) brings 2 family guests
    ('g1100000-0000-0000-0000-000000000001',
     '51100000-0000-0000-0000-000000000001',
     '31100000-0000-0000-0000-000000000002', 'committee_member',
     2, 'Committee member''s family guests',
     '31100000-0000-0000-0000-000000000002'),

    -- Diwali: organizer (Rajesh) brings 3 neighbours
    ('g1100000-0000-0000-0000-000000000002',
     '51100000-0000-0000-0000-000000000001',
     '31100000-0000-0000-0000-000000000001', 'organizer',
     3, 'Organizer''s family and neighbours',
     '31100000-0000-0000-0000-000000000001'),

    -- Diwali: TechCorp sponsor (Kavya) brings 4 team members
    ('g1100000-0000-0000-0000-000000000003',
     '51100000-0000-0000-0000-000000000001',
     '31100000-0000-0000-0000-000000000007', 'sponsor',
     4, 'Sponsor TechCorp team members',
     '31100000-0000-0000-0000-000000000002'),

    -- Diwali: walk-in counter (15 anonymous attendees at the gate)
    ('g1100000-0000-0000-0000-000000000004',
     '51100000-0000-0000-0000-000000000001',
     NULL, 'walk_in',
     15, 'Walk-in attendees registered at the gate',
     '31100000-0000-0000-0000-000000000001'),

    -- Sports Day: walk-ins
    ('g1100000-0000-0000-0000-000000000005',
     '51100000-0000-0000-0000-000000000002',
     NULL, 'walk_in',
     8, 'Walk-ins at entry gate on event day',
     '31100000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- NOTIFICATION — new sponsor-related notifications
-- ---------------------------------------------------------------------------
INSERT INTO notification (id, user_id, event_id, type, title, message, is_read) VALUES
    -- Kavya: sponsorship received confirmation for Diwali Mela
    ('b1100000-0000-0000-0000-000000000009',
     '31100000-0000-0000-0000-000000000007',
     '51100000-0000-0000-0000-000000000001',
     'payment_success',
     'Sponsorship confirmed — Diwali Mela 2025',
     'Your sponsorship of ₹25,000 for Diwali Mela 2025 has been received. Thank you for your support!',
     TRUE),

    -- Kavya: refund request acknowledgement for Sports Day
    ('b1100000-0000-0000-0000-000000000010',
     '31100000-0000-0000-0000-000000000007',
     '51100000-0000-0000-0000-000000000002',
     'refund_processed',
     'Refund request submitted — Annual Sports Day 2026',
     'Your refund request of ₹5,000 for Annual Sports Day 2026 is under review. You will be notified once the organizer reviews it.',
     FALSE)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- VENDOR  (shop stalls that can be invited to events)
-- ---------------------------------------------------------------------------
INSERT INTO vendor (id, society_id, name, category,
                    contact_name, contact_email, contact_phone) VALUES
    ('h1100000-0000-0000-0000-000000000001',
     '11100000-0000-0000-0000-000000000001',
     'Raj Sweets & Snacks', 'food',
     'Rajan Pillai', 'rajan@rajsweets.in', '+91-98001-11001'),
    ('h1100000-0000-0000-0000-000000000002',
     '11100000-0000-0000-0000-000000000001',
     'Fun Games Zone', 'games',
     'Deepak Rao', 'deepak@fungames.in', '+91-97001-22002'),
    ('h1100000-0000-0000-0000-000000000003',
     '11100000-0000-0000-0000-000000000001',
     'Sparkle Merchandise', 'merchandise',
     'Sunita Bose', 'sunita@sparklemerch.in', '+91-96001-33003')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- EVENT_VENDOR  (vendors linked to Diwali Mela with different fee types)
-- ---------------------------------------------------------------------------
INSERT INTO event_vendor (id, event_id, vendor_id, stall_number, fee_type,
                           fixed_fee, revenue_share_pct, actual_revenue, status, notes) VALUES
    -- Raj Sweets: revenue share 15% of their sales; actual revenue ₹20,000 → pool contribution ₹3,000
    ('i1100000-0000-0000-0000-000000000001',
     '51100000-0000-0000-0000-000000000001',
     'h1100000-0000-0000-0000-000000000001',
     'A-01', 'revenue_share',
     0.00, 15.00, 20000.00, 'confirmed',
     'Sweets and snacks stall near main entrance'),

    -- Fun Games: fixed stall fee ₹2,000 (no revenue share)
    ('i1100000-0000-0000-0000-000000000002',
     '51100000-0000-0000-0000-000000000001',
     'h1100000-0000-0000-0000-000000000002',
     'B-03', 'fixed',
     2000.00, 0.00, NULL, 'confirmed',
     'Games stall for kids and adults'),

    -- Sparkle Merchandise: revenue share 20% of their sales; actual revenue ₹9,500 → pool ₹1,900
    ('i1100000-0000-0000-0000-000000000003',
     '51100000-0000-0000-0000-000000000001',
     'h1100000-0000-0000-0000-000000000003',
     'C-02', 'revenue_share',
     0.00, 20.00, 9500.00, 'confirmed',
     'Diwali-themed gifts and decorative items')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- VENDOR_REVENUE_DISTRIBUTION  (Diwali Mela pool: ₹3000 + ₹2000 + ₹1900 = ₹6,900)
-- ---------------------------------------------------------------------------
INSERT INTO vendor_revenue_distribution (id, event_id, total_pool, currency_code,
                                          status, notes) VALUES
    ('j1100000-0000-0000-0000-000000000001',
     '51100000-0000-0000-0000-000000000001',
     6900.00, 'INR', 'draft',
     'Combined revenue pool from vendor stall fees and revenue share')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- DISTRIBUTION_ENTRY  (4 recipients; percentages sum to 100%)
-- ---------------------------------------------------------------------------
INSERT INTO distribution_entry (id, distribution_id, recipient_type,
                                  recipient_user_id, recipient_sponsor_id,
                                  share_percentage, amount, status) VALUES
    -- TechCorp sponsor gets 30% = ₹2,070
    ('k1100000-0000-0000-0000-000000000001',
     'j1100000-0000-0000-0000-000000000001',
     'sponsor', NULL, 'c1100000-0000-0000-0000-000000000001',
     30.00, 2070.00, 'pending'),

    -- CWF gets 10% = ₹690
    ('k1100000-0000-0000-0000-000000000002',
     'j1100000-0000-0000-0000-000000000001',
     'sponsor', NULL, 'c1100000-0000-0000-0000-000000000002',
     10.00, 690.00, 'pending'),

    -- Meera (organizer) gets 30% = ₹2,070
    ('k1100000-0000-0000-0000-000000000003',
     'j1100000-0000-0000-0000-000000000001',
     'organizer', '31100000-0000-0000-0000-000000000002', NULL,
     30.00, 2070.00, 'pending'),

    -- Society retains 30% = ₹2,070
    ('k1100000-0000-0000-0000-000000000004',
     'j1100000-0000-0000-0000-000000000001',
     'society', NULL, NULL,
     30.00, 2070.00, 'pending')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- TICKET_TYPE  (multiple tiers for Diwali Mela and Sports Day)
-- ---------------------------------------------------------------------------
INSERT INTO ticket_type (id, event_id, name, description, price, is_free,
                          capacity, sort_order) VALUES
    -- Diwali Mela ticket types
    ('l1100000-0000-0000-0000-000000000001',
     '51100000-0000-0000-0000-000000000001',
     'General Entry', 'Entry to all open stalls, performances and rangoli area',
     0.00, TRUE, NULL, 1),
    ('l1100000-0000-0000-0000-000000000002',
     '51100000-0000-0000-0000-000000000001',
     'Dinner Pass', 'Includes a plate at the grand potluck dinner buffet',
     150.00, FALSE, 200, 2),
    ('l1100000-0000-0000-0000-000000000003',
     '51100000-0000-0000-0000-000000000001',
     'Games Bundle', 'Unlimited access to all Fun Games Zone activities',
     50.00, FALSE, 150, 3),

    -- Annual Sports Day ticket types
    ('l1100000-0000-0000-0000-000000000004',
     '51100000-0000-0000-0000-000000000002',
     'Participant', 'Register as a player in any category (includes kit + refreshments)',
     150.00, FALSE, NULL, 1),
    ('l1100000-0000-0000-0000-000000000005',
     '51100000-0000-0000-0000-000000000002',
     'Spectator', 'Entry to watch all events from spectator stands',
     50.00, FALSE, NULL, 2),
    ('l1100000-0000-0000-0000-000000000006',
     '51100000-0000-0000-0000-000000000002',
     'Kids Zone', 'Kids 5-12 years — mini-games and activity corner',
     75.00, FALSE, 80, 3)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- REGISTRATION_ITEM  (line items tying existing registrations to ticket types)
-- ---------------------------------------------------------------------------
INSERT INTO registration_item (id, registration_id, ticket_type_id, quantity, unit_price) VALUES
    -- Arjun's Sports Day registration: 2 participant tickets @ ₹150 each
    ('m1100000-0000-0000-0000-000000000001',
     '61100000-0000-0000-0000-000000000004',
     'l1100000-0000-0000-0000-000000000004',
     2, 150.00),

    -- Vikram's Sports Day registration: 1 spectator ticket @ ₹50 (displayed as USD)
    ('m1100000-0000-0000-0000-000000000002',
     '61100000-0000-0000-0000-000000000005',
     'l1100000-0000-0000-0000-000000000005',
     1, 50.00),

    -- Priya's Children's Carnival: no ticket_type (single-tier event, no rows needed)
    -- Arjun's Diwali: 3 general entry tickets (free)
    ('m1100000-0000-0000-0000-000000000003',
     '61100000-0000-0000-0000-000000000001',
     'l1100000-0000-0000-0000-000000000001',
     3, 0.00)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- FREE_TOKEN  (organizer-issued codes for complimentary access)
-- ---------------------------------------------------------------------------
INSERT INTO free_token (id, event_id, ticket_type_id, token_code,
                         issued_to_name, issued_to_email, issued_by,
                         is_used, notes) VALUES
    -- Diwali Dinner Pass for special guest (named)
    ('n1100000-0000-0000-0000-000000000001',
     '51100000-0000-0000-0000-000000000001',
     'l1100000-0000-0000-0000-000000000002',
     'DIWALI-DIN-001',
     'Dr. Suresh Pillai', 'suresh.pillai@gmail.com',
     '31100000-0000-0000-0000-000000000002',
     FALSE, 'VIP guest — chief guest for cultural performance'),

    -- Diwali Games Bundle — bulk tokens for sponsor team (no names; use token_code at stall)
    ('n1100000-0000-0000-0000-000000000002',
     '51100000-0000-0000-0000-000000000001',
     'l1100000-0000-0000-0000-000000000003',
     'DIWALI-GAME-TECHCORP',
     NULL, NULL,
     '31100000-0000-0000-0000-000000000002',
     FALSE, 'TechCorp sponsor team — 4 games passes (anonymous)'),

    -- Sports Day Spectator token for walk-in press representative
    ('n1100000-0000-0000-0000-000000000003',
     '51100000-0000-0000-0000-000000000002',
     'l1100000-0000-0000-0000-000000000005',
     'SPORTS-SPEC-PRESS-001',
     'Kavitha Nambiar (The Hindu)', NULL,
     '31100000-0000-0000-0000-000000000001',
     TRUE, 'Press spectator — used at gate')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helpful summary view (optional — useful when poking around in pgAdmin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_event_summary AS
SELECT
    e.title,
    e.status,
    e.start_time,
    e.venue,
    e.is_free,
    e.ticket_price,
    e.price_currency,
    COUNT(r.id)            AS total_registrations,
    SUM(r.ticket_count)    AS total_tickets,
    SUM(r.total_amount)    AS total_revenue,
    ec.name                AS category
FROM event e
LEFT JOIN registration r ON r.event_id = e.id
LEFT JOIN event_category ec ON ec.id = e.category_id
GROUP BY e.id, ec.name
ORDER BY e.start_time;

CREATE OR REPLACE VIEW v_payment_audit AS
SELECT
    p.id                  AS payment_id,
    u.name                AS resident,
    ev.title              AS event,
    p.gateway_name,
    p.gateway_txn_id,
    p.original_amount,
    p.original_currency,
    p.settled_amount,
    p.settled_currency,
    p.exchange_rate_used,
    p.status,
    p.paid_at
FROM payment p
JOIN registration r  ON r.id = p.registration_id
JOIN users u         ON u.id = r.user_id
JOIN event ev        ON ev.id = r.event_id
ORDER BY p.paid_at DESC;
