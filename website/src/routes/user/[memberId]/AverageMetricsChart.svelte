<script>
    import { Line } from "svelte-chartjs";
    import {
        Chart as ChartJS,
        Title,
        Tooltip,
        Legend,
        LineElement,
        LinearScale,
        PointElement,
        CategoryScale,
        BarElement,
    } from "chart.js";

    ChartJS.register(
        Title,
        Tooltip,
        Legend,
        LineElement,
        LinearScale,
        PointElement,
        CategoryScale,
        BarElement,
    );

    import { Heading } from "flowbite-svelte";
    import { formatDate } from "$lib/format";

    export let data;


    let labels = [];
    let labelMap = {};

    // labels
    data.averageMetrics.forEach((element) => {
        if (!(element.time in labelMap)) {
            labels.push(element.time);
            labelMap[element.time] = true;
        }
    });

    // metrics
    let prodTotal = data.averageMetrics
        .filter(
            (element) =>
                element.metric_name === "Gesamte gemeinschaftliche Erzeugung",
        )
        .map((element) => element.avg_value);

    let overshoot = data.averageMetrics
        .filter(
            (element) =>
                element.metric_name ===
                "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss",
        )
        .map((element) => element.avg_value);
    // difference goes into EEG
    let eegInject = prodTotal.map((value, index) => {
        return value - overshoot[index];
    });

    let datasetDefaults = {
        pointRadius: 2,
        pointHoverRadius: 30,
        pointHitRadius: 30,
    };

    let datasets = [
        {
            label: "Erzeugung",
            data: prodTotal,
            borderColor: "rgb(  70, 197, 36  )",
            ...datasetDefaults
        },
        {
            //Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss
            label: "EEG Einspeisung",
            data: eegInject,
            borderColor: "rgb(  57, 196, 205  )",
            ...datasetDefaults
        },
        {
            label: "Gesamtverbrauch",
            data: data.averageMetrics
                .filter(
                    (element) =>
                        element.metric_name ===
                        "Gesamtverbrauch lt. Messung (bei Teilnahme gem. Erzeugung)",
                )
                .map((element) => element.avg_value),
            borderColor: "rgb( 233, 64, 0 )",
            ...datasetDefaults
        },
        {
            label: "EEG Bezug",
            data: data.averageMetrics
                .filter(
                    (element) =>
                        element.metric_name ===
                        "Eigendeckung gemeinschaftliche Erzeugung",
                )
                .map((element) => element.avg_value),
            borderColor: "rgb( 233, 155, 0 )",
            ...datasetDefaults
        },
        /*
        {//Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss
            label: "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss",
            data: data.averageMetrics
                .filter((element) => element.metric_name === "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss")
                .map((element) => element.avg_value),

            borderColor: "rgb(  57, 196, 205  )",
        },
        */
    ];


    //console.log(formatDate(data.metricsTimestampRange.first_timestamp));
    //console.log(formatDate(data.metricsTimestampRange.last_timestamp));


</script>




<div class="mt-4">
    <Heading class="text-primary-700 text-center" tag="h6"
        >Durchschnittliches Tagesprofil</Heading
    >

    <div class="text-center text-primary-500 text-xs">
        {formatDate(data.metricsTimestampRange.first_timestamp)}
        bis
        {formatDate(data.metricsTimestampRange.last_timestamp)}
    </div>
    <div class="text-center text-primary-700 text-xs">
        Angaben in kiloWatt (kW)
    </div>

    {#if datasets.length > 0}
        <Line
            data={{ labels: labels, datasets: datasets }}
            options={{
                responsive: true,
                maintainAspectRatio: true,
            }}
            width={100}
            height={100}
        />
    {/if}
</div>
