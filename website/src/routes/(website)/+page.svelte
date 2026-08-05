<script>
    import Project from "$lib/Project.svelte";
    import Fab from "$lib/Fab.svelte";
    import { Blockquote, Heading, Progressbar } from "flowbite-svelte";
    import {
        SunOutline,
        BatteryOutline,
        ChartLineUpOutline,
        ScaleBalancedOutline,
    } from "flowbite-svelte-icons";

    let { data } = $props();

    /** @param {number} kwh */
    const formatMwh = (kwh) =>
        (kwh / 1000).toLocaleString("de-AT", { maximumFractionDigits: 0 });

    // Kennzahlen nur anzeigen, wenn sie wirklich vorliegen
    let tiles = $derived.by(() => {
        /** @type {{value: string, label: string, href: string}[]} */
        const result = [];
        if (data.memberCount) {
            result.push({
                value: data.memberCount.toLocaleString("de-AT"),
                label: "Mitglieder in der Gemeinschaft",
                href: "/mitmachen",
            });
        }
        if (data.selfUseKwh) {
            result.push({
                value: `${formatMwh(data.selfUseKwh)} MWh`,
                label: data.firstYear
                    ? `Sonnenstrom seit ${data.firstYear} innerhalb der Gemeinschaft genutzt`
                    : "Sonnenstrom innerhalb der Gemeinschaft genutzt",
                href: "/vorhersage",
            });
        }
        if (data.ibm?.plants) {
            result.push({
                value: data.ibm.plants.toLocaleString("de-AT"),
                label:
                    data.ibm.plants === 1
                        ? "Batterie im Batteriemanagement"
                        : "Batterien im Batteriemanagement",
                href: "/ibm",
            });
        }
        return result;
    });

    const activities = [
        {
            href: "/mitmachen",
            icon: SunOutline,
            title: "Sonnenstrom teilen",
            text: "Unsere Mitglieder teilen ihren PV-Überschuss innerhalb der Gemeinschaft. Mitmachen ist in wenigen Schritten erledigt.",
        },
        {
            href: "/ibm",
            icon: BatteryOutline,
            title: "Batteriemanagement",
            text: "Heimspeicher unserer Mitglieder versorgen die Nachbarschaft am Abend mit Sonnenstrom. Unser Ziel: durch die Nacht mit eigener Energie.",
        },
        {
            href: "/vorhersage",
            icon: ChartLineUpOutline,
            title: "Energieprognose",
            text: "Wie viel Strom die Gemeinschaft in den nächsten Tagen erzeugt und verbraucht, täglich neu berechnet und öffentlich einsehbar.",
        },
        {
            href: "/elwg",
            icon: ScaleBalancedOutline,
            title: "Neues Stromgesetz",
            text: "Was das neue Elektrizitätswirtschaftsgesetz für ISCHLSTROM bedeutet und wie wir es Schritt für Schritt umsetzen.",
        },
    ];
</script>

<svelte:head>
    <title>ISCHLSTROM - Energiegemeinschaft Bad Ischl</title>
    <meta
        name="description"
        content="ISCHLSTROM ist die Erneuerbare-Energie-Gemeinschaft in Bad Ischl: Mitglieder teilen ihren Sonnenstrom untereinander, fair und regional."
    />
</svelte:head>

<!-- Hero -->
<div class="max-w-xl m-auto justify-center">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl" class="text-gray-900">
            Energie aus Bad Ischl für Bad Ischl
        </Blockquote>
        <figcaption class="mt-6">
            <p class="text-gray-700 dark:text-gray-400">
                ISCHLSTROM ist die Erneuerbare-Energie-Gemeinschaft in Bad
                Ischl: Unsere Mitglieder teilen ihren Sonnenstrom
                untereinander, fair, regional und gemeinschaftlich
                organisiert.
            </p>
        </figcaption>
    </figure>
</div>

<div class="flex flex-wrap place-content-center gap-4 mt-6">
    <Fab label="Jetzt Mitmachen" href="/mitmachen" target="_self" />
    <Fab label="Unser Speicherziel" href="/ibm" target="_self" />
</div>

<!-- Live-Zahlen -->
{#if tiles.length > 0 || data.batteryGoal}
    <section class="max-w-4xl mx-auto mt-16 px-4">
        <div class="text-center">
            <Heading tag="h3" class="text-primary-600 mb-6">
                ISCHLSTROM in Zahlen
            </Heading>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {#each tiles as tile}
                <a
                    href={tile.href}
                    class="rounded-lg border border-gray-200 dark:border-gray-700 p-5 text-center hover:border-primary-600 dark:hover:border-primary-500"
                >
                    <p
                        class="text-3xl font-bold text-primary-600 dark:text-primary-500"
                    >
                        {tile.value}
                    </p>
                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {tile.label}
                    </p>
                </a>
            {/each}
            {#if data.batteryGoal}
                <a
                    href="/ibm"
                    class="rounded-lg border border-gray-200 dark:border-gray-700 p-5 text-center hover:border-primary-600 dark:hover:border-primary-500"
                >
                    <p
                        class="text-3xl font-bold text-primary-600 dark:text-primary-500"
                    >
                        {data.batteryGoal.progressPercent}%
                    </p>
                    <div class="mt-2">
                        <Progressbar
                            progress={data.batteryGoal.progressPercent}
                            size="h-2"
                        />
                    </div>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        des nächtlichen Strombedarfs aus Batterien gedeckt
                    </p>
                </a>
            {/if}
        </div>
        <p class="mt-3 text-sm text-center text-gray-500 dark:text-gray-400">
            Die Zahlen kommen direkt aus unseren Betriebsdaten und ändern sich
            laufend.
        </p>
    </section>
{/if}

<!-- Konditionen -->
<section class="max-w-4xl mx-auto mt-16 px-4">
    <div class="text-center">
        <Heading tag="h3" class="text-primary-600 mb-6">
            Unsere Konditionen
        </Heading>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
            class="rounded-lg border border-gray-200 dark:border-gray-700 p-5 text-center"
        >
            <p
                class="text-3xl font-bold text-primary-600 dark:text-primary-500"
            >
                9,5 Cent/kWh
            </p>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                bekommt, wer Sonnenstrom in die Gemeinschaft einspeist
            </p>
        </div>
        <div
            class="rounded-lg border border-gray-200 dark:border-gray-700 p-5 text-center"
        >
            <p
                class="text-3xl font-bold text-primary-600 dark:text-primary-500"
            >
                10 Cent/kWh
            </p>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                zahlt, wer Sonnenstrom aus der Gemeinschaft bezieht
            </p>
        </div>
        <div
            class="rounded-lg border border-gray-200 dark:border-gray-700 p-5 text-center"
        >
            <p
                class="text-3xl font-bold text-primary-600 dark:text-primary-500"
            >
                0 Euro
            </p>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Mitgliedsbeitrag seit 2026
            </p>
        </div>
    </div>
    <p class="mt-3 text-sm text-center text-gray-500 dark:text-gray-400">
        Beschlossen von der Generalversammlung, gültig seit 1.1.2026.
        Abgerechnet wird nur der Strom, der tatsächlich innerhalb der
        Gemeinschaft fließt.
    </p>
</section>

<!-- Was wir tun -->
<section class="max-w-4xl mx-auto mt-16 px-4">
    <div class="text-center">
        <Heading tag="h3" class="text-primary-600 mb-6">Was wir tun</Heading>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {#each activities as activity}
            <a
                href={activity.href}
                class="rounded-lg border border-gray-200 dark:border-gray-700 p-5 hover:border-primary-600 dark:hover:border-primary-500"
            >
                <div class="flex items-center gap-3 mb-2">
                    <activity.icon
                        class="w-6 h-6 text-primary-600 dark:text-primary-500"
                    />
                    <span
                        class="text-lg font-bold text-gray-900 dark:text-white"
                    >
                        {activity.title}
                    </span>
                </div>
                <p class="text-gray-700 dark:text-gray-400 leading-relaxed">
                    {activity.text}
                </p>
            </a>
        {/each}
    </div>
</section>

<!-- Wer wir sind -->
<section class="mt-16">
    <div class="text-center">
        <Heading tag="h3" class="text-primary-600 mb-6">Wer wir sind</Heading>
    </div>
    <div class="flex place-content-center">
        <Project img="/gruppenfoto.webp" showMore={false} title="Der Verein ISCHLSTROM">
            <div>
                <p class="mb-4">
                    ISCHLSTROM ist ein gemeinnütziger Verein: Menschen aus Bad
                    Ischl bündeln ihre Ressourcen und Fachkenntnisse, um
                    erneuerbarer Energie in der Region zum Durchbruch zu
                    verhelfen. Jedes Mitglied bestimmt mit.
                </p>
                <a
                    target="_blank"
                    href="https://ischlstrom-website-files-public.s3.eu-central-1.amazonaws.com/231025+Statuten+ISCHLSTROM+FINAL+nach+Pr%C3%BCfung+Vereinsbeh%C3%B6rde.pdf"
                >
                    Statuten des Vereins Erneuerbare-Energie-Gemeinschaft
                    ISCHLSTROM als pdf herunterladen</a
                >
            </div>
        </Project>
    </div>
</section>

<div class="flex place-content-center mt-8">
    <Fab label="Jetzt Mitmachen" href="/mitmachen" target="_self" />
</div>
