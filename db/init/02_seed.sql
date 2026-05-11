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
     'a1000000-0000-0000-0000-000000000006', 'keycloak')
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
