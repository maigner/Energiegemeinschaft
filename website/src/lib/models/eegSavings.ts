//interface 

interface NetworkPriceDetails {
    //Verbrauchspreis
    consumptionPriceCentPerKwh: number;
    networkLossPriceCentPerKwh: number;
    basePriceEuroPerYear: number;
    measurementServiceFeeEuroPerYear: number;
}

interface PowerPriceDetails {
    // Arbeitspreis
    workPriceCentPerKwh: number;
    basePriceEuroPerYear: number;
}

interface ProviderPriceDetails {
    // Netzkosten
    network: NetworkPriceDetails,

    // Energiekosten
    power: PowerPriceDetails
}

export class EegSavings {
    taxFactor = 1.2;

    powerConsumptionPerYear: number;
    selfUseRatio: number;
    providerPriceDetails: ProviderPriceDetails;
    priceLimit: boolean;

    constructor(
        powerConsumptionPerYear: number,
        selfUseRatio: number,
        providerPriceDetails: ProviderPriceDetails,
        priceLimit: boolean

    ) {
        this.powerConsumptionPerYear = powerConsumptionPerYear;
        this.selfUseRatio = selfUseRatio;
        this.providerPriceDetails = providerPriceDetails;
        this.priceLimit = priceLimit;
    }


    update(
        powerConsumptionPerYear: number,
        selfUseRatio: number,
        providerPriceDetails: ProviderPriceDetails,
        priceLimit: boolean

    ): void {
        this.powerConsumptionPerYear = powerConsumptionPerYear;
        this.selfUseRatio = selfUseRatio;
        this.providerPriceDetails = providerPriceDetails;
        this.priceLimit = priceLimit;
    }


    selfUsageKwhPerYear(): number {
        return this.powerConsumptionPerYear * this.selfUseRatio;
    }

    networkUsageKwhPerYear(): number {
        return this.powerConsumptionPerYear - this.selfUsageKwhPerYear();
    }


    /**
     * 
     * @returns 
     */
    costOfPowerProviderNetEuroPerYear(): number {
        const fixedCosts = this.providerPriceDetails.power.basePriceEuroPerYear;
        let variableCosts = 0.0;

        if (this.priceLimit) {
            // Strompreisbremse
            // subtract 30cent from workprice
            // down to at most 10Cent
            let reducedPowerPrice = Math.max(
                10.0,
                this.providerPriceDetails.power.workPriceCentPerKwh - 30.0
            );

            // everything above 2900kWh pa is not covered
            if (this.networkUsageKwhPerYear() > 2900) {
                let deductableKwhPerYear = 2900;
                let nonDeductableKwhPerYear = this.networkUsageKwhPerYear() - 2900; // rest

                // reduced amount below 2900
                variableCosts =
                    reducedPowerPrice * deductableKwhPerYear;

                // and full price for the rest above 2900
                variableCosts +=
                    this.providerPriceDetails.power.workPriceCentPerKwh * nonDeductableKwhPerYear;

            } else {
                // < 2900 zieht die Bremse voll auf gesamten Verbrauch (<2900)
                variableCosts = reducedPowerPrice * this.networkUsageKwhPerYear()
            }

        } else {
            // keine Strompreisbremse
            variableCosts = this.providerPriceDetails.power.workPriceCentPerKwh * this.networkUsageKwhPerYear()
        }

        return fixedCosts + (variableCosts / 100.0); //return EURO
    }


    costOfNetworkProviderNetEuroPerYear(): number {
        const fixedCosts = this.providerPriceDetails.network.basePriceEuroPerYear;
        let nonDeductableVariableCosts =
            (
                this.providerPriceDetails.network.consumptionPriceCentPerKwh +
                this.providerPriceDetails.network.networkLossPriceCentPerKwh
            )
            *
            this.networkUsageKwhPerYear();

        // if we have selfUsageKwhPerYear > 0 => we have EEG => deduct 28% for regional EEG
        // TODO: local EEG -50%
        const deductionFactor = 1.0 - 0.28;
        let deductableVariableCosts =
            (
                this.providerPriceDetails.network.consumptionPriceCentPerKwh +
                this.providerPriceDetails.network.networkLossPriceCentPerKwh
            )
            *
            deductionFactor
            *
            this.selfUsageKwhPerYear();

        return fixedCosts + (nonDeductableVariableCosts + deductableVariableCosts) / 100.0; //EURO
    }


    costOfPowerCommunityNetEuroPerYear(): number {
        const stromkosten =
            (this.selfUsageKwhPerYear() * 11.0) / 100.0; // EURO
        const mitgliedsbeitrag = 20.0;
        return stromkosten + mitgliedsbeitrag;
    }


    costWithOutCommunityGrossEuroPerYear(): number {
        //NO EEG
        // simulate self use of 0.0
        // backup
        const actualSelfUseRatio = this.selfUseRatio;
        // reset
        this.selfUseRatio = 0.0

        const total =
            (
                this.costOfPowerProviderNetEuroPerYear()
            +
                this.costOfNetworkProviderNetEuroPerYear()
            )
            * this.taxFactor
        ;

        // restore
        this.selfUseRatio = actualSelfUseRatio;

        return total;
    }


    costWithCommunityGrossEuroPerYear(): number {

        const total =
            (
                this.costOfPowerProviderNetEuroPerYear()
            +
                this.costOfNetworkProviderNetEuroPerYear()
            )
            * this.taxFactor // taxes only for network and provider
            + this.costOfPowerCommunityNetEuroPerYear() // net costs for EEG
        ;

        return total;
    }


    savingsGrossEuroPerYear(): number {
        return this.costWithOutCommunityGrossEuroPerYear()
            - this.costWithCommunityGrossEuroPerYear();
    }


} // Class



