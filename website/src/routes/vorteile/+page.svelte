<script>
    import Paper, { Content } from "@smui/paper";
    import LayoutGrid, { Cell } from "@smui/layout-grid";
    import Project from "$lib/Project.svelte";
    import Fab, { Label, Icon } from "@smui/fab";

</script>


<Paper>
    <Content
        ><h1>Vorteile</h1>
        <LayoutGrid>
            <Cell span={4}>
                <div>
                    <Project>
                        <span slot="title">Kosteneinsparungen</span>

                        <div slot="image">
                            <img src="tmp/kosten.jpeg" width="100%" alt="sponsors" />
                        </div>

                        <div slot="content">
                            Energiegemeinschaften ermöglichen es
                            Mitgliedern, gemeinsam Energie zu erzeugen, zu
                            speichern und zu nutzen, was zu niedrigeren
                            Energiekosten führt.
                        </div>
                    </Project>
                </div>
            </Cell>

            <Cell span={4}>
                <div>
                    <Project>
                        <span slot="title">Energiewende</span>
                        <div slot="image">
                            <img src="tmp/energiewende.png" width="100%" alt="sponsors" />
                        </div>
                        <div slot="content">
                            Sie fördern erneuerbare Energien, indem sie den
                            gemeinsamen Einsatz von Solaranlagen oder
                            Windkraftanlagen erleichtern und den
                            Überschussstrom verteilen.
                        </div>
                    </Project>
                </div>
            </Cell>

            <Cell span={4}>
                <div>
                    <Project>
                        <span slot="title">Unabhängigkeit</span>
                        <div slot="image">
                            <img src="tmp/unabhängig.jpeg" width="100%" alt="sponsors" />
                        </div>
                        <div slot="content">
                            Energiegemeinschaften bieten Unabhängigkeit von
                            großen Energieunternehmen und ermöglichen es den
                            Mitgliedern, ihre Energieversorgung selbst zu
                            kontrollieren.
                        </div>
                    </Project>
                </div>
            </Cell>

            <Cell span={4}>
                <div>
                    <Project>
                        <span slot="title">Umweltfreundlichkeit</span>
                        <div slot="image">
                            <img src="tmp/umwelt.jpeg" width="100%" alt="sponsors" />
                        </div>
                        <div slot="content">
                            Die Nutzung erneuerbarer Energiequellen in
                            Energiegemeinschaften reduziert den CO2-Ausstoß
                            und trägt zur Bekämpfung des Klimawandels bei.
                        </div>
                    </Project>
                </div>
            </Cell>

            <Cell span={4}>
                <div>
                    <Project>
                        <span slot="title">Versorgungssicherheit</span>
                        <div slot="image">
                            <img src="tmp/versorgung.jpeg" width="100%" alt="sponsors" />
                        </div>
                        <div slot="content">
                            Gemeinschaften können in Notfällen auf eine
                            zuverlässige Energiequelle zugreifen und so die
                            Energieversorgung in Krisenzeiten sicherstellen.
                        </div>
                    </Project>
                </div>
            </Cell>

            <Cell span={4}>
                <div>
                    <Project>
                        <span slot="title">Soziale Vernetzung</span>
                        <div slot="image">
                            <img src="tmp/vernetzt.jpeg" width="100%" alt="sponsors" />
                        </div>
                        <div slot="content">
                            Energiegemeinschaften fördern den sozialen
                            Zusammenhalt und den Austausch von Wissen und
                            Ressourcen zwischen Mitgliedern, was die lokale
                            Gemeinschaft stärkt.
                        </div>
                    </Project>
                </div>
            </Cell>
        </LayoutGrid>
    </Content>
</Paper>

<div class="joinbutton">
    <Fab
        extended
        href="/mitmachen"
        color="primary"
    >
        <Label>Jetzt Mitmachen</Label>
    </Fab>
</div>


<style>
    h1 {
        text-align: center;
    }
    .joinbutton {
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 20px;
    }
</style>

