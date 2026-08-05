#!/bin/bash
# Anonymisiert die Dev-DB nach dem naechtlichen Refresh (refresh-dev-db.sh).
# Die Dev-Umgebung braucht realistische Datenmengen, aber keine echten
# personenbezogenen Daten (Art. 32 DSGVO, Datenminimierung). Erhalten bleiben
# nur Vorstandsmitglieder (fuer Dev-Logins in Board-/Finance-Bereiche) sowie
# @ischlstrom.org-Konten; alle anderen Mitglieder, IBANs und Buchungspartner
# werden pseudonymisiert. Koordinaten werden auf ca. 1 km gerundet, damit die
# Mitgliederkarte in Dev weiter Marker zeigt.
set -euo pipefail

export PGPASSFILE="${PGPASSFILE:-$HOME/.pgpass}"

MIDDLEWARE_CONN="host=server user=ischlstrom_middleware dbname=ischlstrom_middleware sslmode=require"
AUTHJS_CONN="host=server user=ischlstrom_authjs_website dbname=ischlstrom_authjs_website sslmode=require"

echo "[anonymize-dev-db] middleware..."
psql "$MIDDLEWARE_CONN" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

-- Mitglieder (Vorstand bleibt fuer Dev-Logins erhalten)
UPDATE members_member SET
    email      = 'member' || id || '@example.org',
    name       = 'Mitglied ' || id,
    first_name = 'Mitglied',
    last_name  = id::text,
    street     = 'Teststraße',
    hnr        = '1',
    latitude   = round(latitude::numeric, 2),
    longitude  = round(longitude::numeric, 2)
WHERE board_member = false;

-- Bewerbungen
UPDATE members_membershipapplication SET
    email        = 'applicant' || id || '@example.org',
    first_name   = CASE WHEN first_name <> '' THEN 'Bewerber' ELSE '' END,
    last_name    = CASE WHEN last_name <> '' THEN id::text ELSE '' END,
    company_name = CASE WHEN company_name <> '' THEN 'Firma ' || id ELSE '' END,
    street       = 'Teststraße',
    hnr          = '1',
    iban         = 'AT000000000000000000',
    account_name = 'Bewerber ' || id;

-- Vorstandsabstimmungen / Aufnahme-Tasks / Event-Anmeldungen
UPDATE members_boardapproval SET
    new_member_email    = 'candidate' || id || '@example.org',
    new_member_approved = 'Kandidat ' || id;
UPDATE members_memberapprovaltask SET
    email   = 'task' || id || '@example.org',
    name    = 'Kandidat ' || id,
    address = 'Teststraße 1';
UPDATE members_eventregistration SET
    email = 'event' || id || '@example.org';

-- Buchhaltung: Bankdaten und Partnernamen maskieren, Betraege/Daten bleiben
UPDATE accounting_booking SET
    iban                   = CASE WHEN iban IS NOT NULL AND iban <> '' THEN 'AT000000000000000000' ELSE iban END,
    partner_iban           = CASE WHEN partner_iban IS NOT NULL AND partner_iban <> '' THEN 'AT000000000000000000' ELSE partner_iban END,
    partner_name           = CASE WHEN partner_name IS NOT NULL AND partner_name <> '' THEN 'Partner ' || id ELSE partner_name END,
    account_name           = CASE WHEN account_name IS NOT NULL AND account_name <> '' THEN 'Konto ' || id ELSE account_name END,
    partner_account_number = CASE WHEN partner_account_number IS NOT NULL AND partner_account_number <> '' THEN '00000000' ELSE partner_account_number END,
    virtual_card_number    = CASE WHEN virtual_card_number IS NOT NULL AND virtual_card_number <> '' THEN '0000' ELSE virtual_card_number END,
    mandate_id             = CASE WHEN mandate_id IS NOT NULL AND mandate_id <> '' THEN 'MANDATE-' || id ELSE mandate_id END,
    booking_details        = CASE WHEN booking_details IS NOT NULL AND booking_details <> '' THEN 'Buchung ' || id ELSE booking_details END,
    booking_reference      = CASE WHEN booking_reference IS NOT NULL AND booking_reference <> '' THEN 'REF-' || id ELSE booking_reference END,
    payment_reference      = CASE WHEN payment_reference IS NOT NULL AND payment_reference <> '' THEN 'REF-' || id ELSE payment_reference END,
    note                   = CASE WHEN note IS NOT NULL AND note <> '' THEN 'Notiz ' || id ELSE note END;

COMMIT;
SQL

echo "[anonymize-dev-db] authjs..."
psql "$AUTHJS_CONN" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

-- Sitzungen und Login-Tokens aus Produktion haben in Dev nichts verloren
DELETE FROM sessions;
DELETE FROM verification_token;

-- Nutzerkonten pseudonymisieren, Vereins-Konten fuer Dev-Logins behalten
UPDATE users SET
    email = 'user' || id || '@example.org',
    name  = CASE WHEN name IS NOT NULL THEN 'User ' || id ELSE name END
WHERE email NOT LIKE '%@ischlstrom.org'
  AND email <> 'martin@maigner.net';

COMMIT;
SQL

echo "[anonymize-dev-db] $(date -Is) fertig."
