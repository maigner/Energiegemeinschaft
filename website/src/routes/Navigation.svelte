<script>
    import { page } from "$app/stores";

    import { BottomNavItem } from "flowbite-svelte";
    import {
        HomeOutline,
        MailBoxOutline,
        QuestionCircleOutline,
        UserAddOutline,
        UserOutline,
    } from "flowbite-svelte-icons";

    import {
        Navbar,
        NavBrand,
        NavLi,
        NavUl,
        NavHamburger,
    } from "flowbite-svelte";

    let hidden = true;

    //let buttonStyle = "sm:w-10 sm:h-10 md:w-10 md:h-10 lg:w-12 lg:h-12 mb-1";
    let buttonStyle = "mb-1";    

    let closeNav = () => {
        hidden = true;
    };
</script>

<Navbar let:NavContainer>
    <NavContainer class="border px-4 py-1 rounded-lg">
        <NavBrand href="/">
            <img src="/logo2024.webp" class="sm:h-24 md:h-32 lg:h-36 xl:h-40 h-16" alt="Logo" />
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
                            class="{buttonStyle} {$page.route.id === '/'
                                ? 'text-green-600'
                                : 'text-green-800'}  group-hover:text-green-600 "
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
                            class="{buttonStyle} {$page.route.id === '/mitmachen'
                                ? 'text-green-600'
                                : 'text-green-800'}  group-hover:text-green-600 "
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
                            class="{buttonStyle} {$page.route.id === '/faq'
                                ? 'text-green-600'
                                : 'text-green-800'}  group-hover:text-green-600 "
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
                            class="{buttonStyle} {$page.route.id === '/kontakt'
                                ? 'text-green-600'
                                : 'text-green-800'}  group-hover:text-green-600 "
                        />
                    </BottomNavItem>
                </NavLi>

                <NavLi href="/user">
                    <BottomNavItem
                        btnName="Mein Bereich"
                        href="/user"
                        on:click={closeNav}
                    >
                        <UserOutline
                            class="{buttonStyle} {$page.route.id === '/kontakt'
                                ? 'text-green-600'
                                : 'text-green-800'}  group-hover:text-green-600 "
                        />
                    </BottomNavItem>
                </NavLi>
                
            </div>
        </NavUl>
    </NavContainer>
</Navbar>
