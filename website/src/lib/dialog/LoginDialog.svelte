<script>
    import Textfield from "@smui/textfield";
    import { Icon as CommonIcon } from "@smui/common";
    import Dialog, { Header, Title, Content, Actions } from "@smui/dialog";
    import IconButton from "@smui/icon-button";
    import Fab, { Label, Icon } from "@smui/fab";

    import { createForm } from "svelte-forms-lib";
    import * as yup from "yup";

    export let open = false;

    function closeHandler(e) {
        console.log(e);
    }

    function checkEmail() {}

    const { form, errors, state, handleChange, handleSubmit } = createForm({
        initialValues: {
            email: "",
        },
        onSubmit: (values) => {
            alert(JSON.stringify(values));
        },
        validationSchema: yup.object().shape({
            email: yup.string().email().required()
        })
    });
</script>

<Dialog
    bind:open
    fullscreen
    aria-labelledby="fullscreen-title"
    aria-describedby="fullscreen-content"
    on:SMUIDialog:closed={closeHandler}
>
    <Header>
        <Title id="fullscreen-title">Anmeldung</Title>
        <IconButton action="close" class="material-icons">close</IconButton>
    </Header>
    <Content id="fullscreen-content">
        <div class="center">
            
            <form on:submit={handleSubmit}>
                

                <Textfield bind:value={$form.email} type="email" on:change={handleChange} >
                    <svelte:fragment slot="label">
                        <CommonIcon
                            class="material-icons"
                            style="font-size: 1em; line-height: normal; vertical-align: top;"
                            >email</CommonIcon
                        > Email
                    </svelte:fragment>
                </Textfield>

                {#if $errors.email}
                <small>{$errors.email}</small>
                {/if}

                <button type="submit">Submit</button>
            </form>

        </div>

        <div id="next-button" class="center">
            <Fab color="primary" on:click={() => checkEmail} extended>
                <Icon class="material-icons">navigate_next</Icon>
                <Label>Weiter</Label>
            </Fab>
        </div>
    </Content>
</Dialog>

<style>
    #next-button {
        margin-top: 30px;
    }
</style>
