<script>
  import SimpleMenu from "$lib/SimpleMenu.svelte";
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



<MasterdataOverview />