<script>
    import Tab, { Label } from "@smui/tab";
    import TabBar from "@smui/tab-bar";
    import Paper, { Content } from "@smui/paper";
    import LayoutGrid, { Cell } from "@smui/layout-grid";
    import Project from "$lib/Project.svelte";

    let active = "Vorteile";
    let clicked = 0;
</script>

<div class="center">
    <TabBar tabs={["Home", "Über Uns", "Vorteile"]} let:tab bind:active>
        <!-- Note: the `tab` property is required! -->
        <Tab {tab}>
            <Label>{tab}</Label>
        </Tab>
    </TabBar>
</div>

{#if active === "Home"}
    <Paper variant="unelevated">
        <Content
            ><h1>Willkommen bei der Energie</h1>
            <p>Hier gibt es viel zu sehen</p>
            <h2>Projekte</h2>

            <LayoutGrid>
                <Cell span={12}>
                    <div>
                        <Project>
                            <span slot="title">PV Anlage</span>
                            <span slot="subtitle">Hier geht was weiter</span>
                            <div slot="content">
                                Eine Photovoltaik-Anlage (PV-Anlage) bietet eine
                                Vielzahl von Vorteilen. Zunächst einmal
                                ermöglicht sie die Nutzung erneuerbarer
                                Energiequelle, nämlich der Sonne, was zu einer
                                drastischen Reduzierung der Umweltauswirkungen
                                im Vergleich zu fossilen...
                            </div>
                        </Project>
                    </div>
                </Cell>
                <Cell span={12}>
                    <div>
                        <Project>
                            <span slot="title">Ladestation</span>
                            <span slot="subtitle"
                                >Schnellladen, aber richtig!</span
                            >
                            <div slot="content">
                                Schnellladestationen sind eine entscheidende
                                Komponente im Aufbau einer zukunftsfähigen
                                Infrastruktur für Elektromobilität. Sie bieten
                                die Möglichkeit, Elektrofahrzeuge in kürzester
                                Zeit aufzuladen, was die Attraktivität...
                            </div>
                        </Project>
                    </div>
                </Cell>
            </LayoutGrid>
        </Content>
    </Paper>
{:else if active === "Über Uns"}
    <Paper variant="unelevated">
        <Content
            ><h1>Über Uns</h1>
            <p>Das sind wir.</p>

            <LayoutGrid>
                <Cell span={12}>
                    <div>
                        <Project>
                            <span slot="title">Gruppe</span>
                            <span slot="subtitle">Das sind wir</span>
                            <div slot="content">
                                Unser Team zeichnet sich durch eine
                                außergewöhnliche Zusammenarbeit und
                                Fachkompetenz aus. Jedes Teammitglied bringt
                                einzigartige Fähigkeiten und Perspektiven ein,
                                die es uns ermöglichen, vielfältige...
                            </div>
                        </Project>
                    </div>
                </Cell>
            </LayoutGrid>
        </Content>
    </Paper>
{:else if active === "Vorteile"}
    <Paper variant="unelevated">
        <Content
            ><h1>Unsere Vorteile</h1>
            <p>Hier gibt es auch sehr viel zu sehen.</p>


            <LayoutGrid>
                
                <Cell span={4}>
                    <div>
                        <Project>
                            <span slot="title">Kosteneinsparungen</span>
                            
                            <div slot="content">
                                Energiegemeinschaften ermöglichen es Mitgliedern, gemeinsam Energie zu erzeugen, zu speichern und zu nutzen, was zu niedrigeren Energiekosten führt.
                            </div>
                        </Project>
                    </div>
                </Cell>

                <Cell span={4}>
                    <div>
                        <Project>
                            <span slot="title">Energiewende</span>
                            
                            <div slot="content">
                                Sie fördern erneuerbare Energien, indem sie den gemeinsamen Einsatz von Solaranlagen oder Windkraftanlagen erleichtern und den Überschussstrom verteilen.                            </div>
                        </Project>
                    </div>
                </Cell>

                <Cell span={4}>
                    <div>
                        <Project>
                            <span slot="title">Unabhängigkeit</span>
                            
                            <div slot="content">
                                Energiegemeinschaften bieten Unabhängigkeit von großen Energieunternehmen und ermöglichen es den Mitgliedern, ihre Energieversorgung selbst zu kontrollieren.                            </div>
                        </Project>
                    </div>
                </Cell>

                <Cell span={4}>
                    <div>
                        <Project>
                            <span slot="title">Umweltfreundlichkeit</span>
                            
                            <div slot="content">
                                Die Nutzung erneuerbarer Energiequellen in Energiegemeinschaften reduziert den CO2-Ausstoß und trägt zur Bekämpfung des Klimawandels bei.                            </div>
                        </Project>
                    </div>
                </Cell>

                <Cell span={4}>
                    <div>
                        <Project>
                            <span slot="title">Versorgungssicherheit</span>
                            
                            <div slot="content">
                                Gemeinschaften können in Notfällen auf eine zuverlässige Energiequelle zugreifen und so die Energieversorgung in Krisenzeiten sicherstellen.                            </div>
                        </Project>
                    </div>
                </Cell>

                <Cell span={4}>
                    <div>
                        <Project>
                            <span slot="title">Soziale Vernetzung</span>
                            
                            <div slot="content">
                                Energiegemeinschaften fördern den sozialen Zusammenhalt und den Austausch von Wissen und Ressourcen zwischen Mitgliedern, was die lokale Gemeinschaft stärkt.                            </div>
                        </Project>
                    </div>
                </Cell>
            </LayoutGrid>




        </Content>
    </Paper>
{/if}

<style>
</style>
