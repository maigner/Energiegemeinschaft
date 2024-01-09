<script>
    import Fab, { Label } from "@smui/fab";
    import Slider from "@smui/slider";
    import { Card, Heading, Radio } from "flowbite-svelte";


     /**
     * @type {{ competitors: { id: number; provider: string; name: string; price: any; }[]; selfUseRatio: any; }}
     */
      export let data;


    /**
     * @param {number} jahresverbrauch
     * @param {number} eigenverbrauchsquote
     * @param {{ euro_pro_jahr: { grundpreis: any; }; cent_pro_kwh: { arbeitspreis: number; }; }} tarifdetails
     * @param {any} strompreisbremse
     */
    function kosten_stromhaendler(
        jahresverbrauch,
        eigenverbrauchsquote,
        tarifdetails,
        strompreisbremse,
    ) {
        const fixkosten = tarifdetails.euro_pro_jahr.grundpreis;

        const eigenverbrauch = jahresverbrauch * eigenverbrauchsquote;
        const netzverbrauch = jahresverbrauch - eigenverbrauch;


        let verbrauchskosten;

        if (strompreisbremse) {
            //console.log("strompreisbremse");
            let reduzierter_arbeitspreis = Math.max(
                10,
                tarifdetails.cent_pro_kwh.arbeitspreis - 30.0,
            );
            //console.log(`reduzierter_arbeitspreis ${reduzierter_arbeitspreis}`);

            if (netzverbrauch > 2900) {
                let reduzierter_netzverbrauch = 2900;
                let unreduzierter_netzverbrauch = netzverbrauch - 2900; // rest

                verbrauchskosten =
                    reduzierter_arbeitspreis * reduzierter_netzverbrauch;

                verbrauchskosten +=
                    tarifdetails.cent_pro_kwh.arbeitspreis *
                    unreduzierter_netzverbrauch;

                verbrauchskosten = verbrauchskosten / 100.0;

            } else {
                // < 2900 zieht die Bremse voll
                verbrauchskosten =
                    (reduzierter_arbeitspreis * netzverbrauch) / 100.0; //EURO
            }
        } else {
            verbrauchskosten =
                (netzverbrauch * tarifdetails.cent_pro_kwh.arbeitspreis) /
                100.0; // EURO
        }

        //console.log("verbrauchskosten");
        //console.log(verbrauchskosten);

        return fixkosten + verbrauchskosten;
    }


    /**
     * @param {number} jahresverbrauch
     * @param {number} eigenverbrauchsquote
     * @param {{ euro_pro_jahr: { grundpreis: any; entgelt_messleistungen: any; }; cent_pro_kwh: { verbrauchspreis: number; netzverlustentgeld: number; }; }} tarifdetails
     */
    function kosten_netzbetreiber(
        jahresverbrauch,
        eigenverbrauchsquote,
        tarifdetails,
    ) {
        let fixkosten = tarifdetails.euro_pro_jahr.grundpreis;
        fixkosten += tarifdetails.euro_pro_jahr.entgelt_messleistungen;

        const eigenverbrauch = jahresverbrauch * eigenverbrauchsquote;
        const netzverbrauch = jahresverbrauch - eigenverbrauch;

        // unreduziert
        let netzkosten =
            (tarifdetails.cent_pro_kwh.verbrauchspreis * netzverbrauch) / 100.0;
        netzkosten +=
            (tarifdetails.cent_pro_kwh.netzverlustentgeld * netzverbrauch) /
            100.0;

        // reduziert um 28%
        const reduktion = 0.28;
        let netzkosten_reduziert =
            (tarifdetails.cent_pro_kwh.verbrauchspreis *
                eigenverbrauch *
                (1.0 - reduktion)) /
            100.0;
        netzkosten_reduziert +=
            (tarifdetails.cent_pro_kwh.netzverlustentgeld *
                eigenverbrauch *
                (1.0 - reduktion)) /
            100.0;

        return fixkosten + netzkosten + netzkosten_reduziert;
    }

    /**
     * @param {number} jahresverbrauch
     * @param {number} eigenverbrauchsquote
     */
    function get_kosten_eeg(jahresverbrauch, eigenverbrauchsquote) {
        // console.log("Aus der EEG können", jahresverbrauch * eigenverbrauchsquote, "kWh bezogen werden");
        const stromkosten =
            (jahresverbrauch * eigenverbrauchsquote * 11.0) / 100.0; // EURO
        const mitgliedsbeitrag = 20.0;
        return stromkosten + mitgliedsbeitrag;
    }

    /**
     * @param {number} jahresverbrauch
     * @param {{ power: { euro_pro_jahr: { grundpreis: any; }; cent_pro_kwh: { arbeitspreis: number; }; }; network: { euro_pro_jahr: { grundpreis: any; entgelt_messleistungen: any; }; cent_pro_kwh: { verbrauchspreis: number; netzverlustentgeld: number; }; }; }} tarifdetails
     * @param {any} strompreisbremse
     */
    function get_kosten_ohne_eeg(
        jahresverbrauch,
        tarifdetails,
        strompreisbremse,
    ) {
        const stromkosten_ohne_eeg_netto = kosten_stromhaendler(
            jahresverbrauch,
            0,
            tarifdetails.power,
            strompreisbremse,
        );

        const netzkosten_ohne_eeg_netto = kosten_netzbetreiber(
            jahresverbrauch,
            0,
            tarifdetails.network,
        );


        const kosten_ohne_eeg_netto =
            stromkosten_ohne_eeg_netto + netzkosten_ohne_eeg_netto;
        const kosten_ohne_eeg = kosten_ohne_eeg_netto * 1.2; // 20% USt

        return kosten_ohne_eeg;
    }

    /**
     * @param {number} jahresverbrauch
     * @param {number} eigenverbrauchsquote
     * @param {{ power: { euro_pro_jahr: { grundpreis: any; }; cent_pro_kwh: { arbeitspreis: number; }; }; network: { euro_pro_jahr: { grundpreis: any; entgelt_messleistungen: any; }; cent_pro_kwh: { verbrauchspreis: number; netzverlustentgeld: number; }; }; }} tarifdetails
     * @param {any} strompreisbremse
     */
    function get_kosten_mit_eeg(
        jahresverbrauch,
        eigenverbrauchsquote,
        tarifdetails,
        strompreisbremse,
    ) {
        const stromkosten_mit_eeg_netto = kosten_stromhaendler(
            jahresverbrauch,
            eigenverbrauchsquote,
            tarifdetails.power,
            strompreisbremse,
        );

        const netzkosten_mit_eeg_netto = kosten_netzbetreiber(
            jahresverbrauch,
            eigenverbrauchsquote,
            tarifdetails.network,
        );

        const kosten_mit_eeg_netto =
            stromkosten_mit_eeg_netto + netzkosten_mit_eeg_netto;

        const kosten_mit_eeg = kosten_mit_eeg_netto * 1.2;

        return kosten_mit_eeg;
    }

    /**
     * @param {number} jahresverbrauch
     * @param {number} eigenverbrauchsquote
     * @param {{ power: { euro_pro_jahr: { grundpreis: any; }; cent_pro_kwh: { arbeitspreis: number; }; } | { euro_pro_jahr: { grundpreis: any; }; cent_pro_kwh: { arbeitspreis: number; }; }; network: { euro_pro_jahr: { grundpreis: any; entgelt_messleistungen: any; }; cent_pro_kwh: { verbrauchspreis: number; netzverlustentgeld: number; }; } | { euro_pro_jahr: { grundpreis: any; entgelt_messleistungen: any; }; cent_pro_kwh: { verbrauchspreis: number; netzverlustentgeld: number; }; }; }} tarifdetails
     * @param {boolean} strompreisbremse
     */
    function ersparnis(
        jahresverbrauch,
        eigenverbrauchsquote,
        tarifdetails,
        strompreisbremse,
    ) {

        const kosten_ohne_eeg = get_kosten_ohne_eeg(
            jahresverbrauch,
            tarifdetails,
            strompreisbremse,
        );

        const kosten_mit_eeg = get_kosten_mit_eeg(
            jahresverbrauch,
            eigenverbrauchsquote,
            tarifdetails,
            strompreisbremse,
        );

        const kosten_eeg_netto = get_kosten_eeg(
            jahresverbrauch,
            eigenverbrauchsquote,
        );

        const kosten_eeg_gesamt = kosten_mit_eeg + kosten_eeg_netto;

        return kosten_ohne_eeg - kosten_eeg_gesamt;
    }

    // first one by default
    let providerIndex = 0;
    let price = data.competitors[providerIndex].price;
    let selfUseRatio = data.selfUseRatio;
    let totalConsumptionKWhPerYear = 3500;
    let savingsEuroPerYear = 0;
    let radioGroupStrompreisbremse = 1;

    $: {
        price = data.competitors[providerIndex].price;
        savingsEuroPerYear = ersparnis(
            totalConsumptionKWhPerYear,
            selfUseRatio,
            price,
            radioGroupStrompreisbremse === 1 ? true : false,
        );
    }


</script>


<div class="text-center">
    <Heading tag="h1" class="text-primary-800 mt-8">11 cent FIX</Heading>
</div>

<div class="flex justify-center">
    <Card class="m-2 text-center max-w-3xl text-gray-900 " size="xl">
        Sparen Sie mit ISCHL STROM jedes Jahr bis zu

        <Heading tag="h2" class="text-primary-800 mt-8">
            {Math.round(savingsEuroPerYear)} EURO
        </Heading>


        <p class="mb-4 font-semibold mt-8">Ihr aktueller Stromanbieter</p>
        <ul
            class="mb-6 items-center w-full rounded-lg border border-gray-200 sm:flex dark:bg-gray-800 dark:border-gray-600 divide-x rtl:divide-x-reverse divide-gray-200 dark:divide-gray-600"
        >
            {#each data.competitors as competitor (competitor.id)}
                <li class="w-full">
                    <Radio
                        bind:group={providerIndex}
                        value={competitor.id}
                        class="p-3"
                        >{competitor.provider}: {competitor.name}</Radio
                    >
                </li>
            {/each}
        </ul>

        <ul
            class="mb-6 items-center w-full rounded-lg border border-gray-200 sm:flex dark:bg-gray-800 dark:border-gray-600 divide-x rtl:divide-x-reverse divide-gray-200 dark:divide-gray-600"
        >
            <li class="w-full">
                <Radio
                    bind:group={radioGroupStrompreisbremse}
                    value={1}
                    class="p-3">MIT Strompreisbremse</Radio
                >
            </li>
            <li class="w-full">
                <Radio
                    bind:group={radioGroupStrompreisbremse}
                    value={0}
                    class="p-3">OHNE Strompreisbremse</Radio
                >
            </li>
        </ul>

        Bei einem Jahresverbrauch von {totalConsumptionKWhPerYear} kWh
        <Slider
            bind:value={totalConsumptionKWhPerYear}
            min={3000}
            max={5000}
            step={100}
        />

        und einem EEG-Anteil von {(selfUseRatio * 100).toFixed(0)}%
        <Slider bind:value={selfUseRatio} min={0.1} max={0.5} step={0.01} />

        <div class="flex place-content-center mt-6">
            <Fab extended href="/mitmachen" color="primary">
                <Label>Jetzt Mitmachen</Label>
            </Fab>
        </div>
    </Card>
</div>
