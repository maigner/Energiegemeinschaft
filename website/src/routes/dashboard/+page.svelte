<script>
    import Project from "$lib/Project.svelte";
    import LayoutGrid from "@smui/layout-grid";
    import { Cell } from "@smui/layout-grid";
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
