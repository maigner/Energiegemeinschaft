import { middlewareDbConnection } from "$lib/server/db/db";

/**
 * Alle Bewerbungen, neueste zuerst. Fuer die Vorstandsseite
 * /board/members/applications (Review + Excel-Export).
 */
export const getMembershipApplications = async () => {
    const sql = await middlewareDbConnection();
    try {
        const result = await sql.query(`
            SELECT
                id,
                created_at AS "createdAt",
                TO_CHAR(created_at AT TIME ZONE 'Europe/Vienna', 'DD.MM.YYYY HH24:MI') AS "createdAtLabel",
                email,
                applicant_type AS "applicantType",
                first_name AS "firstName",
                last_name AS "lastName",
                company_name AS "companyName",
                street,
                hnr,
                zip,
                city,
                iban,
                account_name AS "accountName",
                measurement_points AS "measurementPoints",
                accepted_terms AS "acceptedTerms",
                accepted_sepa AS "acceptedSepa",
                acknowledged_privacy_notice AS "acknowledgedPrivacyNotice"
            FROM members_membershipapplication
            ORDER BY created_at DESC
        `);
        return result?.rows;
    } finally {
        sql.release();
    }
};

/**
 * Speichert eine Mitgliedschafts-Bewerbung aus dem Onboarding-Formular.
 * Die Zeile ist zugleich der Nachweis der abgegebenen Erklaerungen
 * (Statuten, SEPA, Kenntnisnahme der Datenschutzerklaerung) samt Zeitpunkt
 * (Art. 7 Abs. 1 DSGVO). Schema: middleware/eeg/members/models.py
 * (MembershipApplication).
 */
export const saveMembershipApplication = async ({
    email,
    applicantType,
    firstName,
    lastName,
    companyName,
    street,
    hnr,
    zip,
    city,
    iban,
    accountName,
    measurementPoints,
    acceptedTerms,
    acceptedSepa,
    acknowledgedPrivacyNotice,
}) => {
    const sql = await middlewareDbConnection();
    try {
        const result = await sql.query(`
            INSERT INTO members_membershipapplication (
                created_at, email, applicant_type,
                first_name, last_name, company_name,
                street, hnr, zip, city,
                iban, account_name, measurement_points,
                accepted_terms, accepted_sepa, acknowledged_privacy_notice
            ) VALUES (
                NOW(), $1, $2,
                $3, $4, $5,
                $6, $7, $8, $9,
                $10, $11, $12,
                $13, $14, $15
            )
            RETURNING id, created_at
        `, [
            email,
            applicantType,
            firstName ?? "",
            lastName ?? "",
            companyName ?? "",
            street,
            hnr,
            zip,
            city,
            iban,
            accountName,
            JSON.stringify(measurementPoints ?? []),
            acceptedTerms === true,
            acceptedSepa === true,
            acknowledgedPrivacyNotice === true,
        ]);
        return result?.rows[0];
    } finally {
        sql.release();
    }
};
