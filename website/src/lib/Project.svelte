<script>
    import Card, {
        Content,
        PrimaryAction,
        Media,
        MediaContent,
        Actions,
        ActionButtons,
        ActionIcons,
    } from "@smui/card";
    import Button, { Label } from "@smui/button";
    import IconButton, { Icon } from "@smui/icon-button";

    let clicked = 0;


</script>

<div class="card-container">
    <Card>
        <PrimaryAction on:click={() => clicked++}>
            
            <slot name="image"></slot>
            <Content class="mdc-typography--body2">
                <h2 class="mdc-typography--headline6" style="margin: 0;">
                    <slot name="title"></slot>
                </h2>
                <h3
                    class="mdc-typography--subtitle2"
                    style="margin: 0 0 10px; color: #888;"
                >
                <slot name="subtitle"></slot>

                </h3>
                <slot name="content"></slot>
            </Content>
        </PrimaryAction>
        <Actions>
            <ActionButtons>
                <Button on:click={() => clicked++}>
                    <Label>Mehr Erfahren</Label>
                </Button>
                
            </ActionButtons>
            <ActionIcons>
                <IconButton
                    on:click={() => clicked++}
                    toggle
                    aria-label="Add to favorites"
                    title="Add to favorites"
                >
                    <Icon class="material-icons" on>favorite</Icon>
                    <Icon class="material-icons">favorite_border</Icon>
                </IconButton>
                <IconButton
                    class="material-icons"
                    on:click={() => clicked++}
                    title="Share">share</IconButton
                >
                <IconButton
                    class="material-icons"
                    on:click={() => clicked++}
                    title="More options">more_vert</IconButton
                >
            </ActionIcons>
        </Actions>
    </Card>
</div>

<style>
    * :global(.card-media-16x9) {
        background-image: url(https://placehold.co/320x180?text=16x9);
    }
</style>
