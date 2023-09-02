<script>
    import Paper, { Content } from "@smui/paper";
    import LayoutGrid, { Cell } from "@smui/layout-grid";
    import Project from "$lib/Project.svelte";
    import JoinForm from "$lib/JoinForm.svelte";

</script>

<Paper variant="unelevated">
    <Content
        ><h1>Willkommen bei der Energie</h1>
        <p>Hier gibt es viel zu sehen. Los gehts!</p>
        <h2>Projekte</h2>

        <JoinForm />

    </Content>
</Paper>
