<script>
    import { page } from "$app/stores";

    import { BottomNavItem } from "flowbite-svelte";
    import {
        HomeOutline,
        MessagesOutline,
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


<Navbar let:NavContainer color="primary">
    <NavContainer class="border px-4 py-1 rounded-lg">
        <NavBrand href="/">
            <img src="header.png" class="h-14 sm:h-18" alt="Logo" />
        </NavBrand>
        <NavHamburger onClick={ () => {
            hidden = !hidden;
        } }/>
        <NavUl bind:hidden={hidden}>
            <div class="flex place-content-center">
                <NavLi href="/">
                    <BottomNavItem btnName="Start" href="/" class="" on:click={closeNav}>
                        <HomeOutline
                            class="w-4 h-4 mb-1 {$page.route.id === '/'
                                ? 'text-green-950'
                                : 'text-green-600'}  group-hover:text-green-900 "
                        />
                    </BottomNavItem>
                </NavLi>
                <NavLi href="/mitmachen">
                    <BottomNavItem btnName="Mitmachen" href="/mitmachen" on:click={closeNav}>
                        <UserAddOutline
                            class="w-4 h-4 mb-1 {$page.route.id === '/mitmachen'
                                ? 'text-green-950'
                                : 'text-green-600'} group-hover:text-green-900 "
                        />
                    </BottomNavItem>
                </NavLi>
                <NavLi href="/chatbot">
                    <BottomNavItem btnName="Kontakt" href="/chatbot" on:click={closeNav}>
                        <MessagesOutline
                            class="w-4 h-4 mb-1 {$page.route.id === '/chatbot'
                                ? 'text-green-950'
                                : 'text-green-600'}  group-hover:text-green-900 "
                        />
                    </BottomNavItem>
                </NavLi>
            </div>
        </NavUl>
    </NavContainer>
</Navbar>

