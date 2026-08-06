import { getMembershipApplicationsByEmail } from '$lib/server/db/members/applications';

/** @type {import('./$types').PageServerLoad} */
export async function load({ parent, locals }) {

    // member info
    let { session } = await parent();

    // bereits eingegangene Bewerbungen dieser Adresse (Wiedervorlage statt leerem Formular)
    const existingApplications = await getMembershipApplicationsByEmail(session?.user?.email ?? "") ?? [];

    // data that is already present
    // single email may control multiple members!
    return {
        existingApplications,
        applicationData: {
            person:
            {
                firstName: "",
                lastName: "",
                address: {
                    street: "",
                    number: "",
                    zipCode: "",
                    city: "Bad Ischl"
                },
                iban: "",
                accountName: "",
                checkBoxes: {
                    terms: false,
                    sepa: false,
                    privacyNotice: false
                },
                measurementPoints: [
                    {
                        identifier: "AT003000",
                        type: "CONSUMPTION"
                    }
                ]
            },
            company: {
                companyName: "",
                address: {
                    street: "",
                    number: "",
                    zipCode: "",
                    city: "Bad Ischl"
                },
                iban: "",
                accountName: "",
                checkBoxes: {
                    terms: false,
                    sepa: false,
                    privacyNotice: false
                },
                measurementPoints: [
                    {
                        identifier: "AT003000",
                        type: "CONSUMPTION"
                    }
                ]
            }

        }
    }
    


}
