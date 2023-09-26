<script>
    // @ts-nocheck

    export let data;

    import "../app.css";

    import { page } from "$app/stores";
    import Fab, { Icon } from "@smui/fab";
    import TopAppBar, { Row, Section, Title } from "@smui/top-app-bar";
    import IconButton from "@smui/icon-button";
    import Menu from "$lib/Menu.svelte";

    let topAppBar;
</script>

<div class="center">
    <div id="appcontainer">
        <div class="center">
            <TopAppBar bind:this={topAppBar} variant="static" dense={true}>
                <Row>
                    <Section>
                        <Menu />
                        <!--<Title>Menü</Title>-->
                    </Section>
                    <Section align="end" toolbar>
                        <IconButton
                            href="/chatbot"
                            class="material-icons"
                            aria-label="Download">search</IconButton
                        >
                        <IconButton
                            href="/dashboard"
                            class="material-icons"
                            aria-label="Download">manage_accounts</IconButton
                        >
                    </Section>
                </Row>
            </TopAppBar>
        </div>

        {#if $page.route.id !== "/dashboard"}
            <div class="center" id="header">
                <img src="header.png" width="80%" alt="header" />
            </div>
        {/if}

        {#if $page.route.id !== "/dashboard"}
            <div class="center">
                <div class="margins">
                    <Fab
                        href="/"
                        color={$page.route.id == "/" ? "primary" : "secondary"}
                    >
                        <IconButton class="material-icons">home</IconButton>
                    </Fab>
                </div>
                <div class="margins">
                    <Fab
                        href="/vorteile"
                        color={$page.route.id == "/vorteile"
                            ? "primary"
                            : "secondary"}
                    >
                        <IconButton class="material-icons">verified</IconButton>
                    </Fab>
                </div>
                <div class="margins">
                    <Fab
                        href="/mitmachen"
                        color={$page.route.id == "/mitmachen"
                            ? "primary"
                            : "secondary"}
                    >
                        <IconButton class="material-icons">group_add</IconButton
                        >
                    </Fab>
                </div>
                <div class="margins">
                    <Fab
                        href="/chatbot"
                        color={$page.route.id == "/chatbot"
                            ? "primary"
                            : "secondary"}
                    >
                        <IconButton class="material-icons"
                            >contact_support</IconButton
                        >
                    </Fab>
                </div>
            </div>
        {/if}

        <slot />

        <div class="center">
            <div class="sponsors">
                <img src="sponsors.jpg" width="100%" alt="sponsors" />
            </div>
        </div>

        <div class="center">
            <a href="/impressum">Impressum</a>
        </div>
    </div>
</div>

<style>
    #header {
        margin-top: 5px;
        margin-bottom: 5px;
    }
    #appcontainer {
        width: 100%;
        max-width: 60em;
    }
    .center {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .margins {
        margin-left: 10px;
        margin-right: 10px;
    }
    .sponsors {
        margin: 20px;
    }

    :global(.smui-paper) {
        padding-top: 6px;
        padding-right: 0px;
        padding-bottom: 6px;
        padding-left: 0px;
    }

    :global(.smui-paper__title) {
        margin-left: 8px;
    }
    :global(.smui-paper__subtitle) {
        margin-left: 8px;
    }
    :global(.smui-paper__content) {
        margin-left: 8px;
        margin-right: 6px;
    }

    :global(.mdc-layout-grid) {
        padding-top: 6px;
        padding-right: 6px;
        padding-bottom: 6px;
        padding-left: 6px;
    }

    :global(h1) {
        text-align: center;
    }
    :global(h2) {
        text-align: center;
    }
    :global(h3) {
        text-align: center;
    }
</style>
