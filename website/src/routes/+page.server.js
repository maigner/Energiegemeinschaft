

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {


    // meine rechnung 
    // 7,41 cent / kWh

    const networkNetzOOE = {
        consumptionPriceCentPerKwh: 5.12,
        networkLossPriceCentPerKwh: 0.5940,
        basePriceEuroPerYear: 36.00,
        measurementServiceFeeEuroPerYear: 26.16,
    };

    const govFees = {
        electricityFeeCentPerKwh: 0.1,
    };

    // https://durchblicker.at/strom/vergleich/ergebnis/gegenueberstellung#calcid=849611d883edb1d456da97fe1e1d4222cf3bea0d
    // update 2024-04-29
    const competitorsV2 = [
        {
            id: 0,
            provider: "Energie AG",
            name: "Ökostrom Klassik",
            source: "https://www.energieag.at/privat/strom",
            date: "1. Jänner 2024",
            price: {
                network: networkNetzOOE,
                power: {
                    workPriceCentPerKwh: 21.78,
                    basePriceEuroPerYear: 39.0,
                },
                govFees: govFees
            }
        },
        {
            id: 1,
            provider: "Verbund",
            name: "Strom aus 100% Wasserkraft",
            source: "https://www.verbund.com/de-at/privatkunden/strom",
            date: "1. Jänner 2024",
            price: {
                network: networkNetzOOE,
                power: {
                    workPriceCentPerKwh: 19.90,
                    basePriceEuroPerYear: 47.88,
                },
                govFees: govFees
            }
        },

        {
            id: 2,
            provider: "GoGreenEnergy",
            name: "Stromtarif",
            source: "https://www.gogreenenergy.at",
            date: "1. Jänner 2024",
            price: {
                network: networkNetzOOE,
                power: {
                    workPriceCentPerKwh: 12.0,
                    basePriceEuroPerYear: 40.0,
                },
                govFees: govFees
            }
        },
/*
        {
            id: 3,
            provider: "Phantasie AG",
            name: "Sauteuer",
            source: "https://www.example.com",
            date: "1. Jänner 2024",
            price: {
                network: networkNetzOOE,
                power: {
                    workPriceCentPerKwh: 50.0,
                    basePriceEuroPerYear: 100.0,
                },
                govFees: govFees
            }
        },
*/
    ]




    return {
        selfUseRatio: 0.3,
        eegSellsCentPerKilowatt: 11.0,
        eegBuysCentPerKilowatt: 11.0,
        competitors: competitorsV2
    }

}