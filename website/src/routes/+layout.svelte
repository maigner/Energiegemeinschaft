<script>
  import "../app.css";

  import { BottomNavItem, Heading, Hr } from "flowbite-svelte";
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
  import { Button } from "flowbite-svelte";

  import { page } from "$app/stores";
  import BetaLogin from "$lib/dialog/BetaLogin.svelte";

  let betaLoginOpen = false;
</script>

<BetaLogin bind:open={betaLoginOpen} />

<div>
  <Navbar fluid={false} class="">
    <NavBrand href="/">
      <img src="header.png" class="mr-3 h-16 sm:h-20" alt="Logo" />
    </NavBrand>
    <NavHamburger />
    <NavUl class="">
      <div class="flex place-content-center">
        {#if $page.route.id !== "/"}
          <BottomNavItem btnName="Home" href="/" class="">
            <HomeOutline
              class="w-6 h-6 mb-1 {$page.route.id === '/'
                ? 'text-green-950'
                : 'text-green-600'}  group-hover:text-green-900 "
            />
          </BottomNavItem>
        {/if}
        {#if $page.route.id !== "/mitmachen"}
          <BottomNavItem btnName="Mitmachen" href="/mitmachen">
            <UserAddOutline
              class="w-6 h-6 mb-1 {$page.route.id === '/mitmachen'
                ? 'text-green-950'
                : 'text-green-600'} group-hover:text-green-900 "
            />
          </BottomNavItem>
        {/if}
        {#if $page.route.id !== "/chatbot"}
          <BottomNavItem btnName="Kontakt" href="/chatbot">
            <MessagesOutline
              class="w-6 h-6 mb-1 {$page.route.id === '/chatbot'
                ? 'text-green-950'
                : 'text-green-600'}  group-hover:text-green-900 "
            />
          </BottomNavItem>
        {/if}
      </div>
    </NavUl>
  </Navbar>

  <slot />

  <div class="center mt-16">
    <img src="sponsors.jpg" width="80%" alt="sponsors" />
  </div>

  <div class="center">
    <a href="/impressum">Impressum</a>
  </div>

  <Hr />
</div>
