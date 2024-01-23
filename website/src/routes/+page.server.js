

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {


    const networkNetzOOE = {
        consumptionPriceCentPerKwh: 5.12,
        networkLossPriceCentPerKwh: 0.59,
        basePriceEuroPerYear: 36.00,
        measurementServiceFeeEuroPerYear: 26.16,
    };

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
                }
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
                    workPriceCentPerKwh: 23.90,
                    basePriceEuroPerYear: 28.93,
                }
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
                    workPriceCentPerKwh: 20.0,
                    basePriceEuroPerYear: 50.0,
                }
            }
        },

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
                }
            }
        },
    ]




    return {
        selfUseRatio: 0.3,
        eegSellsCentPerKilowatt: 11.0,
        eegBuysCentPerKilowatt: 11.0,
        competitors: competitorsV2
    }

}