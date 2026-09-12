// Rechenmodell fuer den Spar-Rechner (derzeit nicht eingebunden).
import { CURRENT } from "$lib/tariffs";

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

interface GovFees  {
    electricityFeeCentPerKwh: number,
}

interface ProviderPriceDetails {
    // Netzkosten
    network: NetworkPriceDetails,

    // Energiekosten
    power: PowerPriceDetails,

    // Fees and Taxes (no VAT)
    govFees: GovFees,
}

export class EegSavings {
    taxFactor: number = 1.2;

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


    log(str: string): void {
        //console.log(str);
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

        this.log("Update");
    }


    selfUsageKwhPerYear(): number {
        return this.powerConsumptionPerYear * this.selfUseRatio;
    }

    networkUsageKwhPerYear(): number {
        return this.powerConsumptionPerYear - this.selfUsageKwhPerYear();
    }



    costOfPowerProviderNetEuroPerYear(): number {
        const fixedCosts = this.providerPriceDetails.power.basePriceEuroPerYear;
        
        let variableCosts = 
            this.providerPriceDetails.power.workPriceCentPerKwh * this.networkUsageKwhPerYear()
            +
            this.providerPriceDetails.govFees.electricityFeeCentPerKwh * this.networkUsageKwhPerYear()
        ;

        const result = fixedCosts + (variableCosts / 100.0); //return EURO

        this.log(`costOfPowerProviderNetEuroPerYear ${result}`);
        return result;
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

        // Rabatt der regionalen EEG; nur der Netznutzungs-Arbeitspreis wird
        // reduziert, hier vereinfacht auch auf das Netzverlustentgelt
        // angewendet. TODO: lokale EEG (CURRENT.rebate.localPct)
        const deductionFactor = 1.0 - CURRENT.rebate.regionalPct / 100;
        let deductableVariableCosts =
            (
                this.providerPriceDetails.network.consumptionPriceCentPerKwh +
                this.providerPriceDetails.network.networkLossPriceCentPerKwh
            )
            *
            deductionFactor
            *
            this.selfUsageKwhPerYear();

        
        const result = fixedCosts + (nonDeductableVariableCosts + deductableVariableCosts) / 100.0; //EURO
        this.log(`costOfNetworkProviderNetEuroPerYear ${result}`);
        return result;

    }


    costOfPowerCommunityNetEuroPerYear(): number {
        const energyCosts =
            (this.selfUsageKwhPerYear() * CURRENT.eeg.purchaseCt) / 100.0; // EURO
        const membershipFee = CURRENT.eeg.membershipFeeEur;
        const result = energyCosts + membershipFee;
        this.log(`costOfPowerCommunityNetEuroPerYear ${result}`);
        return result;
    }

    powerPriceBreakEuroPerYear(): number {

        if (this.priceLimit === false) {
            this.log(`powerPriceBreakEuroPerYear 0 ${0.0}`);
            return 0.0;
        }
        
        if (this.providerPriceDetails.power.workPriceCentPerKwh <= 10.0) {
            console.log(`powerPriceBreakEuroPerYear 2 ${0.0}`);
            return 0.0;
        }

        let difference = this.providerPriceDetails.power.workPriceCentPerKwh - 10.0;


        if (difference > 30.0) {
            difference = 30.0;
        }

        this.log(`difference ${difference}`);
        const result = difference * Math.min(2900, this.networkUsageKwhPerYear()) / 100;
        this.log(`powerPriceBreakEuroPerYear 3 ${result}`);
        return result;
    }

    costWithoutCommunityGrossEuroPerYear(): number {
        //NO EEG
        // simulate self use of 0.0
        // backup
        const actualSelfUseRatio = this.selfUseRatio;
        // reset
        this.selfUseRatio = 0.0

        const total : number =
            (
                this.costOfPowerProviderNetEuroPerYear()
            +
                this.costOfNetworkProviderNetEuroPerYear()
            )
            * this.taxFactor
            - this.powerPriceBreakEuroPerYear()
        ;


        // restore
        this.selfUseRatio = actualSelfUseRatio;

        this.log(`costWithoutCommunityGrossEuroPerYear ${total}`);
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
            - this.powerPriceBreakEuroPerYear()
        ;

        this.log(`costWithCommunityGrossEuroPerYear ${total}`);
        return total;
    }


    savingsGrossEuroPerYear(): number {
        const result = this.costWithoutCommunityGrossEuroPerYear()
            - this.costWithCommunityGrossEuroPerYear();
        this.log(`savingsGrossEuroPerYear ${result}`);
        return result;
    }


} // EegSavings



