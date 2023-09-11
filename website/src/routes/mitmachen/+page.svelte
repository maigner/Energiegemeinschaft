<script>
    import Paper, { Content } from "@smui/paper";
    import LayoutGrid, { Cell } from "@smui/layout-grid";
    import Project from "$lib/Project.svelte";
    import JoinForm from "$lib/JoinForm.svelte";
</script>

<Paper>
    <Content>
        <h1>Willkommen</h1>
        <p>Teil der Energiewende zu sein ist ganz einfach.</p>

        <p>Dazu brauchen wir ein paar Informationen...</p>
        <p>
            <JoinForm />
        </p>
    </Content>
</Paper>

<style>
    
</style>
