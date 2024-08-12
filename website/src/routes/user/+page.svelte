<script>
    import { Blockquote } from "flowbite-svelte";
    import { Listgroup } from "flowbite-svelte";

    export let data;


    let links = data.users.map( (user) => {
        return {
            name: `${user.name}, ${user.street} ${user.hnr}`,
            href: `/user/${user.identifier}`
        }
    });


</script>

{#if data.users}
    
    
    <div class="max-w-xl m-auto justify-center flex">
        <Listgroup active items={links} let:item class="w-11/12">
            {item.name}
        </Listgroup>
    </div>



{/if}
