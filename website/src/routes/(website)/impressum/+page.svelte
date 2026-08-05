<script>
    import Fab from "$lib/Fab.svelte";
    import { Card, Heading } from "flowbite-svelte";
    import { AccordionItem, Accordion } from "flowbite-svelte";
</script>

<div class="text-center">
    <Heading tag="h3" class="text-primary-600 mt-6">Impressum</Heading>
</div>

<div class="flex place-content-center">
    <Card class="m-2 max-w-3xl" size="xl">
        <Accordion>
            <AccordionItem>
                {#snippet header()}Verantwortlich für die EEG ischlstrom{/snippet}

                <p class="mb-2 text-gray-500 dark:text-gray-400">
                    Erneuerbare-Energie-Gemeinschaft ISCHLSTROM
                    <br />
                    ZVR: 1915125185
                    <br />
                    Obfrau DI Katharina Thomson
                    <br />Faschlweg 39
                    <br />
                    4820 Bad Ischl
                    <br />
                    E-Mail: info@ischlstrom.org
                </p>

                <p class="text-gray-500 dark:text-gray-400"></p>
            </AccordionItem>
            <AccordionItem>
                {#snippet header()}Datenschutz{/snippet}

                <p class="mb-2 text-gray-500 dark:text-gray-400">
                    Informationen zur Verarbeitung personenbezogener Daten
                    finden Sie in unserer
                    <a class="underline" href="/datenschutz"
                        >Datenschutzerklärung</a
                    >.
                </p>
            </AccordionItem>

            <AccordionItem>
                {#snippet header()}Technischer Ansprechpartner{/snippet}

                <p class="mb-2 text-gray-500 dark:text-gray-400">
                    Erneuerbare-Energie-Gemeinschaft ISCHLSTROM
                    <br />
                    Dr. Martin Aigner
                    <br />Loskoglweg 14
                    <br />
                    4820 Bad Ischl
                    <br />
                    E-Mail: martin.aigner@ischlstrom.org
                </p>

                <p class="text-gray-500 dark:text-gray-400"></p>
            </AccordionItem>

            <AccordionItem>
                {#snippet header()}Bildquellen{/snippet}

                <div class="text-xs text-gray-500 dark:text-gray-400">
                    <ul>
                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:Slimme_meters_van_Enexis,_Oude_Pekela_(2018)_01.jpg"
                                >Donald Trung Quoc Don (Chữ Hán: 徵國單) -
                                Wikimedia Commons.</a
                            >,<br />
                            <a
                                href="https://creativecommons.org/licenses/by-sa/4.0"
                                >CC BY-SA 4.0</a
                            >, via Wikimedia Commons
                        </li>
                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:004_2017_05_20_Erneuerbare_Energie.jpg"
                            >
                                © Friedrich Haag&nbsp;/&nbsp;</a
                            ><a href="/wiki/Main_Page" title="Main Page"
                                >Wikimedia Commons</a
                            >
                        </li>
                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:Herten_Westerholt_-_Freiheit_03_ies.jpg"
                            >
                                Frank Vincentz
                            </a>,
                            <a
                                href="https://creativecommons.org/licenses/by-sa/3.0"
                                >CC BY-SA 3.0</a
                            >, via Wikimedia Commons
                        </li>
                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:%22Miteinander-Weg%22_in_Gilching.png"
                                >XoMEoX</a
                            >,
                            <a
                                href="https://creativecommons.org/licenses/by/4.0"
                                >CC BY 4.0</a
                            >, via Wikimedia Commons
                        </li>
                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:Elbe_Parey-Polte_03.jpg"
                                >Georgfotoart</a
                            >,
                            <a
                                href="https://creativecommons.org/licenses/by-sa/4.0"
                                >CC BY-SA 4.0</a
                            >, via Wikimedia Commons
                        </li>

                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:Fountain_pen_writing_(literacy).jpg"
                                >Petar Milošević</a
                            >,
                            <a
                                href="https://creativecommons.org/licenses/by-sa/4.0"
                                >CC BY-SA 4.0</a
                            >, via Wikimedia Commons
                        </li>

                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:Statuta_venerabilis_collegii_Turonensis_(statuts_du_coll%C3%A8ge_de_Tours),_Parisiis_fundati._Edita_M._Alexandro_Dupoirier,_primario,_Et._M._Petro_Pepin,_procuratore.jpg"
                                >Collège de Tours (1333-1763 ; Paris) et
                                Thiboust, Claude-Louis (1667-1737), imprimeur.</a
                            >,
                            <a
                                href="https://creativecommons.org/licenses/by-sa/4.0"
                                >CC BY-SA 4.0</a
                            >, via Wikimedia Commons
                        </li>

                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:Question_book-4.svg"
                                >Tkgd2007</a
                            >,
                            <a
                                href="http://creativecommons.org/licenses/by-sa/3.0/"
                                >CC BY-SA 3.0</a
                            >, via Wikimedia Commons
                        </li>

                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:K%C3%BCken_(10564766284).jpg"
                                >Dirk Vorderstraße</a
                            >,
                            <a
                                href="https://creativecommons.org/licenses/by/2.0"
                                >CC BY 2.0</a
                            >, via Wikimedia Commons
                        </li>

                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:2013_Stammtisch_sign_Munich_pub.jpg"
                                >Takeaway</a
                            >,
                            <a
                                href="https://creativecommons.org/licenses/by-sa/3.0"
                                >CC BY-SA 3.0</a
                            >, via Wikimedia Commons
                        </li>

                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:Public_Market_(5820690638).jpg"
                                >Atomic Taco from Seattle, WA, USA</a
                            >,
                            <a
                                href="https://creativecommons.org/licenses/by-sa/2.0"
                                >CC BY-SA 2.0</a
                            >, via Wikimedia Commons
                        </li>
                    </ul>
                </div>
            </AccordionItem>

            <AccordionItem>
                {#snippet header()}Offenlegung{/snippet}

                <div class="text-xs">
                    <p>
                        <b
                            >Informationen und Offenlegung gemäß &sect; 25
                            MedienG, &sect;5 (1) ECG &sect; 63 GewO und &sect;
                            14 UGB</b
                        >
                    </p>
                    <p>
                        <b>Betreiber der Webseite:</b> Erneuerbare-Energie-Gemeinschaft
                        ISCHLSTROM
                    </p>
                    <p>
                        <b>Anschrift:</b> Faschlweg 39, 4820, Bad Ischl, Österreich
                    </p>
                    <p>
                        <b>ZVR-Zahl:</b> 1915125185 <br />
                        <b>Gewerbeaufsichtbehörde:</b>
                        Bezirkshauptmannschaft Gmunden
                    </p>
                    <p>
                        <b>Kontaktdaten:</b> <br />
                        Email: info@ischlstrom.org
                    </p>

                    <p>
                        <b>Anwendbare Rechtsvorschrift:</b> www.ris.bka.gv.at
                    </p>
                    <p>
                        <b>Online Streitbeilegung:</b> Verbraucher mit einer Niederlassung
                        in Österreich oder einem sonstigen Vertragsstaat der ODR-VO,
                        haben die Möglichkeit bei Problemen hinsichtlich des entgeltlichen
                        Kaufs von Waren oder Dienstleistungen die Online-Streitbelegung
                        der Europäischen Kommission über folgende Plattform in Anspruch
                        zu nehmen https://ec.europa.eu/consumers/odr
                    </p>
                    <p>
                        <b>Urheberrecht:</b> Die auf dieser Webseite zur Verfügung
                        gestellten Inhalte unterliegen, soweit dies rechtlich möglich
                        ist, diversen Schutzrechten (z.B dem Urheberrecht). Eine
                        Verwendung oder Verbreitung von bereitgestelltem Material,
                        bedarf der schriftlichen Zustimmung des Webseitenbetreibers.
                    </p>
                    <p>
                        <b>Haftungsausschluss:</b> Der Betreiber dieser Webseite
                        hat alle Inhalte sowie ausgehende Links mit
                        größtmöglichem Sorgfaltsmaßstab kontrolliert und
                        ausgewählt. Trotzdem wird keine Haftung für den Inhalt
                        externer Webseiten übernommen. Für diesen ist
                        ausschließlich deren jeweiliger Betreiber
                        verantwortlich. Für den Fall, dass Sie auf ausgehende
                        Links aufmerksam werden, welche auf eine Seite mit
                        rechtswidriger Tätigkeit oder rechtswidrigem Inhalt
                        verweisen, ersuchen wir um entsprechenden Hinweis an die
                        obig angeführte Email-Adresse, um betroffene Inhalt
                        umgehend nach § 17 (2) ECG zu entfernen. <br /> Die Urheberrechte
                        Dritter werden vom Betreiber dieser Webseite mit größter
                        Sorgfalt beachtet. Sollten Sie auf eine Urheberrechtsverletzung
                        aufmerksam werden, ersuchen wir auch um einen entsprechenden
                        Hinweis. Bei Bekanntwerden derartiger Rechtsverletzungen
                        wird der Webseitenbetreiber den betroffenen Inhalt umgehend
                        entfernen.
                    </p>
                    <p>
                        Die von uns eingesetzten Dienstleister und
                        Auftragsverarbeiter sind in unserer
                        <a class="underline" href="/datenschutz"
                            >Datenschutzerklärung</a
                        > angeführt.
                    </p>
                </div>
            </AccordionItem>

        </Accordion>
    </Card>
</div>

<div class="flex place-content-center mt-4">
    <Fab href="/" label="Zurück zum Start" />
</div>
