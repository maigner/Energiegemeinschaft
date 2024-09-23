<script>
    import { formatDate } from "$lib/format";


    export let data;


</script>

<div class="text-center text-xl">
    { formatDate(data.currentStartDate)}
    bis
    { formatDate(data.currentEndDate)}
</div>
