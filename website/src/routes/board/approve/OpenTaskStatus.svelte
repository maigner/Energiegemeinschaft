<script>
    import { Badge } from "flowbite-svelte";

    export let taskStatus;


    const getBadgeColour = (numYes, numNo) => {
        if (numYes == 7) return "green";
        if (numNo > 0) return "red";
        return "dark";
    };

</script>


{#each Object.keys(taskStatus) as name}
    <Badge class="m-1" color={getBadgeColour(taskStatus[name].Ja, taskStatus[name].Nein)}>
        Aktuelle Bewerbung<br />
        {name}<br />
        Dafür: {taskStatus[name].Ja} Dagegen: {taskStatus[name].Nein}
    </Badge>
{/each}
