<script>
  import SimpleMenu from "$lib/SimpleMenu.svelte";
  import EnergyreportOverview from "./energyreport/EnergyreportOverview.svelte";
  import MasterdataOverview from "./MasterdataOverview.svelte";
</script>

<SimpleMenu
  items={[
    {
      href: "/energyreport/overview",
      display: "Energy Reports in Downloads",
    },
  ]}
/>

<div>
  <MasterdataOverview />
</div>
<div class="mt-8">
  <EnergyreportOverview />
</div>
