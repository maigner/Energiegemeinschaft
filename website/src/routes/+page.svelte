<script>
    import Project from "$lib/Project.svelte";
    import Fab, { Label } from "@smui/fab";
    import { Heading, } from "flowbite-svelte";
    import LayoutGrid, { Cell } from "@smui/layout-grid";

    import { Blockquote } from "flowbite-svelte";
</script>

<div class="flex place-content-center">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl">
            Willkommen bei der Energiegemeinschaft Bad Ischl! 
            <br />
            Erneuerbare
            Energie ist von entscheidender Bedeutung, weil sie dazu beiträgt,
            den Klimawandel einzudämmen.
        </Blockquote>
        <figcaption class="flex justify-center items-center mt-6 space-x-3">
            <div
                class="flex items-center divide-x-2 divide-gray-500 dark:divide-gray-700"
            >
                <cite class="pr-3 font-medium text-gray-900 dark:text-white"
                    >Energie aus Bad Ischl</cite
                >
                <cite
                    class="pl-3 text-sm font-light text-gray-500 dark:text-gray-400"
                    >für Bad Ischl</cite
                >
            </div>
        </figcaption>
    </figure>
</div>

<div class="text-center mt-5">
    <Heading tag="h2">Was gibt es Neues?</Heading>
</div>

<div class="flex place-content-center">
    <Project img="tmp/neue_mitglieder.jpeg">
        <span slot="title">Vereinsgründung</span>
        <div slot="content">
            Die Gründung einer Energiegemeinschaft ist ein bedeutender Schritt
            in Richtung nachhaltiger Energieversorgung. Menschen bündeln ihre
            Ressourcen und Fachkenntnisse, um erneuerba...
        </div>
    </Project>
</div>

<div class="text-center">
    <Heading tag="h2">Vorteile einer Energiegemeinschaft</Heading>
</div>

<div class="flex place-content-center">
    <LayoutGrid>
        <Cell span={6}>
            <div>
                <Project img="tmp/energiewende.png">
                    <span slot="title">Energiewende</span>
                    <div slot="content">
                        Sie fördern erneuerbare Energien, indem sie den
                        gemeinsamen Einsatz von Solaranlagen oder
                        Windkraftanlagen erleichtern und den Überschussstrom
                        verteilen.
                    </div>
                </Project>
            </div>
        </Cell>

        <Cell span={6}>
            <div>
                <Project img="tmp/unabhängig.jpeg">
                    <span slot="title">Unabhängigkeit</span>
                    <div slot="content">
                        Energiegemeinschaften bieten Unabhängigkeit von großen
                        Energieunternehmen und ermöglichen es den Mitgliedern,
                        ihre Energieversorgung selbst zu kontrollieren.
                    </div>
                </Project>
            </div>
        </Cell>

        <Cell span={6}>
            <div>
                <Project img="tmp/versorgung.jpeg">
                    <span slot="title">Versorgungssicherheit</span>
                    <div slot="content">
                        Gemeinschaften können in Notfällen auf eine zuverlässige
                        Energiequelle zugreifen und so die Energieversorgung in
                        Krisenzeiten sicherstellen.
                    </div>
                </Project>
            </div>
        </Cell>

        <Cell span={6}>
            <div>
                <Project img="tmp/vernetzt.jpeg">
                    <span slot="title">Soziale Vernetzung</span>
                    <div slot="content">
                        Energiegemeinschaften fördern den sozialen Zusammenhalt
                        und den Austausch von Wissen und Ressourcen zwischen
                        Mitgliedern, was die lokale Gemeinschaft stärkt.
                    </div>
                </Project>
            </div>
        </Cell>
    </LayoutGrid>
</div>

<div class="flex place-content-center">
    <Fab extended href="/mitmachen" color="primary">
        <Label>Jetzt Mitmachen</Label>
    </Fab>
</div>
<!--
<Paper>
    <Content>
        <LayoutGrid>
            <Cell spanDevices={{ desktop: 6, tablet: 12, phone: 12 }}>
                <div />
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
    <Content>
        <h1>Willkommen bei der Energiegemeinschaft Bad Ischl!</h1>
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
    <Content>
        <h1>Über Uns</h1>

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
        <div class="joinbutton">
            <Fab extended href="/vorteile" color="primary">
                <Label>Zu den Vorteilen</Label>
            </Fab>
        </div>
    </Content>
</Paper>

<style>
    .joinbutton {
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 20px;
    }
</style>
-->
