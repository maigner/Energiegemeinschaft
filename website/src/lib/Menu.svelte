<script>
    // @ts-nocheck

    import IconButton from "@smui/icon-button";
    import Menu from "@smui/menu";
    import List, { Item, Separator, Text } from "@smui/list";
    import LoginDialog from "$lib/dialog/LoginDialog.svelte";

    let menu;

    let showLoginDialog = false;
</script>

<LoginDialog bind:open={showLoginDialog} />

<div>
    <IconButton on:click={() => menu.setOpen(true)} class="material-icons"
        >menu</IconButton
    >
    <Menu bind:this={menu}>
        <List>
            <Item
                on:SMUI:action={() => {
                    window.location.href = "/";
                }}
            >
                <Text>Startseite</Text>
            </Item>
            <Item on:SMUI:action={() => (showLoginDialog = true)}>
                <Text>Anmelden</Text>
            </Item>
            <Item on:SMUI:action={() => alert("Coming soon...")}>
                <Text>Abfragen</Text>
            </Item>
            <Item on:SMUI:action={() => alert("Coming soon...")}>
                <Text>Abrechnungen</Text>
            </Item>
            <Separator />
            <Item on:SMUI:action={() => alert("Coming soon...")}>
                <Text>Abmelden</Text>
            </Item>
        </List>
    </Menu>
</div>
