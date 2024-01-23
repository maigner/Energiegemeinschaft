<script>
    import { Card, Heading } from "flowbite-svelte";
    import { AccordionItem, Accordion } from "flowbite-svelte";
</script>

<div class="text-center">
    <Heading tag="h3" class="text-primary-800 mt-6">Impressum</Heading>
</div>

<div class="flex place-content-center">
    <Card class="m-2 max-w-3xl" size="xl">
        <Accordion class="w-80">
            <AccordionItem open>
                <span slot="header">Verantwortlich für den Inhalt</span>

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

                <p class="text-gray-500 dark:text-gray-400">
                    
                </p>
            </AccordionItem>
            <AccordionItem>
                <span slot="header">Datenschutz</span>
                <p class="mb-2 text-gray-500 dark:text-gray-400">
                    Wir sammeln keine unnötigen Daten.
                </p>
                <p class="mb-2 text-gray-500 dark:text-gray-400">
                    Wir geben keine Daten weiter.
                </p>
                <p class="mb-2 text-gray-500 dark:text-gray-400">
                    Wir achten Ihre Privatspäre.
                </p>
                
            </AccordionItem>

            <AccordionItem>
                <span slot="header">Technische Anprechpartnerin</span>

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

                <p class="text-gray-500 dark:text-gray-400">
                    
                </p>
            </AccordionItem>

            <AccordionItem>
                <span slot="header">Bildquellen</span>

                <div class="text-xs text-gray-500 dark:text-gray-400">
                    <ul>
                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:Slimme_meters_van_Enexis,_Oude_Pekela_(2018)_01.jpg"
                                >Donald Trung Quoc Don (Chữ Hán: 徵國單) - Wikimedia
                                Commons.</a
                            >,<br />
                            <a href="https://creativecommons.org/licenses/by-sa/4.0"
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
                            <a href="https://creativecommons.org/licenses/by-sa/3.0"
                                >CC BY-SA 3.0</a
                            >, via Wikimedia Commons
                        </li>
                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:%22Miteinander-Weg%22_in_Gilching.png"
                                >XoMEoX</a
                            >,
                            <a href="https://creativecommons.org/licenses/by/4.0"
                                >CC BY 4.0</a
                            >, via Wikimedia Commons
                        </li>
                        <li>
                            <a
                                href="https://commons.wikimedia.org/wiki/File:Elbe_Parey-Polte_03.jpg"
                                >Georgfotoart</a
                            >,
                            <a href="https://creativecommons.org/licenses/by-sa/4.0"
                                >CC BY-SA 4.0</a
                            >, via Wikimedia Commons
                        </li>
                    </ul>
                </div>
                
            </AccordionItem>
        </Accordion>

       
    </Card>
</div>
