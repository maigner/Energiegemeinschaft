<script>
    import {
        Navbar,
        NavBrand,
        NavLi,
        NavUl,
        NavHamburger,
        Avatar,
        Dropdown,
        DropdownItem,
        DropdownHeader,
        DropdownDivider,
    } from "flowbite-svelte";
    import { signOut } from "@auth/sveltekit/client";

    /**
     * @type {{ member: { name: string; email: string; }; }}
     */
    export let data;

    let hidden = true;

    let closeNav = () => {
        hidden = true;
    };
</script>

<Navbar>
    <NavBrand href="/board">
        <span
            class="self-center whitespace-nowrap text-xl font-semibold dark:text-white text-primary-700"
            >Vorstandsbereich</span
        >
    </NavBrand>
    
    <div class="flex items-center md:order-2">
        <NavHamburger
            onClick={() => {
                hidden = !hidden;
            }}
            class1="w-full md:flex md:w-auto md:order-1"
        />
        <Avatar id="avatar-menu" />
    </div>
    <Dropdown placement="bottom" triggeredBy="#avatar-menu">
        <DropdownHeader>
            <span class="block text-sm">{data.member.name}</span>
            <span class="block truncate text-sm font-medium"
                >{data.member.email}</span
            >
        </DropdownHeader>
        <!--
        <DropdownItem>to do: Dashboard</DropdownItem>
        <DropdownItem>to do: Settings</DropdownItem>
        <DropdownDivider />
        -->
        <DropdownItem
            on:click={() => {
                signOut();
            }}>Abmelden</DropdownItem
        >
    </Dropdown>
    <NavUl bind:hidden slideParams={{ delay: 0, duration: 500 }}>
        <NavLi on:click={closeNav} href="/board/members">Mitglieder</NavLi>
        <NavLi on:click={closeNav} href="/board/approve">Bewerbungen</NavLi>
        <NavLi on:click={closeNav} href="/board/files">Dokumente</NavLi>
        <NavLi on:click={closeNav} href="/board/map">Karte</NavLi>
    </NavUl>
</Navbar>
