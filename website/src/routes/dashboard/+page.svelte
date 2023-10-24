<script>
    import Project from "$lib/Project.svelte";
    import LayoutGrid from "@smui/layout-grid";
    import { Cell } from "@smui/layout-grid";
    import { BottomNav, BottomNavItem } from "flowbite-svelte";
    import { AdjustmentsVerticalOutline, HomeSolid, UserCircleSolid, WalletSolid } from "flowbite-svelte-icons";
</script>

<h1>Dashboard</h1>
<h2>Meine Daten</h2>

<LayoutGrid>
    <Cell span={6}>
        <Project>
            <span slot="title">Erzeugung</span>

            <div slot="image" class="center">
                <img src="tmp/chart.png" width="50%" alt="chart" />
            </div>

            <div slot="content">
                Strom
            </div>
        </Project>
    </Cell>

    <Cell span={6}>
        <Project>
            <span slot="title">Verbrauch</span>

            <div slot="image" class="center">
                <img src="tmp/chart.png" width="50%" alt="chart" />
            </div>

            <div slot="content">
                Strom, Gas, Wasser
            </div>
        </Project>
    </Cell>
    <Cell span={6}>
        <Project>
            <span slot="title">Preisentwicklung</span>

            <div slot="image" class="center">
                <img src="tmp/chart.png" width="50%" alt="chart" />
            </div>

            <div slot="content">
                Geld
            </div>
        </Project>
    </Cell>

    <Cell span={6}>
        <Project>
            <span slot="title">Umsätze</span>

            <div slot="image" class="center">
                <img src="tmp/chart.png" width="50%" alt="chart" />
            </div>

            <div slot="content">
                Mein Geld
            </div>
        </Project>
    </Cell>
</LayoutGrid>


<BottomNav position="fixed" navType="default" classInner="grid-cols-4">
    <BottomNavItem btnName="Home" href="/">
      <HomeSolid
        class="w-5 h-5 mb-1 text-gray-500 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-500"
      />
    </BottomNavItem>
    <BottomNavItem btnName="Wallet" href="/vorteile">
      <WalletSolid
        class="w-5 h-5 mb-1 text-gray-500 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-500"
      />
    </BottomNavItem>
    <BottomNavItem btnName="Settings">
      <AdjustmentsVerticalOutline
        class="w-5 h-5 mb-1 text-gray-500 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-500"
      />
    </BottomNavItem>
    <BottomNavItem btnName="Profile">
      <UserCircleSolid
        class="w-5 h-5 mb-1 text-gray-500 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-500"
      />
    </BottomNavItem>
  </BottomNav>
  