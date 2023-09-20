<script>
    import Paper, { Content } from "@smui/paper";
    import LayoutGrid, { Cell } from "@smui/layout-grid";
    import Project from "$lib/Project.svelte";
    import JoinForm from "$lib/JoinForm.svelte";
    import "../../app.css";
</script>

<Paper>
    <Content>
        <h1>Willkommen</h1>

        <div class="form-container">
            <JoinForm />
        </div>
    </Content>
</Paper>

<style>
    .form-container {
        margin: 10px;
    }
</style>
