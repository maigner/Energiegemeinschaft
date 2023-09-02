<script>
    import Paper, { Content } from "@smui/paper";
    import LayoutGrid, { Cell } from "@smui/layout-grid";
    import Project from "$lib/Project.svelte";
</script>

<Paper>
    <Content
        ><h1>Aktuelles</h1>

        <LayoutGrid>
            <Cell span={6}>
                <div>
                    <Project>
                        <span slot="title">Vereinsgründung</span>
                        <span slot="subtitle">Los geht's</span>
                        <div slot="content">
                            Die Gründung einer Energiegemeinschaft ist ein
                            bedeutender Schritt in Richtung nachhaltiger
                            Energieversorgung. Menschen bündeln ihre Ressourcen
                            und Fachkenntnisse, um erneuerba...
                        </div>
                    </Project>
                </div>
            </Cell>
            <Cell span={6}>
                <div>
                    <Project>
                        <span slot="title">Neue Mitglieder</span>
                        <span slot="subtitle">Trafostation X</span>
                        <div slot="content">
                            Der Anschluss einer Trafostation ist ein
                            entscheidender Schritt in der Stromversorgung. Diese
                            Stationen transformieren Hochspannung in
                            Niederspannung und ermöglichen so die sichere...
                        </div>
                    </Project>
                </div>
            </Cell>
        </LayoutGrid>
    </Content>
</Paper>

<Paper>
    <Content
        ><h1>Willkommen bei der Energiegemeinschaft Bad Ischl!</h1>
        <p>Hier gibt es viel zu sehen. Los gehts!</p>
        <h2>Projekte</h2>

        <LayoutGrid>
            <Cell span={12}>
                <div>
                    <Project>
                        <span slot="title">PV Anlage</span>
                        <span slot="subtitle">Hier geht was weiter</span>
                        <div slot="content">
                            Eine Photovoltaik-Anlage (PV-Anlage) bietet eine
                            Vielzahl von Vorteilen. Zunächst einmal ermöglicht
                            sie die Nutzung erneuerbarer Energiequelle, nämlich
                            der Sonne, was zu einer drastischen Reduzierung der
                            Umweltauswirkungen im Vergleich zu fossilen...
                        </div>
                    </Project>
                </div>
            </Cell>
            <Cell span={12}>
                <div>
                    <Project>
                        <span slot="title">Ladestation</span>
                        <span slot="subtitle"
                            >Schnellladen, aber mit Ökostrom, bitte!</span
                        >
                        <div slot="content">
                            Schnellladestationen sind eine entscheidende
                            Komponente im Aufbau einer zukunftsfähigen
                            Infrastruktur für Elektromobilität. Sie bieten die
                            Möglichkeit, Elektrofahrzeuge in kürzester Zeit
                            aufzuladen, was die Attraktivität...
                        </div>
                    </Project>
                </div>
            </Cell>
        </LayoutGrid>
    </Content>
</Paper>

<Paper>
    <Content
        ><h1>Über Uns</h1>

        <LayoutGrid>
            <Cell span={12}>
                <div>
                    <Project>
                        <span slot="title">Gruppe</span>
                        <span slot="subtitle">Das sind wir</span>
                        <div slot="content">
                            Unser Team zeichnet sich durch eine außergewöhnliche
                            Zusammenarbeit und Fachkompetenz aus. Jedes
                            Teammitglied bringt einzigartige Fähigkeiten und
                            Perspektiven ein, die es uns ermöglichen,
                            vielfältige...
                        </div>
                    </Project>
                </div>
            </Cell>
        </LayoutGrid>
    </Content>
</Paper>
