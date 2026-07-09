-- Removes the unused free_token feature (mock-only admin page, superseded by complimentary_ticket).
-- Run: docker exec -i society_postgres psql -U <user> -d society_events < db/migrations/014_drop_free_token.sql

DROP VIEW IF EXISTS v_event_finance;
DROP TABLE IF EXISTS free_token;

CREATE VIEW v_event_finance AS
SELECT
    e.id                                                        AS event_id,
    e.title,
    e.status,
    COALESCE(SUM(DISTINCT r.total_amount), 0)                  AS ticket_revenue,
    COALESCE(
        (SELECT SUM(es2.amount) FROM event_sponsorship es2
         WHERE es2.event_id = e.id AND es2.status = 'received'), 0)
                                                                AS sponsorship_income,
    COALESCE(
        (SELECT SUM(ex2.amount) FROM event_expense ex2
         WHERE ex2.event_id = e.id), 0)                        AS total_expenses,
    COALESCE(
        (SELECT vrd.total_pool FROM vendor_revenue_distribution vrd
         WHERE vrd.event_id = e.id), 0)                        AS vendor_pool,
    COALESCE(
        (SELECT SUM(es3.amount) FROM event_sponsorship es3
         WHERE es3.event_id = e.id AND es3.status = 'received'), 0)
    + COALESCE(SUM(DISTINCT r.total_amount), 0)
    + COALESCE(
        (SELECT vrd2.total_pool FROM vendor_revenue_distribution vrd2
         WHERE vrd2.event_id = e.id), 0)
    - COALESCE(
        (SELECT SUM(ex3.amount) FROM event_expense ex3
         WHERE ex3.event_id = e.id), 0)                        AS net_balance,
    COALESCE(
        (SELECT COUNT(*) FROM event_sponsorship es4
         WHERE es4.event_id = e.id), 0)                        AS sponsor_count,
    COALESCE(
        (SELECT SUM(ct.ticket_count) FROM complimentary_ticket ct
         WHERE ct.event_id = e.id), 0)                         AS complimentary_tickets
FROM event e
LEFT JOIN registration r ON r.event_id = e.id AND r.status = 'confirmed'
GROUP BY e.id, e.title, e.status
ORDER BY e.start_time;
