<script>
    // @ts-nocheck

    import { Circle2 } from "svelte-loading-spinners";
    import Button, { Label } from "@smui/button";
    import Paper from "@smui/paper";
    import Fab from "@smui/fab";
    import { Icon } from "@smui/common";
    import { Input } from "@smui/textfield";
    import Card, { Content } from "@smui/card";
    import IconButton from "@smui/icon-button";
    import Dialog, { Title, Actions } from "@smui/dialog";
    import Textfield from "@smui/textfield";
    import CharacterCounter from "@smui/textfield/character-counter";
    import { onMount } from "svelte";

    let openDialogTextSyleCommand = false;
    let openDialogCurrentEvents = false;

    let clickedDialogSystemMessage;

    let inputReference = null;

    let inputValue = "";
    let isThinking = false;
    let isResponding = false;



    let token = "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";

    let textStyleCommand = `Du beantwortest Fragen zum Thema Energiegemeinschaft. Du gibts kurze Antworten.

`;

    let currentEvents = `Nutze folgendes FAQ um deine Antworten zu verbessern:

Frage: Wie kann ich der Energiegemeinschaft beitreten? 
Antwort: Klicken Sie einfach auf den Button Mitmachen

Frage: Wo findet das nächste Treffen statt?
Antwort: Wieder hier in der Gemeinde.

Frage: Was versteht man unter einem Aggregator?
Antwort: Als Aggregator wird jemand bezeichnet, der die erzeugte oder verbrauchte Energie mehrerer (vieler) Anlagen bündelt und am Energiemarkt handelt. Kleine Mengen können dadurch auf auf ein größeres, handelbares Volumen „skaliert“ werden, auch Energiegemeinschaften dürfen im Bereich der Aggregierung tätig sein.

Frage: Was ist ein Aufteilungsschlüssel?
Antwort: In einer Energiegemeinschaft/gemeinschaftlichen Erzeugungsanlage muss festgelegt werden, wie die erzeugte Energie zwischen den einzelnen Beteiligten aufgeteilt wird. Die Aufteilung kann entweder statische oder dynamische erfolgen. 

Frage: Zu welchem Umspannwerk gehört mein Netzanschluss ?

Antwort: Unsere Energiegemeinschaft ist dem Umspannwerk Lambach zugeordnet. Wenn sie wissen wollen ob sie dazugehören können sie das durch eine kurze Anmeldung im "Netto Tool" von Netz OÖ herausfinden. https://netto.netzooe.at/

Frage: Was sind Genossenschaftsanteile/Anteilscheine? 
Antwort: Mit dem Beitritt zu einer Genossenschaft muss man Genossenschaftsanteile/Anteilscheine erwerben. Bei uns ist das Mindesterfordernis 1 Schein = 100 €. Ein Anteilschein ist eine Stimme in der jährlichen Generalversammlung. Das Anteilscheinkapital verwendet die eGen als Eigenmittel, um sich zu finanzieren und sich gegenüber den Banken gut zu positionieren. Durch diese Eigenmittel aus Anteilscheinen ist die eGen unter anderem in der Lage, die Srompreise im Marktvergleich sehr günstig zu halten.  Beim Ausscheiden werden diese Scheine wie in der Satzung angegeben innerhalb einer Frist wieder zurückgezahlt. 

Frage: Wie bestätige ich die Teilnahme an der Energiegemeinschaft im eService Portal von Netz-OÖ ? 
Antwort:

Frage: Wie bestätige ich die Teilnahme an der Energiegemeinschaft im eService Portal von Netz-OÖ ?
Antwort: Im eService - Portal der Netz OÖ ( https://www.netzooe.at/) muss die Teilnahme an der Energiegemeinschaft unter "Datenfreighaben" bestätigt werden !
Durch drücken eines Häckchens wird die Freigabe bestätigt siehe Bilder unten.
Wenn sie im eService - Portal noch nicht angemeldet sind brauchen sie zum Anmelden die Zählernummer (am Gerät im Zählerkasten) die 33 stellige Zählpunktnummer AT003000..... und die Kundennummer von Netz OÖ. 

Frage: Ersetzt die EEG meinen bisherigen Stromanbieter? 
Antwort: Nein die EEG ist immer als zusätzlicher Stromlieferant zu sehen. Der bisherige Stromlieferant liefert Ihnen den Reststrom den die EEG nicht decken kann. Das gleiche gilt für Ihren Stromabnehmer der Ihren Überschussstrom abkauft. Falls die EEG Ihren eingespeisten Strom gerade nicht verbrauchen kann, wird dieser wie bisher an diesen Stromabnehmer verkauft. 

Frage: Kann ich die an die EEG gelieferte oder bezogene Strommenge selber kontrollieren? 
Antwort: Ja, im eService -  Portal der Netz OÖ ( https://eservice.netzooe.at/app/login) hat jerder Teilnehmer die Möglichkeit die von ihm an die EEG gelieferten oder von der EEG bezogenen Strommengen abzufragen. 

Frage: Wie erfolgen die Messung und Bilanzierung? 
Antwort: Der Netzbetreiber erhält sowohl die an einem Verbrauchszählpunkt gemessenen Werte als auch die durch eine Erzeugungsanlage der Energiegemeinschaft eingespeisten und dem Verbrauchszählpunkt zugeordneten Mengen und ermittelt daraus den Saldo je Zählpunkt. Die Werte werden auch den jeweiligen Lieferanten zur Verfügung gestellt. Die Bilanzierung unterliegt den allgemeinen gesetzlichen Vorgaben und Marktregeln. Für alle Anlagen gilt die Verpflichtung, die Zuteilung der Energie basierend auf Viertelstundenwerten vorzunehmen, z.B. Smart Meter mit Opt-in, und über den Grenzwerten gem. § 17 Abs 2 ElWOG 2010 durch Lastprofilzähler. Es müssen jedenfalls gemessene Viertelstundenwerte vorliegen! Damit können die Messwerte viertelstundenscharf erfasst und der Bilanzierung zugrunde gelegt werden. 

Frage: Wem werden die Netzgebühren verrechnet (dem/der Betreiber:in der Energiegemeinschaft oder dem einzelnen Mitglied)? 
Antwort: Die Netzgebühren werden wie bisher den jeweiligen Netzbenutzern verrechnet. Der Energiegemeinschaft selbst werden erst dann Netzgebühren verrechnet, wenn sie über einen eigenen Zählpunkt verfügt (z.B. Eigentümer einer Erzeugungsanlage ist). 

Frage: Gilt der Stromkostenzuschuss („Strompreisbremse“) auch für die Energie, die innerhalb einer Energiegemeinschaft erzeugt und verbraucht wird?
Antwort: Nein, der Stromkostenzuschuss ist ein Zuschuss zu den Kosten, die Haushaltskundinnen und Haushaltskunden aus einem Stromlieferungsvertrag entstehen. Der Bezug aus der Energiegemeinschaft wird vom Stromkostenzuschuss nicht berührt.

Wer an einer Energiegemeinschaft teilnimmt, bekommt in jeder Viertelstunde, in der er/sie Energie verbraucht und die Erzeugungsanlage(n) der Energiegemeinschaft Energie produzieren, einen Anteil dieser erzeugten Energiemenge zugewiesen. Der Netzbetreiber zieht den Anteil vom Messwert des Smart-Meters ab und übermittelt diesen Wert an den Energielieferanten, so ergibt sich der Restnetzbezug vom Energielieferanten. Für diesen Restnetzbezug kommt der Stromkostenzuschuss wie bei allen anderen Haushalten zur Anwendung. 

Frage:
Antwort:

Frage:
Antwort:

Frage:
Antwort:

`;

    let history = [
        {
            role: "Energiegemeinschaft",
            text: "Hallo! Wie kann ich Ihnen helfen?",
        },
    ];

    /**
     * @param {string} input
     */
    function decodeGptResponse(input) {
        let parts = input.split('"choices":');
        if (typeof parts[1] === "undefined") {
            console.log("split at choices failed");
            return "";
        }
        //console.log(parts[1]);
        parts = parts[1].split('"content":');
        if (typeof parts[1] === "undefined") {
            console.log("split at content failed");
            return "";
        }
        //console.log(parts[1]);
        parts = parts[1].split("}");
        //console.log(parts[0]);

        return parts[0].slice(1, -1).replaceAll('\\"', '"');
    }

    /**
     * @param {string} query
     */
    async function ask(query) {
        const apiUrl = "https://api.openai.com/v1/chat/completions";

        let chatbotResponse = { answer: "OK" };
        isThinking = true;

        currentResponse.text = "...";

        history = [
            ...history,
            {
                role: "User",
                text: query,
            },
        ];
        inputValue = "";

        //https://github.com/openai/openai-node/issues/18#issuecomment-1367607167
        const body = {
            model: "gpt-4",
            //model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: textStyleCommand + currentEvents,
                },
                { role: "user", content: query },
            ],
            temperature: 0.2,
            stream: true,
            //max_tokens: 128,
        };

        const fetchOptions = {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        };

        isResponding = true;
        fetch(apiUrl, fetchOptions).then(async (response) => {
            const r = response.body;
            if (!r) throw new Error("No response body");

            const d = new TextDecoder("utf8");
            const reader = r.getReader();
            let fullText = "";
            let firstRound = true;
            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    console.log("done");
                    break;
                } else {
                    const decodedString = d.decode(value);
                    //console.log(decodedString);

                    // we have 2 responses in the first read(). split them before parsing
                    if (firstRound) {
                        console.log("first round");
                        let responses = decodedString
                            .replaceAll("\n\n", "\n")
                            .split("\n");
                        for (const part of responses) {
                            if (part !== "") {
                                console.log(part);

                                fullText += decodeGptResponse(part);
                                currentResponse.text = fullText;
                            }
                        }

                        firstRound = false;
                        continue;
                    }

                    fullText += decodeGptResponse(decodedString);
                    currentResponse.text = fullText;

                    /*
                    try {
                        //fixes string not json-parseable otherwise
                        //console.log(JSON.parse(decodedString.slice(6)));

                        let delta = JSON.parse(decodedString.slice(6))
                            .choices[0].delta.content;
                        if (typeof delta !== "undefined")
                            fullText += delta;

                        currentResponse.text = fullText;
                    } catch (e) {
                        // the last line is data: [DONE] which is not parseable either, so we catch that.
                        console.log(e);
                        //console.log(fullText);
                    } finally {
                        //
                    }*/
                }
            }
            let latestResponse = {
                role: "Energiegemeinschaft",
                text: fullText,
            };

            history = [...history, latestResponse];
            isResponding = false;
            isThinking = false;
            //inputReference.focus();
            scrollBottom();
        });

        return chatbotResponse;
    }

    /**
     * @param {string} query
     */

    let currentResponse = {
        role: "Energiegemeinschaft",
        text: "...",
    };

    onMount(() => {
        inputReference.focus();
    });

    $: {
        if (inputReference !== null) {
            console.log("Focus");
            inputReference.focus();
        }
    }

    function scrollBottom() {
        var elem = document.getElementById("scrollcontainer");
        elem.scrollTop = elem.scrollHeight;
        console.log("scroll");
    }


</script>

<div id="scrollcontainer">
    <div>
        {#each history as item}
            <p>
                <Card>
                    <Content>
                        <strong>{item.role}:</strong>
                        {#each item.text
                            .replaceAll("\\n\\n", "\n")
                            .split("\n") as paragraph}
                            <p>
                                {paragraph}
                            </p>
                        {/each}
                    </Content>
                </Card>
            </p>
        {/each}
    </div>

    {#if isResponding === true}
        <p>
            <Card>
                <Content>
                    <strong>{currentResponse.role}</strong>:

                    {#each currentResponse.text
                        .replaceAll("\\n\\n", "\n")
                        .split("\n") as paragraph}
                        <p>
                            {paragraph}
                        </p>
                    {/each}
                </Content>
            </Card>
        </p>
    {/if}

    {#if isThinking === true}
        <div id="spinner">
            <Circle2 />
        </div>
    {/if}

    {#if isThinking === false}
        <div class="solo-container">
            <Paper class="solo-paper" elevation={6}>
                <Icon class="material-icons">edit</Icon>
                <Input
                    bind:value={inputValue}
                    bind:this={inputReference}
                    on:keydown={(event) => {
                        if (event.key === "Enter") {
                            // Do something with the inputValue
                            // console.log("Enter key pressed. Value:", inputValue);
                            ask(inputValue);
                        }
                    }}
                    placeholder=""
                    class="solo-input"
                />
            </Paper>
            <Fab
                on:click={() => {
                    ask(inputValue);
                }}
                color="primary"
                mini
                class="solo-fab"
            >
                <Icon class="material-icons">send</Icon>
            </Fab>
        </div>
    {/if}
</div>

<style>
    #spinner {
        display: flex;
        justify-content: center;
    }

    .solo-container {
        display: flex;
        justify-content: center;
        align-items: center;
    }
    * :global(.solo-paper) {
        display: flex;
        align-items: center;
        flex-grow: 1;
        /*max-width: 600px;*/
        margin-right: 12px;
        padding: 0 12px;
        height: 48px;
    }
    * :global(.solo-paper > *) {
        display: inline-block;
        margin: 0 12px;
    }
    * :global(.solo-input) {
        flex-grow: 1;
        color: var(--mdc-theme-on-surface, #000);
    }
    * :global(.solo-input::placeholder) {
        color: var(--mdc-theme-on-surface, #000);
        opacity: 0.6;
    }
    * :global(.solo-fab) {
        flex-shrink: 0;
    }
</style>
