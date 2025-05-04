<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
import MemberCountChart from "./MemberCountChart.svelte";
    import Membertable from "./Membertable.svelte";

    export let data;

    
</script>


<div class="flex place-content-center mt-8">
    <Membertable bind:data />
</div>


<div class="flex place-content-center mt-8">
    <MemberCountChart bind:data />
</div>


