<script>
    import { format } from "date-fns";
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

    import { Bar } from "svelte-chartjs";
    import { Heading } from "flowbite-svelte";

    export let data;

    let labels = [];
    let datasets = [
        {
            label: "Anzahl der Mitglieder",
            data: [],
        },
    ];

    data.numberOfMembersStats.forEach((element) => {
        //console.log(element.month);
        labels.push(format(element.month, "yyyy-MM-dd"));
        datasets[0].data.push(parseInt(element.num_members));
    });
</script>

<div class="w-full">
    <Heading class="text-primary-700 text-center" tag="h6"
        >Vereinsstärke: {datasets[0].data[datasets[0].data.length - 1]}</Heading
    >

    <Line
        data={{ labels: labels, datasets: datasets }}
        options={{ responsive: true }}
    />

    <span class="text-xs">Stand: {labels[labels.length - 1]}</span>
</div>
