<script>
    import {Radio, Button} from "flowbite-svelte";
    export let data;

    const submit = () => {
        document.getElementById("membershipApprovalForm").submit();
    } 
</script>

<form id="membershipApprovalForm" method="POST" action="?/approveMember">
    <p class="mb-4 font-semibold text-gray-900 dark:text-white">
        Möchten Sie <strong>{data.newMember.name}</strong> als Mitglied aufnehmen?
    </p>
    <ul
        class="items-center w-full rounded-lg border border-gray-200 sm:flex dark:bg-gray-800 dark:border-gray-600 divide-x rtl:divide-x-reverse divide-gray-200 dark:divide-gray-600"
    >
        <li class="w-full">
            <Radio name="hor-list" class="p-3">Ja</Radio>
        </li>
        <li class="w-full">
            <Radio name="hor-list" class="p-3">Nein</Radio>
        </li>
        
    </ul>

        
    <div class="flex place-content-center mt-8">
        <Button on:click={submit}>OK</Button>
    </div>
    

</form>

