<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
import { format } from "date-fns";

    import { Heading } from "flowbite-svelte";
    import { Chart } from 'flowbite-svelte';

    export let data;

    let labels = [];
    let dataset = [];

    // filter((_, index) => index % n === n - 1).

    // filter every nth element to smoothen chart
    data.numberOfMembersStats.forEach((element) => {
        //console.log(element.month);
        labels.push(format(element.month, "yyyy-MM-dd"));
        dataset.push(parseInt(element.num_members));
    });

    // every nth and the last
    const n = 15;

    labels = [
        ...(labels.filter((_, index) => index % n === n - 1)),
        ...(labels.slice(-1))
    ];
    
    dataset = [
        ...(dataset.filter((_, index) => index % n === n - 1)),
        ...(dataset.slice(-1))
    ];


    // make sure to add the latest point. no worries about duplicates




    let memberCountGraphOptions = {
        chart: {
            height: "400px",
            maxWidth: "100%",
            type: "area",
            fontFamily: "Inter, sans-serif",
            dropShadow: {
                enabled: false,
            },
            toolbar: {
                show: false,
            },
        },
        tooltip: {
            enabled: true,
            x: {
                show: false,
            },
        },
        fill: {
            type: "gradient",
            gradient: {
                opacityFrom: 0.55,
                opacityTo: 0,
                shade: "#1C64F2",
                gradientToColors: ["#1C64F2"],
            },
        },
        dataLabels: {
            enabled: false,
        },
        stroke: {
            width: 6,
        },
        grid: {
            show: false,
            strokeDashArray: 4,
            padding: {
                left: 2,
                right: 2,
                top: 0,
            },
        },
        series: [
            {
                name: "Anzahl Mitglieder",
                data: dataset,
                color: "#1A56DB",
            },
        ],
        xaxis: {
            categories: labels,
            labels: {
                show: true,
            },
            axisBorder: {
                show: false,
            },
            axisTicks: {
                show: false,
            },
        },
        yaxis: {
            show: true,
        },
        
    };
</script>


<div class="w-full">
    <Heading class="text-primary-700 text-center" tag="h6"
        >Vereinsstärke: {dataset[dataset.length - 1]}</Heading
    >

    <Chart bind:options={memberCountGraphOptions} />

    <span class="text-xs">Stand: {labels[labels.length - 1]}</span>
</div>
