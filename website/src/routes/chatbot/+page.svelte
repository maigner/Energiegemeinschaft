<script>
    import Chatbot from "$lib/Chatbot.svelte";
    import Project from "$lib/Project.svelte";
    import { Card, Heading } from "flowbite-svelte";

</script>



<div class="text-center">
    <Heading tag="h2">Sprich mit uns!</Heading>
</div>

<div class="p-4">
    <Card class="m-auto" size="xl" padding="xl">
        <Chatbot />
    </Card>    
</div>
