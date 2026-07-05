ALTER TABLE crm.contacts
  ADD COLUMN IF NOT EXISTS birth_date     DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nickname       TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS birth_year     INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gender         TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS personal_notes TEXT    DEFAULT NULL;

ALTER TABLE crm.accounts
  ADD COLUMN IF NOT EXISTS founded_date          DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fiscal_year_end_month INTEGER DEFAULT NULL
                           CHECK (fiscal_year_end_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS customer_since        DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS employee_count        TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS annual_revenue_range  TEXT    DEFAULT NULL;

CREATE OR REPLACE VIEW crm.upcoming_events AS
SELECT
  'contact_birthday'::TEXT    AS event_type,
  c.id                        AS source_id,
  c.name                      AS label,
  c.account_id,
  c.birth_date                AS event_date_raw,
  CASE
    WHEN TO_DATE(
           EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
           LPAD(EXTRACT(MONTH FROM c.birth_date)::TEXT, 2, '0') || '-' ||
           LPAD(EXTRACT(DAY   FROM c.birth_date)::TEXT, 2, '0'),
           'YYYY-MM-DD'
         ) >= CURRENT_DATE
    THEN TO_DATE(
           EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
           LPAD(EXTRACT(MONTH FROM c.birth_date)::TEXT, 2, '0') || '-' ||
           LPAD(EXTRACT(DAY   FROM c.birth_date)::TEXT, 2, '0'),
           'YYYY-MM-DD'
         )
    ELSE TO_DATE(
           (EXTRACT(YEAR FROM CURRENT_DATE) + 1)::TEXT || '-' ||
           LPAD(EXTRACT(MONTH FROM c.birth_date)::TEXT, 2, '0') || '-' ||
           LPAD(EXTRACT(DAY   FROM c.birth_date)::TEXT, 2, '0'),
           'YYYY-MM-DD'
         )
  END                         AS next_occurrence,
  c.position                  AS detail,
  NULL::TEXT                  AS account_name
FROM crm.contacts c
WHERE c.birth_date IS NOT NULL

UNION ALL

SELECT
  'company_anniversary'::TEXT AS event_type,
  a.id                        AS source_id,
  a.name                      AS label,
  a.id                        AS account_id,
  a.founded_date              AS event_date_raw,
  CASE
    WHEN TO_DATE(
           EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
           LPAD(EXTRACT(MONTH FROM a.founded_date)::TEXT, 2, '0') || '-' ||
           LPAD(EXTRACT(DAY   FROM a.founded_date)::TEXT, 2, '0'),
           'YYYY-MM-DD'
         ) >= CURRENT_DATE
    THEN TO_DATE(
           EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
           LPAD(EXTRACT(MONTH FROM a.founded_date)::TEXT, 2, '0') || '-' ||
           LPAD(EXTRACT(DAY   FROM a.founded_date)::TEXT, 2, '0'),
           'YYYY-MM-DD'
         )
    ELSE TO_DATE(
           (EXTRACT(YEAR FROM CURRENT_DATE) + 1)::TEXT || '-' ||
           LPAD(EXTRACT(MONTH FROM a.founded_date)::TEXT, 2, '0') || '-' ||
           LPAD(EXTRACT(DAY   FROM a.founded_date)::TEXT, 2, '0'),
           'YYYY-MM-DD'
         )
  END                         AS next_occurrence,
  EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || ' — ปีที่ ' ||
    (EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM a.founded_date))::TEXT AS detail,
  a.name                      AS account_name
FROM crm.accounts a
WHERE a.founded_date IS NOT NULL

UNION ALL

SELECT
  'customer_anniversary'::TEXT AS event_type,
  a.id                         AS source_id,
  a.name                       AS label,
  a.id                         AS account_id,
  a.customer_since             AS event_date_raw,
  CASE
    WHEN TO_DATE(
           EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
           LPAD(EXTRACT(MONTH FROM a.customer_since)::TEXT, 2, '0') || '-' ||
           LPAD(EXTRACT(DAY   FROM a.customer_since)::TEXT, 2, '0'),
           'YYYY-MM-DD'
         ) >= CURRENT_DATE
    THEN TO_DATE(
           EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
           LPAD(EXTRACT(MONTH FROM a.customer_since)::TEXT, 2, '0') || '-' ||
           LPAD(EXTRACT(DAY   FROM a.customer_since)::TEXT, 2, '0'),
           'YYYY-MM-DD'
         )
    ELSE TO_DATE(
           (EXTRACT(YEAR FROM CURRENT_DATE) + 1)::TEXT || '-' ||
           LPAD(EXTRACT(MONTH FROM a.customer_since)::TEXT, 2, '0') || '-' ||
           LPAD(EXTRACT(DAY   FROM a.customer_since)::TEXT, 2, '0'),
           'YYYY-MM-DD'
         )
  END                          AS next_occurrence,
  'เป็นลูกค้ามา ' || (EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM a.customer_since))::TEXT || ' ปี' AS detail,
  a.name                       AS account_name
FROM crm.accounts a
WHERE a.customer_since IS NOT NULL;

GRANT SELECT ON crm.upcoming_events TO authenticated;
GRANT SELECT ON crm.upcoming_events TO service_role;