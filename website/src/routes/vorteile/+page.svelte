<script>
    import Paper, { Content } from "@smui/paper";
    import LayoutGrid, { Cell } from "@smui/layout-grid";
    import Project from "$lib/Project.svelte";

</script>


<Paper variant="unelevated">
    <Content
        ><h1>Unsere Vorteile</h1>
        <LayoutGrid>
            <Cell span={4}>
                <div>
                    <Project>
                        <span slot="title">Kosteneinsparungen</span>

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