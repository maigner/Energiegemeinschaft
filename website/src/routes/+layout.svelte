<script>
    // @ts-nocheck

    import { page } from "$app/stores";
    import Fab, { Icon } from "@smui/fab";
    import TopAppBar, {
        Row,
        Section,
        Title,
        AutoAdjust,
    } from "@smui/top-app-bar";
    import IconButton from "@smui/icon-button";
    import Menu from "@smui/menu";
    import List, { Item, Separator, Text } from "@smui/list";
    import BottomAppBar from "@smui-extra/bottom-app-bar";
    import Dialog, { Content, Actions } from "@smui/dialog";
    import Button, { Label } from "@smui/button";
    import Chatbot from "./Chatbot.svelte";
    import Paper from "@smui/paper";
    import LayoutGrid, { Cell } from "@smui/layout-grid";

    let topAppBar;
    let bottomAppBar;

    /**
     * @type {{ setOpen: (arg0: boolean) => void; }}
     */
    let menu;
    let clicked;

    let openChat = false;
</script>

<div class="center">
    <div id="appcontainer" class="center">
        <Paper>
            <Content>
                <TopAppBar bind:this={topAppBar} variant="static" dense={true}>
                    <Row>
                        <Section>
                            <IconButton
                                on:click={() => menu.setOpen(true)}
                                class="material-icons">menu</IconButton
                            >

                            <Title>Menü</Title>
                        </Section>
                        <Section align="end" toolbar>
                            <IconButton
                                class="material-icons"
                                aria-label="Download">search</IconButton
                            >
                            <IconButton
                                class="material-icons"
                                aria-label="Download"
                                >manage_accounts</IconButton
                            >
                        </Section>
                    </Row>
                </TopAppBar>

                <div class="menu-margins">
                    <Menu bind:this={menu}>
                        <List>
                            <Item on:SMUI:action={() => (clicked = "Cut")}>
                                <Text>Anmelden</Text>
                            </Item>
                            <Item on:SMUI:action={() => (clicked = "Copy")}>
                                <Text>Abfragen</Text>
                            </Item>
                            <Item on:SMUI:action={() => (clicked = "Paste")}>
                                <Text>Abrechnungen</Text>
                            </Item>
                            <Separator />
                            <Item on:SMUI:action={() => (clicked = "Delete")}>
                                <Text>Abmelden</Text>
                            </Item>
                        </List>
                    </Menu>
                </div>

                <AutoAdjust {topAppBar}>
                    <div class="center">
                        <img src="header.png" width="100%" alt="header" />
                    </div>

                    <div class="center">
                        <LayoutGrid>
                            <Cell span={1}>
                                <Fab
                                    extended
                                    href="/"
                                    color={$page.route.id == "/"
                                        ? "primary"
                                        : "secondary"}
                                >
                                    <IconButton class="material-icons"
                                        >home</IconButton
                                    >
                                </Fab>
                            </Cell>
                            <Cell span={1}>
                                <Fab
                                    extended
                                    href="/vorteile"
                                    color={$page.route.id == "/vorteile"
                                        ? "primary"
                                        : "secondary"}
                                >
                                    <IconButton class="material-icons"
                                        >verified</IconButton
                                    >
                                </Fab>
                            </Cell>
                            <Cell span={1}>
                                <Fab
                                    extended
                                    href="/mitmachen"
                                    color={$page.route.id == "/mitmachen"
                                        ? "primary"
                                        : "secondary"}
                                >
                                    <IconButton class="material-icons"
                                        >group_add</IconButton
                                    >
                                </Fab>
                            </Cell>
                            <Cell span={1}>
                                <Fab
                                    extended
                                    color={openChat == true
                                        ? "primary"
                                        : "secondary"}
                                >
                                    <IconButton
                                        class="material-icons"
                                        on:click={() => (openChat = true)}
                                        >contact_support</IconButton
                                    >
                                </Fab>
                            </Cell>
                        </LayoutGrid>
                    </div>

                    <slot />

                    <div class="center">
                        <div class="sponsors">
                            <img
                                src="sponsors.jpg"
                                width="80%"
                                alt="sponsors"
                            />
                        </div>
                    </div>

                    <div class="center">
                        <a href="/impressum">Impressum</a>
                    </div>
                </AutoAdjust>

                <Dialog
                    bind:open={openChat}
                    aria-labelledby="large-scroll-title"
                    aria-describedby="large-scroll-content"
                    surface$style="width: 850px; max-width: calc(100vw - 32px);"
                >
                    <!-- Title cannot contain leading whitespace due to mdc-typography-baseline-top() -->
                    <Content id="simple-content"><Chatbot /></Content>
                    <Actions>
                        <Button on:click={() => (openChat = false)}>
                            <Label>Schließen</Label>
                        </Button>
                    </Actions>
                </Dialog>
            </Content>
        </Paper>
    </div>
</div>

<style>
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
        margin-left: 20px;
        margin-right: 20px;
    }
    .sponsors {
        margin: 20px;
    }
    .menu-margins {
        margin-top: 0px;
        margin-left: 0px;
    }

    :global(.smui-paper) {
        padding-top: 3px;
        padding-right: 2px;
        padding-bottom: 3px;
        padding-left: 2px;
    }
</style>
