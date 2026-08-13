<script>
    import MemberCountChart from "./MemberCountChart.svelte";
    import Membertable from "./Membertable.svelte";

    let { data } = $props();
</script>

<svelte:head>
    <title>ISCHLSTROM - Mitglieder</title>
</svelte:head>

<div class="px-4 mt-4 max-w-4xl mx-auto flex flex-col gap-8">
    <MemberCountChart stats={data.numberOfMembersStats} />
    <Membertable members={data.members} />
</div>
