<script>
    import Project from "$lib/Project.svelte";
    import LayoutGrid from "@smui/layout-grid";
    import { Cell } from "@smui/layout-grid";
</script>

<h1>Meine Daten</h1>

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
</LayoutGrid>
