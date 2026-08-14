<script>
    import { page } from "$app/state";

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

    let hasMultipleLocations = $derived((data.users?.length ?? 0) > 1);
</script>

<Navbar>
    {#snippet children({ hidden, toggle, NavContainer })}
        <NavBrand href="/user">
            <span
                class="self-center whitespace-nowrap text-xl font-semibold dark:text-white text-primary-700"
                >Mein Bereich</span
            >
        </NavBrand>

        <div class="flex items-center gap-2 ml-auto md:order-2">
            <Avatar id="avatar-menu" class="cursor-pointer" />
            <NavHamburger />
        </div>

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

        <NavUl {activeUrl}>
            {#if hasMultipleLocations}
                <NavLi
                    href="/user"
                    onclick={() => toggle()}
                    activeClass="text-green-600 bg-secundary-100"
                    nonActiveClass="text-green-800"
                    class="hover:text-green-600"
                >
                    Meine Standorte
                </NavLi>
            {/if}

            <NavLi
                href="/"
                onclick={() => toggle()}
                activeClass="text-green-600 bg-secundary-100"
                nonActiveClass="text-green-800"
                class="hover:text-green-600"
            >
                Zur Website
            </NavLi>

            <NavLi
                href="mailto:info@ischlstrom.org"
                activeClass="text-green-600 bg-secundary-100"
                nonActiveClass="text-green-800"
                class="hover:text-green-600"
            >
                Hilfe &amp; Kontakt
            </NavLi>

            <NavLi
                href="#abmelden"
                onclick={(/** @type {Event} */ event) => {
                    event.preventDefault();
                    signOut();
                }}
                nonActiveClass="text-green-800"
                class="hover:text-green-600 cursor-pointer"
            >
                Abmelden
            </NavLi>
        </NavUl>
    {/snippet}
</Navbar>
