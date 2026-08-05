<script>
    import Fab from "$lib/Fab.svelte";
    import { Blockquote, Heading, Hr, List, Li } from "flowbite-svelte";

    let { data } = $props();

    /** @param {number} kwh */
    const formatMwh = (kwh) =>
        (kwh / 1000).toLocaleString("de-AT", { maximumFractionDigits: 0 });

    // Kennzahlen nur anzeigen, wenn sie wirklich vorliegen
    let tiles = $derived.by(() => {
        /** @type {{value: string, label: string}[]} */
        const result = [];
        if (data.memberCount) {
            result.push({
                value: data.memberCount.toLocaleString("de-AT"),
                label: "Mitglieder in der Gemeinschaft",
            });
        }
        if (data.selfUseKwh) {
            result.push({
                value: `${formatMwh(data.selfUseKwh)} MWh`,
                label: data.firstYear
                    ? `Sonnenstrom seit ${data.firstYear} innerhalb der Gemeinschaft genutzt`
                    : "Sonnenstrom innerhalb der Gemeinschaft genutzt",
            });
        }
        if (data.ibm?.plants) {
            result.push({
                value: data.ibm.plants.toLocaleString("de-AT"),
                label:
                    data.ibm.plants === 1
                        ? "Batterie macht schon mit"
                        : "Batterien machen schon mit",
            });
        }
        if (data.ibm?.capacity_kwh) {
            result.push({
                value: `${data.ibm.capacity_kwh.toLocaleString("de-AT")} kWh`,
                label: "gemeinsame Speicherkapazität im Batteriemanagement",
            });
        }
        return result;
    });
</script>

<svelte:head>
    <title>ISCHLSTROM - Batteriemanagement (IBM)</title>
    <meta
        name="description"
        content="Das ISCHLSTROM Batteriemanagement: Heimspeicher unserer Mitglieder versorgen die Energiegemeinschaft am Abend mit Sonnenstrom."
    />
</svelte:head>

<div class="text-center">
    <Heading tag="h2" class="text-primary-600 mt-8">
        Das ISCHLSTROM Batteriemanagement
    </Heading>
</div>

<div class="max-w-xl m-auto justify-center">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl" class="text-gray-900">
            Ihre Batterie versorgt die Nachbarschaft, wenn die Sonne nicht
            scheint
        </Blockquote>
        <figcaption class="flex justify-center items-center mt-6 space-x-3">
            <div
                class="flex items-center divide-x-2 divide-gray-500 dark:divide-gray-700"
            >
                <cite class="pr-3 font-medium text-gray-900 dark:text-white"
                    >Tagsüber laden</cite
                >
                <cite
                    class="pl-3 text-lg font-bold text-gray-500 dark:text-gray-400"
                    >am Abend teilen</cite
                >
            </div>
        </figcaption>
    </figure>
</div>

<article
    class="max-w-2xl mx-auto mt-12 px-4 text-gray-700 dark:text-gray-400 leading-relaxed"
>
    <section>
        <Heading
            tag="h3"
            class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4"
        >
            Worum geht es?
        </Heading>
        <p class="mb-4">
            Untertags erzeugen die Photovoltaikanlagen unserer Mitglieder oft
            mehr Strom, als die Gemeinschaft gerade braucht. Am Abend ist es
            umgekehrt: Die Sonne ist weg, aber in den Haushalten wird gekocht,
            gewaschen und ferngesehen. Dann muss Strom von außerhalb der
            Gemeinschaft zugekauft werden.
        </p>
        <p class="mb-4">
            Viele Mitglieder haben aber einen Heimspeicher, der am Abend noch
            gut gefüllt ist. Genau hier setzt das ISCHLSTROM Batteriemanagement
            (kurz IBM) an: Was die eigene Batterie am Abend übrig hat, gibt sie
            an die Gemeinschaft weiter. So bleibt der Sonnenstrom aus Bad Ischl
            in Bad Ischl, statt dass wir ihn von weit her zukaufen.
        </p>
        <p class="mb-4 font-medium text-gray-900 dark:text-white">
            Der eigene Haushalt hat dabei immer Vorrang. Die Batterie lädt wie
            bisher ausschließlich aus der eigenen PV-Anlage, nie aus dem Netz
            und nie von anderen Mitgliedern. Ein Mindest-Ladestand bleibt
            immer in der Batterie.
        </p>
    </section>

    <Hr divClass="my-10" />

    <section>
        <Heading
            tag="h3"
            class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4"
        >
            Wie funktioniert das?
        </Heading>
        <p class="mb-4">
            Neben Ihrem Wechselrichter kommt ein kleiner Computer dazu, etwa so
            groß wie eine Zigarettenschachtel. Er schaut auf die
            Wettervorhersage und darauf, wie es der Gemeinschaft gerade geht,
            und entscheidet dann zweimal am Tag:
        </p>
        <List class="mb-4 ml-4 space-y-2">
            <Li>
                <strong>Am Vormittag:</strong> Wenn ein sonniger Tag bevorsteht,
                wartet die Batterie mit dem Laden kurz, bis die morgendliche
                Verbrauchsspitze der Gemeinschaft direkt von der Sonne gedeckt
                ist. Voll wird sie an so einem Tag trotzdem.
            </Li>
            <Li>
                <strong>Am Abend:</strong> Sobald die Gemeinschaft mehr
                verbraucht, als sie erzeugt, beginnt die Batterie behutsam
                einzuspeisen{data.eveningCrossover
                    ? ` (aktuell ist das gegen ${data.eveningCrossover} Uhr so weit)`
                    : ""}. Die Leistung richtet sich nach der Größe der
                Batterie, damit sie über den Abend reicht.
            </Li>
        </List>
        <p class="mb-4">
            Sie selbst müssen nichts tun. Ein Hauptschalter bleibt aber immer
            in Ihrer Hand: Sie können das Batteriemanagement jederzeit
            ausschalten oder für ein paar Tage pausieren, zum Beispiel wenn
            Besuch im Haus ist und Sie die Batterie selbst brauchen.
        </p>
    </section>

    <Hr divClass="my-10" />

    {#if tiles.length > 0}
        <section>
            <Heading
                tag="h3"
                class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4"
            >
                ISCHLSTROM in Zahlen
            </Heading>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {#each tiles as tile}
                    <div
                        class="rounded-lg border border-gray-200 dark:border-gray-700 p-5 text-center"
                    >
                        <p
                            class="text-3xl font-bold text-primary-600 dark:text-primary-500"
                        >
                            {tile.value}
                        </p>
                        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {tile.label}
                        </p>
                    </div>
                {/each}
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
                Die Zahlen kommen direkt aus unseren Betriebsdaten und ändern
                sich laufend.
            </p>
        </section>

        <Hr divClass="my-10" />
    {/if}

    <section>
        <Heading
            tag="h3"
            class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4"
        >
            Was bedeutet das für Sie?
        </Heading>
        <p class="mb-4">
            Um ehrlich zu sein: Reich wird damit niemand, und das ist auch
            nicht das Ziel. Es geht darum, den Sonnenstrom, der ohnehin da
            ist, dorthin zu bringen, wo er gerade gebraucht wird.
        </p>
        <List class="mb-4 ml-4 space-y-2">
            <Li>
                Für den Strom, den Ihre Batterie am Abend und in der Nacht
                einspeist, bekommen Sie <strong>9,5 Cent pro kWh</strong>,
                deutlich mehr als die übliche Einspeisevergütung untertags.
            </Li>
            <Li>
                Ihre Batterie wird sinnvoller genutzt: Statt morgens schon um
                neun voll zu sein und den Rest des Tages nichts zu tun,
                arbeitet sie dann, wenn sie der Gemeinschaft wirklich hilft.
            </Li>
            <Li>
                Die Gemeinschaft muss am Abend weniger Strom zukaufen, und
                Mitglieder ohne eigene Anlage bekommen auch nach
                Sonnenuntergang Sonnenstrom aus der Nachbarschaft.
            </Li>
        </List>
        <p class="mb-4">
            Die Hardware kostet einmalig etwa <strong>150 Euro</strong>.
            Laufende Kosten gibt es keine, und die Einrichtung übernehmen wir
            gemeinsam mit Ihnen.
        </p>
    </section>

    <Hr divClass="my-10" />

    <section>
        <Heading
            tag="h3"
            class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4"
        >
            Was brauche ich dafür?
        </Heading>
        <List class="mb-4 ml-4 space-y-2">
            <Li>
                Eine PV-Anlage mit Batteriespeicher. Derzeit unterstützen wir
                Wechselrichter von <strong>Fronius</strong> (GEN24), weitere
                Hersteller sind in Vorbereitung.
            </Li>
            <Li>Internet im Haus (WLAN oder Netzwerkkabel).</Li>
            <Li>Die Mitgliedschaft bei ISCHLSTROM.</Li>
        </List>
        <p class="mb-4">
            Sie sind unsicher, ob Ihre Anlage geeignet ist? Schreiben Sie uns
            einfach, wir schauen uns das gerne gemeinsam an.
        </p>
    </section>
</article>

<div class="flex place-content-center mt-12">
    <Fab label="Ich möchte mitmachen" href="/kontakt" target="_self" />
</div>

<div class="flex place-content-center mt-4">oder</div>

<div class="flex place-content-center mt-4">
    <Fab label="Mehr über ISCHLSTROM" href="/mitmachen" target="_self" />
</div>
