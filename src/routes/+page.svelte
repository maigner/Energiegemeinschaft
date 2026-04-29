<script>
  import SimpleMenu from "$lib/SimpleMenu.svelte";
    import { Heading } from "flowbite-svelte";
  import EnergyreportOverview from "./energyreport/EnergyreportOverview.svelte";
  import MasterdataOverview from "./MasterdataOverview.svelte";
</script>

<!--
<SimpleMenu
  items={[
    {
      href: "/energyreport/overview",
      display: "Energy Reports in Downloads",
    },
  ]}
/>
-->

<Heading tag="h1">EEG Faktura Excel Freund</Heading>

<div>
  <MasterdataOverview />
</div>
<div class="mt-8">
  <EnergyreportOverview />
</div>
