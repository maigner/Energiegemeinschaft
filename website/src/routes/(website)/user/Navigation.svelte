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

    // Speichermanagement-Seite des ersten Standorts mit Anlage
    let plantHref = $derived(
        (data.plantMembers?.length ?? 0) > 0
            ? `/user/${data.plantMembers[0]}/speichermanagement`
            : null,
    );

    // Speicherrechner: der gerade angezeigte Standort, wenn er eine
    // PV-Anlage hat, sonst der erste mit Anlage
    let calculatorHref = $derived.by(() => {
        /** @type {number[]} */
        const solar = data.solarMembers ?? [];
        if (solar.length === 0) return null;
        const current = Number(page.params.memberId);
        return `/user/${solar.includes(current) ? current : solar[0]}/speicherrechner`;
    });
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

            {#if plantHref}
                <NavLi
                    href={plantHref}
                    onclick={() => toggle()}
                    activeClass="text-green-600 bg-secundary-100"
                    nonActiveClass="text-green-800"
                    class="hover:text-green-600"
                >
                    Speichermanagement
                </NavLi>
            {/if}

            {#if calculatorHref}
                <NavLi
                    href={calculatorHref}
                    onclick={() => toggle()}
                    activeClass="text-green-600 bg-secundary-100"
                    nonActiveClass="text-green-800"
                    class="hover:text-green-600"
                >
                    Speicherrechner
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
