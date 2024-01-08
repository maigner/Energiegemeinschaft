
import { getUser } from '$lib/db/user';

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {


    const competitors = [
        {
            id: 0,
            provider: "Energie AG",
            name: "Ökostrom Klassik",
            source: "https://www.energieag.at/privat/strom",
            date: "1. Jänner 2024",
            price: {
                network: {
                    cent_pro_kwh: {
                        verbrauchspreis: 5.12,
                        netzverlustentgeld: 0.59
                    },
                    euro_pro_jahr: {
                        grundpreis: 36.0,
                        entgelt_messleistungen: 26.16
                    }
                },
                power: {
                    cent_pro_kwh: {
                        arbeitspreis: 21.78
                    },
                    euro_pro_jahr: {
                        grundpreis: 39.0
                    }
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
                network: {
                    cent_pro_kwh: {
                        verbrauchspreis: 5.12,
                        netzverlustentgeld: 0.59
                    },
                    euro_pro_jahr: {
                        grundpreis: 36.0,
                        entgelt_messleistungen: 26.16
                    }
                },
                power: {
                    cent_pro_kwh: {
                        arbeitspreis: 23.90
                    },
                    euro_pro_jahr: {
                        grundpreis: 28.93
                    }
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
                network: {
                    cent_pro_kwh: {
                        verbrauchspreis: 5.12,
                        netzverlustentgeld: 0.59
                    },
                    euro_pro_jahr: {
                        grundpreis: 36.0,
                        entgelt_messleistungen: 26.16
                    }
                },
                power: {
                    cent_pro_kwh: {
                        arbeitspreis: 20.00
                    },
                    euro_pro_jahr: {
                        grundpreis: 50.0
                    }
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
                network: {
                    cent_pro_kwh: {
                        verbrauchspreis: 5.12,
                        netzverlustentgeld: 0.59
                    },
                    euro_pro_jahr: {
                        grundpreis: 36.0,
                        entgelt_messleistungen: 26.16
                    }
                },
                power: {
                    cent_pro_kwh: {
                        arbeitspreis: 50.00
                    },
                    euro_pro_jahr: {
                        grundpreis: 100.0
                    }
                }
            }
        },
    ]





    return {
        selfUseRatio: 0.3,
        eegSellsCentPerKilowatt: 11.0,
        eegBuysCentPerKilowatt: 11.0,
        competitors: competitors
    }

}