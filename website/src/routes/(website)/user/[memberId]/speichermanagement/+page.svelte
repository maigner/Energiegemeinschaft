<script>
    import { onMount } from "svelte";
    import { invalidateAll } from "$app/navigation";
    import { enhance } from "$app/forms";
    import {
        Heading,
        Card,
        Badge,
        Progressbar,
        Button,
        Checkbox,
        Input,
        Label,
        Indicator,
    } from "flowbite-svelte";
    import { describePhase } from "$lib/setupPhases";
    import { inverterLabel } from "$lib/inverters";
    import ConsentText from "./ConsentText.svelte";

    let { data, form } = $props();

    // Waehrend der Einrichtung meldet der Pi laufend Phasen; die Seite
    // holt sich den Stand alle 30 Sekunden.
    onMount(() => {
        const timer = setInterval(() => invalidateAll(), 30 * 1000);
        return () => clearInterval(timer);
    });

    /** @type {Record<number, boolean>} */
    let revealed = $state({});

    /** @param {{ ageSeconds: number | null }} plant */
    function online(plant) {
        return plant.ageSeconds !== null && plant.ageSeconds < 15 * 60;
    }

    /** @param {string | Date | null} d */
    function formatTime(d) {
        if (!d) return "-";
        return new Date(d).toLocaleString("de-AT", {
            timeZone: "Europe/Vienna",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    /**
     * Braucht das Profil ein Passwort am Wechselrichter? Beim Fronius GEN24
     * ja (Anmeldung an der Weboberflaeche, Benutzer "customer"); solange das
     * Profil noch nicht erkannt ist, wird das Feld sicherheitshalber gezeigt.
     * @param {string} type
     */
    function needsInverterPassword(type) {
        return !type || type === "fronius";
    }
</script>

<div class="text-center">
    <Heading tag="h4" class="text-primary-600 mt-2">Speichermanagement</Heading>
    <span class="text-primary-500 text-xs">{`${data.user.name}, ${data.user.street} ${data.user.hnr}`}</span>
</div>

<div class="max-w-2xl mx-auto p-4 space-y-4">
    {#if data.plants.length === 0}
        <Card class="max-w-none">
            <p class="text-gray-600 dark:text-gray-300">
                Für diesen Standort ist noch kein Speichermanagement
                eingerichtet. Wenn Sie eine Batterie haben und mitmachen
                möchten, melden Sie sich bei
                <a href="mailto:info@ischlstrom.org" class="underline">info@ischlstrom.org</a>.
            </p>
        </Card>
    {:else if !data.consent.granted}
        <!-- Einwilligung (DSGVO): ohne Zustimmung zum aktuellen Text keine
             Anlagendaten und keine Eingaben. -->
        <Card class="max-w-none">
            <p class="text-lg font-semibold dark:text-white mb-2">
                Ihre Einwilligung
            </p>
            {#if form?.consentRevoked || data.consent.revoked}
                <p class="text-sm text-yellow-700 dark:text-yellow-400 mb-3">
                    Sie haben Ihre Einwilligung widerrufen. Der Vorstand wurde
                    verständigt und deaktiviert die Steuerung. Wenn Sie wieder
                    teilnehmen möchten, können Sie unten erneut zustimmen.
                </p>
            {:else if data.consent.outdated}
                <p class="text-sm text-yellow-700 dark:text-yellow-400 mb-3">
                    Wir haben die Beschreibung der Datennutzung aktualisiert.
                    Bitte lesen Sie den neuen Text und stimmen Sie ihm zu, um
                    das Speichermanagement weiter zu nutzen.
                </p>
            {:else}
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">
                    Bevor es losgeht: Bitte lesen Sie, wie das
                    Speichermanagement funktioniert und welche Daten wir dafür
                    verwenden, und stimmen Sie dem zu.
                </p>
            {/if}
            <ConsentText />
            <form method="POST" action="?/grantConsent" use:enhance
                class="border-t border-gray-200 dark:border-gray-700 mt-4 pt-4 space-y-3">
                <Checkbox name="accept" required>
                    Ich habe die Informationen gelesen und bin damit
                    einverstanden, dass die ISCHLSTROM Energiegemeinschaft
                    meinen Batteriespeicher wie beschrieben steuert und die
                    genannten Daten dafür verarbeitet.
                </Checkbox>
                <Button type="submit">Zustimmen</Button>
                {#if form?.message}
                    <p class="text-sm text-red-600">{form.message}</p>
                {/if}
            </form>
        </Card>
    {/if}

    {#if data.consent.granted}
    {#each data.plants as plant (plant.id)}
        {@const phase = describePhase(plant.setupPhase)}
        {@const d = plant.data}
        {@const show = revealed[plant.id] ?? false}
        <Card class="max-w-none">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <Indicator color={online(plant) ? "green" : "gray"} />
                    <span class="text-lg font-semibold dark:text-white">{plant.name}</span>
                </div>
                <Badge color={online(plant) ? "green" : "gray"}>
                    {online(plant) ? "verbunden" : "nicht verbunden"}
                </Badge>
            </div>

            {#if plant.provisioned && !phase.done}
                <div class="mb-4">
                    <p class="text-sm text-gray-700 dark:text-gray-200 mb-1">
                        Einrichtung: <strong>{phase.label}</strong>
                    </p>
                    <Progressbar progress={phase.progress} color={phase.failed ? "red" : phase.waiting ? "yellow" : "blue"} />
                    {#if !plant.setupPhase}
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Sobald der Raspberry Pi mit Strom und Netzwerk verbunden ist,
                            erscheint hier der Fortschritt. Die Einrichtung dauert etwa
                            30 bis 45 Minuten.
                        </p>
                    {:else if phase.failed}
                        <p class="text-xs text-red-600 mt-1">
                            Die Einrichtung ist auf ein Problem gestoßen. Der Vorstand
                            wurde benachrichtigt und kümmert sich darum.
                        </p>
                    {:else}
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Letzte Meldung: {formatTime(plant.setupPhaseAt)}
                        </p>
                    {/if}
                </div>
            {/if}

            {#if online(plant) && typeof d.soc === "number"}
                <div class="mb-4">
                    <div class="flex justify-between text-sm mb-1">
                        <span class="text-gray-600 dark:text-gray-300">Batterie-Ladestand</span>
                        <span class="font-medium dark:text-white">{Math.round(d.soc)}%</span>
                    </div>
                    <Progressbar progress={Math.round(d.soc)} color={d.soc < 20 ? "red" : "green"} />
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Speichermanagement {d.hauptschalter === "ON" ? "aktiv" : "ausgeschaltet"}
                        {#if inverterLabel(plant.inverterType)}· {inverterLabel(plant.inverterType)}{/if}
                    </p>
                </div>
            {/if}

            {#if needsInverterPassword(plant.inverterType) && plant.provisioned}
                <div class="border-t border-gray-200 dark:border-gray-700 pt-3 mb-4">
                    <p class="text-sm font-semibold dark:text-white mb-1">Passwort des Wechselrichters</p>
                    {#if plant.inverterPasswordSet}
                        <p class="text-sm text-green-700 dark:text-green-400">
                            Hinterlegt. Der Raspberry Pi holt es bei der Einrichtung ab;
                            danach wird es auf ischlstrom.org gelöscht.
                        </p>
                    {:else if form?.inverterPasswordSet}
                        <p class="text-sm text-green-700 dark:text-green-400">Gespeichert, danke.</p>
                    {:else}
                        <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
                            Für die Batteriesteuerung braucht das Speichermanagement das
                            Passwort, mit dem Sie sich an der Weboberfläche Ihres
                            Wechselrichters anmelden (beim Fronius GEN24 der Benutzer
                            "customer"). Es wird verschlüsselt gespeichert, einmal an
                            Ihren Raspberry Pi übertragen und dann gelöscht.
                        </p>
                        <form method="POST" action="?/setInverterPassword" use:enhance class="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="id" value={plant.id} />
                            <div>
                                <Label for={`u${plant.id}`} class="text-xs">Benutzer</Label>
                                <Input id={`u${plant.id}`} name="username" value="customer" size="sm" class="w-32" autocomplete="off" data-1p-ignore data-lpignore="true" />
                            </div>
                            <div>
                                <Label for={`p${plant.id}`} class="text-xs">Passwort</Label>
                                <Input id={`p${plant.id}`} name="password" type="password" size="sm" class="w-48" autocomplete="new-password" data-1p-ignore data-lpignore="true" required />
                            </div>
                            <Button type="submit" size="sm">Speichern</Button>
                        </form>
                        {#if form?.message}
                            <p class="text-sm text-red-600 mt-1">{form.message}</p>
                        {/if}
                    {/if}
                </div>
            {/if}

            {#if plant.cloudUsername}
                <div class="border-t border-gray-200 dark:border-gray-700 pt-3">
                    <p class="text-sm font-semibold dark:text-white mb-1">Zugang mit der openHAB-App</p>
                    <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
                        In der openHAB-App (App Store / Play Store) als Remote-URL
                        <span class="font-mono">https://hac.ischlstrom.org</span> eintragen und mit
                        diesen Zugangsdaten anmelden. Im Browser:
                        <a href="https://remote.hac.ischlstrom.org" class="underline" target="_blank" rel="noopener">remote.hac.ischlstrom.org</a>.
                    </p>
                    <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm mb-2">
                        <span class="text-gray-500">Benutzer</span>
                        <span class="font-mono dark:text-white">{plant.cloudUsername}</span>
                        <span class="text-gray-500">Passwort</span>
                        <span class="font-mono dark:text-white">{show ? plant.cloudPassword : "••••••••••••"}</span>
                    </div>
                    {#if plant.cloudAccountState === "pending" || plant.cloudAccountState === "reset"}
                        <p class="text-xs text-yellow-700 dark:text-yellow-400 mb-2">
                            Das Konto wird gerade eingerichtet, das dauert höchstens ein paar Minuten.
                        </p>
                    {/if}
                    <div class="flex flex-wrap gap-2">
                        <Button size="xs" color="light" onclick={() => (revealed[plant.id] = !show)}>
                            {show ? "Verbergen" : "Passwort anzeigen"}
                        </Button>
                        <form method="POST" action="?/resetCloudPassword" use:enhance
                            onsubmit={(/** @type {SubmitEvent} */ e) => {
                                if (!confirm("Neues Passwort erzeugen? Das alte gilt dann nicht mehr.")) e.preventDefault();
                            }}>
                            <input type="hidden" name="id" value={plant.id} />
                            <Button size="xs" color="light" type="submit">Neues Passwort</Button>
                        </form>
                    </div>
                    {#if form?.cloudReset}
                        <p class="text-xs text-green-700 dark:text-green-400 mt-1">
                            Neues Passwort erzeugt; es gilt in wenigen Minuten.
                        </p>
                    {/if}
                </div>
            {/if}
        </Card>
    {/each}

    <div class="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-2">
        <span>
            Einwilligung zur Datennutzung erteilt am
            {data.consent.grantedAt
                ? new Date(data.consent.grantedAt).toLocaleDateString("de-AT", { timeZone: "Europe/Vienna" })
                : "-"}.
        </span>
        <form method="POST" action="?/revokeConsent" use:enhance
            onsubmit={(/** @type {SubmitEvent} */ e) => {
                if (!confirm("Einwilligung wirklich widerrufen? Die Steuerung Ihres Speichers wird dann beendet und Ihre Daten werden gelöscht.")) e.preventDefault();
            }}>
            <button type="submit" class="underline">Einwilligung widerrufen</button>
        </form>
    </div>
    {/if}

    <p class="text-xs text-gray-500 dark:text-gray-400">
        Fragen zum Speichermanagement: <a href="mailto:info@ischlstrom.org" class="underline">info@ischlstrom.org</a>
    </p>
</div>
