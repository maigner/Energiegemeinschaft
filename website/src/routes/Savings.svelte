<script>
    import Slider from "@smui/slider";
    import { Button, Card, Heading } from "flowbite-svelte";

    export let data;

    let total_consumption_kwh_per_year = 4000;

    //  einsparung_pro_haushalt = haushaltsbedarf * eigenverbrauchquote * centersparnis
    //  einsparung_pro_haushalt / 100

    let savings_euro_per_year = 0;

    let current_price_cent_per_kilowatt = 20;

    $: {
        savings_euro_per_year =
            (total_consumption_kwh_per_year *
                data.self_use_ratio *
                Math.abs(
                    data.buy_cent_per_kilowatt -
                        current_price_cent_per_kilowatt,
                )) /
            100.0;
    }
</script>

<div class="text-center">
    <Heading tag="h3">Kosten sparen</Heading>
</div>

<div class="flex justify-center">
    <Card class="m-2 text-center max-w-3xl" size="xl">
        <Heading tag="h1" class="text-primary-700">11 cent FIX</Heading>

        <div class="mt-9">Ihr Aktueller Anbieter:</div>
        <div class="flex justify-center">
            {#each data.competitors as competitor}
                <Button
                    color="yellow"
                    class="m-1 text-xs"
                    on:click={() => {
                        current_price_cent_per_kilowatt =
                            competitor.cent_per_kilowatt;
                    }}>{competitor.provider}: {competitor.name}</Button
                >
            {/each}
        </div>

        Bei einem Arbeitspreis von {current_price_cent_per_kilowatt.toFixed(2)} cent/kWh

        <Slider
            bind:value={current_price_cent_per_kilowatt}
            min={11}
            max={30}
            step={0.1}
        />

        und einem Jahresverbrauch von {total_consumption_kwh_per_year} kWh
        <Slider
            bind:value={total_consumption_kwh_per_year}
            min={2000}
            max={10000}
            step={500}
        />
        können Sie mit ISCHLstrom im Jahr bis zu

        <Heading tag="h4" class="text-primary-700">
            {Math.round(savings_euro_per_year)}
        </Heading>

        EUR sparen.
    </Card>
</div>
