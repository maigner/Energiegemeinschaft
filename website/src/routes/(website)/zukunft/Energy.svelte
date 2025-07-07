<script>
    import { onMount } from "svelte";
    import DayOfEnergy from "./DayOfEnergy.svelte";
    import { JsonView } from "@zerodevx/svelte-json-view";

    let { communityMembers } = $props();

    const today = new Date("2025-06-16");


    //fetch energy data
    async function load(day, memberId) {
		const res = await fetch(`/api/user/data/byDay?date=${encodeURIComponent(day)}&memberId=${memberId}`);
		const data = await res.json();

		if (!res.ok) {
			// = data.error;
            return null;
		} else {
            data.forEach((obj) => {
                obj.date = new Date(obj.timestamp);
            })
			return data;
		}
	}


    const member = communityMembers[0]; //TODO: select

    let energyData = $state([]);

    onMount(async() => {
        energyData = await load(today, member.id);
    });
    
</script>


<DayOfEnergy date={today} member={member} />

{#if energyData.length > 0}

    { energyData[0].date}

{/if}

