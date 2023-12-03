<script>
    import Slider from "@smui/slider";
    import { Card, Heading } from "flowbite-svelte";

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
    <Heading tag="h2">Kundin werden</Heading>
</div>


<div class="">
    <Card class="m-2" size="xl">
        Bei einem Marktpreis von {current_price_cent_per_kilowatt} cent/kWh

        <Slider
            bind:value={current_price_cent_per_kilowatt}
            min={10}
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
        können Sie als Kundin von ISCHLstrom im Jahr bis zu {Math.round(
            savings_euro_per_year,
        )} EUR sparen.
    </Card>
</div>
