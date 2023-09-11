<script>
    import Paper, { Content } from "@smui/paper";
    import LayoutGrid, { Cell } from "@smui/layout-grid";
    import Project from "$lib/Project.svelte";
    import Fab, { Label, Icon } from "@smui/fab";
    import { onMount } from "svelte";

    
</script>

<Paper>
    <Content>
        <h1>Was gibt es Neues?</h1>

        <LayoutGrid>
            <Cell spanDevices={{ desktop: 6, tablet: 12, phone: 12 }}>
                <div>
                    <Project>
                        <span slot="title">Vereinsgründung</span>
                        <span slot="subtitle">Los geht's</span>
                        <div slot="image">
                            <img
                                src="tmp/verein.jpeg"
                                width="100%"
                                alt="sponsors"
                            />
                        </div>
                        <div slot="content">
                            Die Gründung einer Energiegemeinschaft ist ein
                            bedeutender Schritt in Richtung nachhaltiger
                            Energieversorgung. Menschen bündeln ihre Ressourcen
                            und Fachkenntnisse, um erneuerba...
                        </div>
                    </Project>
                </div>
            </Cell>
            <Cell spanDevices={{ desktop: 6, tablet: 12, phone: 12 }}>
                <div>
                    <Project>
                        <span slot="title">Technik</span>
                        <span slot="subtitle">Trafostation X</span>
                        <div slot="image">
                            <img
                                src="tmp/trafo.jpeg"
                                width="100%"
                                alt="sponsors"
                            />
                        </div>
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
        <p>
            Erneuerbare Energie ist von entscheidender Bedeutung, weil sie dazu
            beiträgt, den Klimawandel einzudämmen. Im Gegensatz zu fossilen
            Brennstoffen verursachen erneuerbare Energiequellen wie Wind, Sonne
            und Wasser keine schädlichen Treibhausgasemissionen, die zur
            globalen Erwärmung beitragen. Darüber hinaus verringert der
            verstärkte Einsatz erneuerbarer Energien unsere Abhängigkeit von
            endlichen Ressourcen und erhöht die Energieversorgungssicherheit, da
            sie unerschöpflich und lokal verfügbar sind.
        </p>
        <h2>Projekte</h2>

        <LayoutGrid>
            <Cell spanDevices={{ desktop: 6, tablet: 12, phone: 12 }}>
                <div>
                    <Project>
                        <span slot="title">PV Anlage</span>
                        <span slot="subtitle">Hier geht was weiter</span>
                        <div slot="image">
                            <img
                                src="tmp/pv.jpeg"
                                width="100%"
                                alt="sponsors"
                            />
                        </div>
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
            <Cell spanDevices={{ desktop: 6, tablet: 12, phone: 12 }}>
                <div>
                    <Project>
                        <span slot="title">Ladestation</span>
                        <span slot="subtitle"
                            >Schnellladen, aber mit Ökostrom, bitte!</span
                        >
                        <div slot="image">
                            <img
                                src="tmp/ladestation.jpeg"
                                width="100%"
                                alt="sponsors"
                            />
                        </div>
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
            <Cell spanDevices={{ desktop: 6, tablet: 12, phone: 12 }}>
                <div>
                    <Project>
                        <span slot="title">Gruppe</span>
                        <span slot="subtitle">Das sind wir</span>
                        <div slot="image">
                            <img
                                src="tmp/neue_mitglieder.jpeg"
                                width="100%"
                                alt="sponsors"
                            />
                        </div>
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

<div class="joinbutton">
    <Fab extended href="/vorteile" color="primary">
        <Label>Zu den Vorteilen</Label>
    </Fab>
</div>

<style>
    
    .joinbutton {
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 20px;
    }
</style>
