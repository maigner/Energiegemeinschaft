<script>
    import Fab from "$lib/Fab.svelte";
    import { Blockquote, Heading, Hr, List, Li } from "flowbite-svelte";

    const sources = [
        {
            label: "Koordinationsstelle: Änderungen für bestehende Energiegemeinschaften",
            href: "https://energiegemeinschaften.gv.at/aenderungen-fuer-bestehende-energiegemeinschaften/",
        },
        {
            label: "Koordinationsstelle: FAQs zum ElWG",
            href: "https://energiegemeinschaften.gv.at/faqs-zum-elwg/",
        },
        {
            label: "Koordinationsstelle: Die neue gemeinsame Energienutzung",
            href: "https://energiegemeinschaften.gv.at/gemeinsame-energienutzung/",
        },
        {
            label: "Koordinationsstelle: Neue rechtliche Grundlagen (ElWG)",
            href: "https://energiegemeinschaften.gv.at/rechtliche-grundlagen-elwg/",
        },
    ];
</script>

<svelte:head>
    <title>ISCHLSTROM - Neues Stromgesetz (ElWG)</title>
</svelte:head>

<div class="text-center">
    <Heading tag="h2" class="text-primary-600 mt-8">
        Das neue Stromgesetz (ElWG)
    </Heading>
</div>

<div class="max-w-xl m-auto justify-center">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl" class="text-gray-900">
            Was sich ab 1. Oktober 2026 für unsere Energiegemeinschaft ändert
        </Blockquote>
        <figcaption class="flex justify-center items-center mt-6 space-x-3">
            <div
                class="flex items-center divide-x-2 divide-gray-500 dark:divide-gray-700"
            >
                <cite class="pr-3 font-medium text-gray-900 dark:text-white"
                    >Gut informiert</cite
                >
                <cite
                    class="pl-3 text-lg font-bold text-gray-500 dark:text-gray-400"
                    >statt überrascht</cite
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
            Was ändert sich ab 1. Oktober 2026?
        </Heading>
        <p class="mb-4">
            Das neue Elektrizitätswirtschaftsgesetz (ElWG) löst die bisherigen
            Regeln für Energiegemeinschaften aus EAG und ElWOG ab. Am 1.
            Oktober 2026 werden alle bestehenden Energiegemeinschaften, also
            auch ISCHLSTROM, automatisch in das neue System der "gemeinsamen
            Energienutzung" übergeführt. Eine Neugründung ist nicht notwendig.
        </p>
        <p class="mb-4 font-medium text-gray-900 dark:text-white">
            Die wichtigste Botschaft für unsere Mitglieder: Im Alltag ändert
            sich zunächst nichts. Die Gemeinschaft bleibt bestehen, die
            Teilnahme läuft unverändert weiter, und der eigene
            Stromliefervertrag bleibt wie bisher aufrecht.
        </p>
        <p class="mb-4">
            Neu sind vor allem zusätzliche Transparenzpflichten für
            Energiegemeinschaften sowie eine Reihe neuer Möglichkeiten, von
            denen auch ISCHLSTROM profitieren kann.
        </p>
    </section>

    <Hr divClass="my-10" />

    <section>
        <Heading
            tag="h3"
            class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4"
        >
            Was bedeutet das für unsere Mitglieder?
        </Heading>
        <p class="mb-4">
            Das ElWG sieht für größere Energiegemeinschaften (ab 100 kW
            gemeinsam genutzter Leistung) sogenannte Lieferantenpflichten vor.
            Sie sollen sicherstellen, dass Mitglieder ähnlich gut informiert
            werden wie Kunden eines klassischen Stromlieferanten:
        </p>
        <List class="mb-4 ml-4 space-y-2">
            <Li>
                Ein leicht verständliches <strong>Informationsblatt</strong>
                mit den wesentlichen Vertragsinhalten, das vor dem Beitritt
                bereitgestellt wird.
            </Li>
            <Li>
                <strong>Allgemeine Lieferbedingungen (ALB)</strong>, die die
                Belieferung innerhalb der Gemeinschaft regeln. Änderungen
                müssen mindestens ein Monat im Voraus schriftlich und mit
                Begründung angekündigt werden.
            </Li>
            <Li>
                Eine <strong>transparente, kostenfreie Abrechnung</strong>
                mindestens einmal jährlich, auf Wunsch auch monatlich. Auf
                Nachfrage wird die Berechnung der Rechnung erläutert.
            </Li>
        </List>
        <p class="mb-4">
            Für unsere Mitglieder bedeutet das keine neuen Pflichten, sondern
            mehr Rechte und mehr Transparenz. Wir bereiten die erforderlichen
            Unterlagen vor und veröffentlichen sie hier, sobald die
            offiziellen Mustervorlagen der Koordinationsstelle verfügbar sind.
        </p>
    </section>

    <Hr divClass="my-10" />

    <section>
        <Heading
            tag="h3"
            class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4"
        >
            Neue Möglichkeiten für die Gemeinschaft
        </Heading>
        <p class="mb-4">
            Das neue Gesetz bringt nicht nur Pflichten, sondern eröffnet
            Energiegemeinschaften auch neue Chancen:
        </p>
        <List class="mb-4 ml-4 space-y-2">
            <Li>
                <strong>Mehrfachteilnahme:</strong> Eine Anlage kann künftig
                an bis zu fünf gemeinsamen Energienutzungen gleichzeitig
                teilnehmen.
            </Li>
            <Li>
                <strong>Gemeinschaftsspeicher:</strong> Neue Messkonzepte der
                Regulierungsbehörde ermöglichen gemeinsam genutzte
                Stromspeicher, die auch aus dem Netz geladen werden dürfen.
            </Li>
            <Li>
                <strong>Gemeinden und größere Betriebe:</strong>
                Gebietskörperschaften können leichter teilnehmen und müssen
                dabei mindestens 10% ihrer erzeugten Strommenge
                schutzbedürftigen Haushalten oder karitativen Einrichtungen
                zur Verfügung stellen. Große Unternehmen dürfen mit Anlagen
                bis 6 MW mitmachen.
            </Li>
            <Li>
                <strong>Flexibler Anlagenbetrieb:</strong> Anlagen dürfen
                künftig auch Dritten gehören oder von Dritten betreut werden,
                solange die Gemeinschaft die Weisungsgewalt behält.
            </Li>
        </List>
    </section>

    <Hr divClass="my-10" />

    <section>
        <Heading
            tag="h3"
            class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4"
        >
            Woran wir gerade arbeiten
        </Heading>
        <p class="mb-4">
            Einige Details des neuen Gesetzes sind noch offen. Die
            Mustervorlagen für Informationsblatt und Allgemeine
            Lieferbedingungen sowie die technischen Regeln für Messkonzepte
            und die Marktprozesse der Netzbetreiber werden erst im Laufe des
            Jahres 2026 veröffentlicht.
        </p>
        <p class="mb-4">Bis zum 1. Oktober 2026 werden wir:</p>
        <List class="mb-4 ml-4 space-y-2">
            <Li>
                unsere Statuten und Vereinbarungen auf das neue Gesetz hin
                prüfen und bei Bedarf anpassen,
            </Li>
            <Li>
                entscheiden, wie wir die neue Rolle des "Organisators"
                ausgestalten, der die Abwicklung der Gemeinschaft übernimmt,
            </Li>
            <Li>
                Informationsblatt und Allgemeine Lieferbedingungen auf Basis
                der offiziellen Mustervorlagen erstellen und hier
                veröffentlichen.
            </Li>
        </List>
        <p class="mb-4">
            Über alle Schritte informieren wir laufend auf dieser Seite und
            bei unseren Stammtischen.
        </p>
    </section>

    <Hr divClass="my-10" />

    <section>
        <Heading
            tag="h3"
            class="text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-4"
        >
            Offizielle Quellen
        </Heading>
        <List class="ml-4 space-y-1">
            {#each sources as source}
                <Li>
                    <a href={source.href} target="_blank">{source.label}</a>
                </Li>
            {/each}
        </List>
    </section>
</article>

<div class="flex place-content-center mt-12">
    <Fab label="Zu den häufigen Fragen" href="/faq" target="_self" />
</div>

<div class="flex place-content-center mt-4">oder</div>

<div class="flex place-content-center mt-4">
    <Fab label="Ich habe eine Frage dazu" href="/kontakt" target="_self" />
</div>
