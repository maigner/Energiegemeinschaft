<script>
    import { formatDate } from "$lib/format";


    let { currentStartDate, currentEndDate } = $props();


</script>

<div class="text-center text-xl">
    { formatDate(currentStartDate)}
    bis
    { formatDate(currentEndDate)}
</div>
