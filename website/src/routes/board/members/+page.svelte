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

    import { Bar } from 'svelte-chartjs';


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
    <Line data={ {labels: labels, datasets: datasets}} options={{ responsive: true }} />    
</div>

