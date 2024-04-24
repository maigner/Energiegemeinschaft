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
    import {signOut } from "@auth/sveltekit/client";

    /**
     * @type {{ member: { name: string; email: string; }; }}
     */
     export let data;
</script>

<Navbar>
    <NavBrand href="/board">
        <span
            class="self-center whitespace-nowrap text-xl font-semibold dark:text-white text-primary-600"
            >Vorstand</span
        >
    </NavBrand>
    <div class="flex items-center md:order-2">
        <NavHamburger class1="w-full md:flex md:w-auto md:order-1" />
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
        <DropdownItem on:click={() => {
            signOut();
        }}>Abmelden</DropdownItem>
    </Dropdown>
    <NavUl>
        <NavLi href="/board/approve">Neue Mitglieder</NavLi>
        <NavLi href="/board/files">Dokumente</NavLi>
    </NavUl>
</Navbar>