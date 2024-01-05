<script>
    import Fab, { Label } from "@smui/fab";
    import Slider from "@smui/slider";
    import { Button, Card, Heading } from "flowbite-svelte";

    

     /**
     * @type {{ networkUseFeeCentPerKWh: number; regionalEEGNetworkDeductionFactor: number; selfUseRatio: number; eegSellsCentPerKilowatt: number; competitors: any; }}
     */
      export let data;

    let totalConsumptionKWhPerYear = 4000;

    //  einsparung_pro_haushalt = haushaltsbedarf * eigenverbrauchquote * centersparnis
    //  einsparung_pro_haushalt / 100

    let savingsEuroPerYear = 0;

    let providerWorkPriceCentPerKWh = 20;

    let basePriceEuroPerYear = 40;

    $: {

        let providerWorkPriceCentPerKWhWithoutNetwork = (providerWorkPriceCentPerKWh - data.networkUseFeeCentPerKWh);


        let energyPriceCentPerYear = totalConsumptionKWhPerYear * providerWorkPriceCentPerKWhWithoutNetwork;
        //console.log(`energyPriceCentPerYear: ${energyPriceCentPerYear}`);
        
        // 5,12 cent / kWh
        let networkChargesCentPerYear = totalConsumptionKWhPerYear * data.networkUseFeeCentPerKWh;
        //console.log(`networkCharges: ${networkChargesCentPerYear}`);


        // -28 % auf Netzgebühr
        let networkChargesSavingsCentPerYear = networkChargesCentPerYear * data.regionalEEGNetworkDeductionFactor;
        //console.log(`networkChargesSavingsCentPerYear: ${networkChargesSavingsCentPerYear}`);


        let providerWithoutEEGEuroPerYear = basePriceEuroPerYear + (energyPriceCentPerYear + networkChargesCentPerYear) / 100.0;
        //console.log(`providerWithoutEEGEuroPerYear: ${providerWithoutEEGEuroPerYear}`);

        let eegConsumptionKwhPerYear = totalConsumptionKWhPerYear * data.selfUseRatio;
        //console.log(`eegConsumptionKwhPerYear: ${eegConsumptionKwhPerYear}`);


        let providerWithEEGEuroPerYear = basePriceEuroPerYear + 
            ((totalConsumptionKWhPerYear - eegConsumptionKwhPerYear) * providerWorkPriceCentPerKWh) / 100.0
             - networkChargesSavingsCentPerYear / 100.0;
        //console.log(`providerWithEEGEuroPerYear: ${providerWithEEGEuroPerYear}`);


        let eegCostsEuroPerYear = 20.0 + (eegConsumptionKwhPerYear * data.eegSellsCentPerKilowatt) / 100.0;
        //console.log(`eegCostsEuroPerYear: ${eegCostsEuroPerYear}`);


        savingsEuroPerYear = providerWithoutEEGEuroPerYear - (providerWithEEGEuroPerYear + eegCostsEuroPerYear);
        //console.log(`savingsEuroPerYear: ${savingsEuroPerYear}`);
    }




</script>


<div class="text-center">
    <Heading tag="h1" class="text-primary-700">11 cent FIX</Heading>
</div>

<div class="flex justify-center">
    <Card class="m-2 text-center max-w-3xl" size="xl">
        Sparen Sie mit ISCHL STROM jedes Jahr bis zu

        <Heading tag="h2" class="text-primary-700 mt-8">
            {Math.round(savingsEuroPerYear)} EURO
        </Heading>

        <div class="mt-9">Ihr Aktueller Anbieter:</div>
        <div class="flex justify-center mb-6">
            {#each data.competitors as competitor}
                <Button
                    color="yellow"
                    class="m-1 text-xs"
                    on:click={() => {
                        providerWorkPriceCentPerKWh =
                            competitor.workPriceCentPerKWh;

                        basePriceEuroPerYear = competitor.base_price_per_year;

                    }}>{competitor.provider}: {competitor.name}</Button
                >
            {/each}
        </div>

        Bei einem Arbeitspreis von {providerWorkPriceCentPerKWh.toFixed(2)} cent/kWh

        <Slider
            bind:value={providerWorkPriceCentPerKWh}
            min={11}
            max={30}
            step={0.1}
        />

        einer Grundgebühr von {basePriceEuroPerYear.toFixed(2)} EURO pro Jahr <br />
<!--
        <Slider
            bind:value={basePriceEuroPerYear}
            min={0}
            max={100}
            step={1}
        />
-->
        und einem Jahresverbrauch von {totalConsumptionKWhPerYear} kWh
        <Slider
            bind:value={totalConsumptionKWhPerYear}
            min={2000}
            max={10000}
            step={500}
        />
        


        <div class="flex place-content-center mt-6">
            <Fab extended href="/mitmachen" color="primary">
                <Label>Jetzt Mitmachen</Label>
            </Fab>
        </div>
        

    </Card>
</div>
