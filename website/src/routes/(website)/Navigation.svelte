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

    import {
        Navbar,
        NavBrand,
        NavLi,
        NavUl,
        NavHamburger,
    } from "flowbite-svelte";

    let { data } = $props();
    let activeUrl = $derived(page.url.pathname);
</script>

<Navbar>
    {#snippet children({ hidden, toggle, NavContainer })}
        <NavBrand href="/">
            <img
                src="/logo2024.webp"
                class="sm:h-24 md:h-32 lg:h-36 xl:h-40 h-16"
                alt="Logo"
            />
        </NavBrand>
        <NavHamburger></NavHamburger>
        <NavUl {activeUrl}>
            <NavLi
                href="/"
                onclick={() => toggle()}
                activeClass="text-green-600 bg-secundary-100"
                nonActiveClass="text-green-800"
                class="hover:text-green-600"
            >
                <HomeOutline />Start
            </NavLi>

            <NavLi
                href="/mitmachen"
                onclick={() => toggle()}
                activeClass="text-green-600 bg-secundary-100"
                nonActiveClass="text-green-800"
                class="hover:text-green-600"
            >
                <UserAddOutline />Mitmachen</NavLi
            >

            <NavLi
                href="/faq"
                onclick={() => toggle()}
                activeClass="text-green-600 bg-secundary-100"
                nonActiveClass="text-green-800"
                class="hover:text-green-600"
            >
                <QuestionCircleOutline />Fragen</NavLi
            >

            <NavLi
                href="/kontakt"
                onclick={() => toggle()}
                activeClass="text-green-600 bg-secundary-100"
                nonActiveClass="text-green-800"
                class="hover:text-green-600"
            >
                <MailBoxOutline />Kontakt</NavLi
            >

            <NavLi
                href="/user"
                onclick={() => toggle()}
                activeClass="text-green-600 bg-secundary-100"
                nonActiveClass="text-green-800"
                class="hover:text-green-600"
            >
                <UserOutline />Mein Bereich</NavLi
            >

            {#if data.boardMember}
                <NavLi
                    href="/board"
                    onclick={() => toggle()}
                    activeClass="text-green-600 bg-secundary-100"
                    nonActiveClass="text-green-800"
                    class="hover:text-green-600"
                >
                    <AwardOutline />Vorstand</NavLi
                >
            {/if}

            {#if data.isCashierSession}
                <NavLi
                    href="/finance/bookings"
                    onclick={() => toggle()}
                    activeClass="text-green-600 bg-secundary-100"
                    nonActiveClass="text-green-800"
                    class="hover:text-green-600"
                >
                    <ChartMixedDollarOutline />Finanzen</NavLi
                >
            {/if}
        </NavUl>
    {/snippet}
</Navbar>

