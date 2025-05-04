<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import MeasurementPoints from "./MeasurementPoints.svelte";
    import MemberCountChart from "./MemberCountChart.svelte";
    import { Blockquote } from 'flowbite-svelte';
    import { DataTable } from '@careswitch/svelte-data-table';

    export let data;

    const table = new DataTable({
        /*
		data: [
			{ id: 1, name: 'John Doe', status: 'active' },
			{ id: 2, name: 'Jane Doe', status: 'inactive' }
		],*/
        data: data.members,
		columns: [
			{ id: 'id', key: 'id', name: 'ID' },
			{ id: 'name', key: 'name', name: 'Name' },
			{ id: 'email', key: 'email', name: 'E-Mail' }
		]
	});
</script>



<div class="max-w-xl m-auto justify-center mb-8">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl" class="text-gray-900">
            Mitglieder
        </Blockquote>
        
    </figure>
</div>




<div class="flex place-content-center mt-8">
    <MemberCountChart bind:data />
</div>


<div class="flex place-content-center mt-8">
    <table>
        <thead>
            <tr>
                {#each table.columns as column (column.id)}
                    <th>{column.name}</th>
                {/each}
            </tr>
        </thead>
        <tbody>
            {#each table.rows as row (row.id)}
                <tr>
                    {#each table.columns as column (column.id)}
                        <td>{row[column.key]}</td>
                    {/each}
                </tr>
            {/each}
        </tbody>
    </table>
</div>


<div class="flex place-content-center mt-8">
    <JsonView json={data.members} />
</div>




<!--
<div class="flex place-content-center mt-8">
    <MeasurementPoints bind:data />
</div>
-->