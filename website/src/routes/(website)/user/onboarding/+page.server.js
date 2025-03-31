
/** @type {import('./$types').PageServerLoad} */
export async function load({ parent, locals }) {

    // member info
    let { session } = await parent();


    // data that is already present
    // single email may control multiple members!
    return {
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
                    dataProcessing: false,
                    newsletter: false
                },
                measurementPoints: [
                    {
                        identifier: "AT003000",
                        type: "CONSUMPTION"
                    },
                    {
                        identifier: "AT003000",
                        type: "GENERATION"
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
                    dataProcessing: false,
                    newsletter: false
                },
                measurementPoints: [
                    {
                        identifier: "AT003000",
                        type: "CONSUMPTION"
                    },
                    {
                        identifier: "AT003000",
                        type: "GENERATION"
                    }
                ]
            }

        }
    }
    


}
