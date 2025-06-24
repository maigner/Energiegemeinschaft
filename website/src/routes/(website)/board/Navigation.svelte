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
        DarkMode,
    } from "flowbite-svelte";

    let { data } = $props();
    let activeUrl = $derived(page.url.pathname);
</script>

<Navbar>
    {#snippet children({ hidden, toggle, NavContainer })}
        <NavBrand href="/board">
            <span
                class="self-center whitespace-nowrap text-xl font-semibold dark:text-white text-primary-700"
                >Vorstandsbereich</span
            >
        </NavBrand>
        <NavHamburger class="ml-auto" />

        <Dropdown placement="bottom" triggeredBy="#avatar-menu">
            <DropdownHeader>
                <span class="block text-sm">{data.boardMember.name}</span>
                <span class="block truncate text-sm font-medium"
                    >{data.boardMember.email}</span
                >
            </DropdownHeader>
            <DropdownItem>
                <DarkMode />
            </DropdownItem>

            <DropdownItem
                onclick={() => {
                    signOut();
                }}>Abmelden</DropdownItem
            >
        </Dropdown>

        <NavUl {activeUrl}>
            <NavLi
                href="/board/energy/overview"
                onclick={() => toggle()}
                activeClass="text-green-600 bg-secundary-100"
                nonActiveClass="text-green-800"
                class="hover:text-green-600"
            >
                Entwicklung Energie
            </NavLi>

            <NavLi
                href="/board/members"
                onclick={() => toggle()}
                activeClass="text-green-600 bg-secundary-100"
                nonActiveClass="text-green-800"
                class="hover:text-green-600"
            >
                Mitglieder
            </NavLi>

            
            <NavLi
                href="/board/map"
                onclick={() => toggle()}
                activeClass="text-green-600 bg-secundary-100"
                nonActiveClass="text-green-800"
                class="hover:text-green-600"
            >
                Karte
            </NavLi>
        </NavUl>
        <Avatar id="avatar-menu" />
    {/snippet}
</Navbar>
