<script>
  import "../app.css";

  import {
    BottomNav,
    BottomNavItem,
    Skeleton,
    ImagePlaceholder,
  } from "flowbite-svelte";
  import {
    HomeOutline,
    HomeSolid,
    UserAddOutline,
  } from "flowbite-svelte-icons";
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
</script>

<Navbar fluid={false}>
  <NavBrand href="/">
    <img src="header.png" class="mr-3 h-16 sm:h-20" alt="Logo" />
  </NavBrand>
  <NavHamburger />
  <NavUl>


    <div class="center">
      <BottomNavItem btnName="Home" href="/" class="">
        <HomeOutline
          class="w-10 h-10 mb-1 text-green-600  group-hover:text-green-900 "
        />
      </BottomNavItem>
      <BottomNavItem btnName="Mitmachen" href="/mitmachen">
        <UserAddOutline
          class="w-10 h-10 mb-1 text-green-600  group-hover:text-green-900 "
        />
      </BottomNavItem>
    </div>
    

  </NavUl>
</Navbar>

<slot />
