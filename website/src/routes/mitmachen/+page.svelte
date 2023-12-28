<script>
    import JoinForm from "$lib/JoinForm.svelte";
    import { Button, Card, Heading } from "flowbite-svelte";
    import Project from "$lib/Project.svelte";



    // TODO: check list
    export let data;

    
</script>



<div class="text-center">
    <Heading tag="h2">Willkommen</Heading>
</div>

<div class="flex place-content-center">
    <Card class="m-2 max-w-3xl" size="xl">

        <Heading tag="h5"
            class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white"
        >
            {data?.session?.user?.email}
        </Heading>

        <p
            class="mb-3 font-normal text-gray-700 dark:text-gray-400 leading-tight"
        >
            Add data here...
        </p>
        
    </Card>
</div>



{JSON.stringify(data)}
