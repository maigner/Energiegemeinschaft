<script>
    import { page } from "$app/state";

    import {
        HomeOutline,
        MailBoxOutline,
        QuestionCircleOutline,
        UserAddOutline,
        UserOutline,
        ChartMixedDollarOutline,
        AwardOutline,
    } from "flowbite-svelte-icons";

    import { signOut } from "@auth/sveltekit/client";

    import {
        Navbar,
        NavBrand,
        NavLi,
        NavUl,
        NavHamburger,
        Avatar,
        Dropdown,
        DropdownHeader,
        DropdownItem,
    } from "flowbite-svelte";

    let { data } = $props();
    let activeUrl = $derived(page.url.pathname);
</script>

<Navbar>
    {#snippet children({ hidden, toggle, NavContainer })}
        <NavBrand href="/user">
            <span
                class="self-center whitespace-nowrap text-xl font-semibold dark:text-white text-primary-700"
                >Mein Bereich</span
            >
        </NavBrand>
        <Avatar id="avatar-menu" />

        <Dropdown placement="bottom" triggeredBy="#avatar-menu">
            <DropdownHeader>
                <span class="block truncate text-sm font-medium"
                    >{data.session?.user.email}</span
                >
            </DropdownHeader>

            <DropdownItem
                onclick={() => {
                    signOut();
                }}>Abmelden</DropdownItem
            >
        </Dropdown>
    {/snippet}
</Navbar>
