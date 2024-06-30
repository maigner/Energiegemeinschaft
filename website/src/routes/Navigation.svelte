<script>
    import { page } from "$app/stores";

    import { BottomNavItem } from "flowbite-svelte";
    import {
        HomeOutline,
        MailBoxOutline,
        QuestionCircleOutline,
        UserAddOutline,
    } from "flowbite-svelte-icons";

    import {
        Navbar,
        NavBrand,
        NavLi,
        NavUl,
        NavHamburger,
    } from "flowbite-svelte";

    let hidden = true;

    let closeNav = () => {
        hidden = true;
    };
</script>

<Navbar let:NavContainer>
    <NavContainer class="border px-4 py-1 rounded-lg">
        <NavBrand href="/">
            <img src="/logo2024.webp" class="h-16 sm:h-24 md:h-32 lg:h-40 xl:h-48" alt="Logo" />
        </NavBrand>
        <NavHamburger
            onClick={() => {
                hidden = !hidden;
            }}
        />
        <NavUl bind:hidden slideParams={{ delay: 0, duration: 500 }}>
            <div class="flex place-content-center flex-wrap">
                <NavLi href="/">
                    <BottomNavItem
                        btnName="Start"
                        href="/"
                        class=""
                        on:click={closeNav}
                    >
                        <HomeOutline
                            class="w-4 h-4 mb-1 {$page.route.id === '/'
                                ? 'text-green-950'
                                : 'text-green-600'}  group-hover:text-green-900 "
                        />
                    </BottomNavItem>
                </NavLi>
                <NavLi href="/mitmachen">
                    <BottomNavItem
                        btnName="Mitmachen"
                        href="/mitmachen"
                        on:click={closeNav}
                    >
                        <UserAddOutline
                            class="w-4 h-4 mb-1 {$page.route.id === '/mitmachen'
                                ? 'text-green-950'
                                : 'text-green-600'} group-hover:text-green-900 "
                        />
                    </BottomNavItem>
                </NavLi>
                
                <NavLi href="/faq">
                    <BottomNavItem
                        btnName="Fragen"
                        href="/faq"
                        on:click={closeNav}
                    >
                        <QuestionCircleOutline
                            class="w-4 h-4 mb-1 {$page.route.id === '/faq'
                                ? 'text-green-950'
                                : 'text-green-600'} group-hover:text-green-900 "
                        />
                    </BottomNavItem>
                </NavLi>

                <NavLi href="/kontakt">
                    <BottomNavItem
                        btnName="Kontakt"
                        href="/kontakt"
                        on:click={closeNav}
                    >
                        <MailBoxOutline
                            class="w-4 h-4 mb-1 {$page.route.id === '/kontakt'
                                ? 'text-green-950'
                                : 'text-green-600'} group-hover:text-green-900 "
                        />
                    </BottomNavItem>
                </NavLi>
                
            </div>
        </NavUl>
    </NavContainer>
</Navbar>
