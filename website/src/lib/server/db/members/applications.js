import { middlewareDbConnection } from "$lib/server/db/db";

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
