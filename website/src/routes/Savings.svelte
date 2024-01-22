<script>
    import Fab, { Label } from "@smui/fab";
    import Slider from "@smui/slider";
    import { Card, Heading, Radio } from "flowbite-svelte";

    import { EegSavings } from "$lib/models/eegSavings";


     /**
     * @type {{ competitors: { id: number; provider: string; name: string; price: any; }[]; selfUseRatio: any; }}
     */
      export let data;


    // first one by default
    let providerIndex = 0;
    let price = data.competitors[providerIndex].price;
    let selfUseRatio = data.selfUseRatio;
    let totalConsumptionKWhPerYear = 3500;
    let radioGroupStrompreisbremse = 1;

    let savingsModel = new EegSavings(
        totalConsumptionKWhPerYear,
        selfUseRatio,
        price,
        radioGroupStrompreisbremse === 1 ? true : false
    );

    let savingsEuroPerYear = savingsModel.savingsGrossEuroPerYear();


    $: {
        price = data.competitors[providerIndex].price;

        savingsModel.update(
            totalConsumptionKWhPerYear,
            selfUseRatio,
            price,
            radioGroupStrompreisbremse === 1 ? true : false
        )

        savingsEuroPerYear = savingsModel.savingsGrossEuroPerYear();
    }


</script>


<div class="text-center">
    <Heading tag="h1" class="text-primary-800 mt-8">11 cent FIX</Heading>
</div>

<div class="flex justify-center">
    <Card class="m-2 text-center max-w-3xl text-gray-900 " size="xl">
        Sparen Sie mit ISCHL STROM jedes Jahr bis zu*

        <Heading tag="h2" class="text-primary-800 mt-8">
            {Math.round(savingsEuroPerYear)} EURO
        </Heading>


        <p class="mb-4 font-semibold mt-8">Ihr aktueller Stromanbieter</p>
        <ul
            class="mb-6 items-center w-full rounded-lg border border-gray-200 sm:flex dark:bg-gray-800 dark:border-gray-600 divide-x rtl:divide-x-reverse divide-gray-200 dark:divide-gray-600"
        >
            {#each data.competitors as competitor (competitor.id)}
                <li class="w-full">
                    <Radio
                        bind:group={providerIndex}
                        value={competitor.id}
                        class="p-3"
                        >{competitor.provider}: {competitor.name}</Radio
                    >
                </li>
            {/each}
        </ul>

        <ul
            class="mb-6 items-center w-full rounded-lg border border-gray-200 sm:flex dark:bg-gray-800 dark:border-gray-600 divide-x rtl:divide-x-reverse divide-gray-200 dark:divide-gray-600"
        >
            <li class="w-full">
                <Radio
                    bind:group={radioGroupStrompreisbremse}
                    value={1}
                    class="p-3">MIT Strompreisbremse</Radio
                >
            </li>
            <li class="w-full">
                <Radio
                    bind:group={radioGroupStrompreisbremse}
                    value={0}
                    class="p-3">OHNE Strompreisbremse</Radio
                >
            </li>
        </ul>

        Bei einem Jahresverbrauch von {totalConsumptionKWhPerYear} kWh
        <Slider
            bind:value={totalConsumptionKWhPerYear}
            min={1000}
            max={6000}
            step={100}
        />

        und einem EEG-Anteil von {(selfUseRatio * 100).toFixed(0)}%
        <Slider bind:value={selfUseRatio} min={0.1} max={0.5} step={0.01} />

        <div class="flex place-content-center mt-6">
            <Fab extended href="/mitmachen" color="primary">
                <Label>Jetzt Mitmachen</Label>
            </Fab>
        </div>


        <div class="text-xs mt-6">
            * Dieser Wert ist eine Schätzung unter der Annahme eines ausgegleichenen 
            Verhältnisses zwischen Erzeugung und Verbrauch innerhalb von ISCHL STROM.
        </div>
    </Card>

</div>
