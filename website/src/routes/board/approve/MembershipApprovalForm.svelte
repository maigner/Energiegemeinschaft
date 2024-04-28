<script>
    import { Radio, Button } from "flowbite-svelte";
    /**
     * @type {{ newMember: { name: string; address:string; email:string }; }}
     */
    export let data;

    const submit = () => {
        // @ts-ignore
        document.getElementById("membershipApprovalForm")?.submit();
    };

    let approval = "Ja";
</script>

<form id="membershipApprovalForm" method="POST" action="?/approveMember">
    <p class="mb-4 font-semibold text-gray-900 dark:text-white">
        Möchten Sie 
        <br />
        >> <strong>{data.newMember.name}, {data.newMember.address}, {data.newMember.email} </strong>
        <br />
        als Mitglied aufnehmen?
    </p>
    <input type="hidden" name="new_member" value="{data.newMember.name}, {data.newMember.address}" />
    <input type="hidden" name="new_member_email" value="{data.newMember.email}" />


    


    <ul
        class="items-center w-full rounded-lg border border-gray-200 sm:flex dark:bg-gray-800 dark:border-gray-600 divide-x rtl:divide-x-reverse divide-gray-200 dark:divide-gray-600"
    >
        <li class="w-full">
            <Radio name="approval" bind:group={approval} value="Ja" class="p-4"
                >Ja</Radio
            >
        </li>
        <li class="w-full">
            <Radio
                name="approval"
                bind:group={approval}
                value="Nein"
                class="p-4">Nein</Radio
            >
        </li>
    </ul>

    <div class="flex place-content-center mt-8">
        <Button on:click={submit}>OK</Button>
    </div>
</form>
