<script>
    import { Alert, Button, Card, Heading, Helper, Radio } from "flowbite-svelte";
    import { signOut } from "@auth/sveltekit/client";
    import Person from "./Person.svelte";
    import Company from "./Company.svelte";
    import { isValidIBAN } from "$lib/iban";
    import { isValidMeasurementPointIdentifier } from "$lib/measurementPointFormat";

    let { data, applicationData = $bindable() } = $props();

    let homeOrCompany = $state("home");

    let formComplete = $state(false);

    /** @type {'idle' | 'submitting' | 'success' | 'error'} */
    let submitState = $state("idle");

    $effect(() => {
        if (homeOrCompany === "home") {
            formComplete =
                applicationData.person.firstName !== "" &&
                applicationData.person.lastName !== "" &&
                applicationData.person.address.street !== "" &&
                applicationData.person.address.number !== "" &&
                applicationData.person.address.zipCode !== "" &&
                applicationData.person.address.city !== "" &&
                applicationData.person.iban !== "" &&
                isValidIBAN(applicationData.person.iban) &&
                applicationData.person.accountName != "" &&
                applicationData.person.checkBoxes.terms === true &&
                applicationData.person.checkBoxes.sepa === true &&
                applicationData.person.checkBoxes.privacyNotice ===
                    true &&
                applicationData.person.measurementPoints.length >= 1 &&
                applicationData.person.measurementPoints.every(
                    (/** @type {any} */ value) =>
                        isValidMeasurementPointIdentifier(value.identifier) ===
                        true,
                );
        }
        if (homeOrCompany === "company") {
            formComplete =
                applicationData.company.companyName !== "" &&
                applicationData.company.address.street !== "" &&
                applicationData.company.address.number !== "" &&
                applicationData.company.address.zipCode !== "" &&
                applicationData.company.address.city !== "" &&
                applicationData.company.iban !== "" &&
                isValidIBAN(applicationData.company.iban) &&
                applicationData.company.accountName != "" &&
                applicationData.company.checkBoxes.terms === true &&
                applicationData.company.checkBoxes.sepa === true &&
                applicationData.company.checkBoxes.privacyNotice ===
                    true &&
                applicationData.company.measurementPoints.length >= 1 &&
                applicationData.company.measurementPoints.every(
                    (/** @type {any} */ value) =>
                        isValidMeasurementPointIdentifier(value.identifier) ===
                        true,
                );
        }
    });

    const submitApplication = async () => {
        let _applicationData = {};
        if (homeOrCompany === "home") {
            _applicationData = applicationData.person;
        } else if (homeOrCompany === "company") {
            _applicationData = applicationData.company;
        } else {
            throw new Error("Data corrupted");
        }
        submitState = "submitting";
        try {
            const res = await fetch("/api/user/onboarding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    homeOrCompany: homeOrCompany,
                    applicationData: _applicationData,
                }),
            });

            if (!res.ok) {
                throw new Error("Submission failed");
            }

            submitState = "success";
        } catch (error) {
            submitState = "error";
        }
    };
</script>

{#if submitState === "success"}
    <div class="flex items-center justify-center mt-8">
        <Card class="max-w-md text-center">
            <Heading tag="h4" class="text-primary-600 mb-4"
                >Vielen Dank für Ihr Vertrauen!</Heading
            >
            <p class="text-gray-600 dark:text-gray-300">
                Ihr Beitrittsantrag ist bei uns eingegangen. Sie erhalten eine
                Bestätigung mit Ihren Angaben an {data.session?.user?.email}.
            </p>
            <p class="text-gray-600 dark:text-gray-300 mt-4">
                Der Vorstand prüft Ihren Antrag und meldet sich bei Ihnen. Sie
                müssen nichts weiter tun.
            </p>
            <div class="mt-6">
                <Button pill href="/">Zur Startseite</Button>
            </div>
        </Card>
    </div>
{:else}
    <div class="">
        <Heading tag="h3" class="text-primary-600 mt-6 text-center"
            >Beitrittsantrag</Heading
        >
    </div>

    <div class="flex items-center justify-center">
        <div class="w-full max-w-md bg-white p-6 rounded-lg shadow-lg">
            <h1 class="text-xl font-bold text-center">
                {data.session?.user?.email}
            </h1>
            <div class="text-center mt-2">
                <Button
                    size="xs"
                    color="light"
                    onclick={() => {
                        signOut();
                    }}
                >
                    Andere E-Mail-Adresse verwenden
                </Button>
            </div>

            <p class="text-gray-600 text-center mt-8 mb-8">
                Wir brauchen ein paar Daten für Ihre Aufnahme in unsere
                Energiegemeinschaft
            </p>

            Ich bin eine:
            <div class="grid grid-cols-2 gap-6">
                <div class="rounded-sm border border-gray-200 dark:border-gray-700">
                    <Radio
                        name="bordered"
                        value="home"
                        bind:group={homeOrCompany}
                        class="w-full p-4">Privatperson</Radio
                    >
                </div>
                <div class="rounded-sm border border-gray-200 dark:border-gray-700">
                    <Radio
                        name="bordered"
                        value="company"
                        bind:group={homeOrCompany}
                        class="w-full p-4">Firma</Radio
                    >
                </div>
            </div>

            <div>
                {#if homeOrCompany === "home"}
                    <Person bind:applicationData={applicationData.person} />
                {/if}
                {#if homeOrCompany === "company"}
                    <Company bind:applicationData={applicationData.company} />
                {/if}
            </div>

            {#if submitState === "error"}
                <Alert color="red" class="mt-6">
                    <span class="font-semibold">Das hat leider nicht geklappt.</span>
                    Ihr Antrag konnte nicht verschickt werden. Bitte versuchen
                    Sie es später noch einmal oder schreiben Sie uns an
                    <a class="underline" href="mailto:info@ischlstrom.org"
                        >info@ischlstrom.org</a
                    >.
                </Alert>
            {/if}

            <div class="mt-8 flex flex-col items-center justify-center">
                <Button
                    disabled={!formComplete || submitState === "submitting"}
                    pill
                    onclick={submitApplication}
                    >{submitState === "submitting"
                        ? "Wird gesendet …"
                        : "Antrag abschicken"}</Button
                >
                {#if formComplete === false}
                    <Helper class="mt-2"
                        >Bitte füllen Sie noch alle Felder aus, dann können Sie
                        den Antrag abschicken.</Helper
                    >
                {/if}
            </div>
            <div class="text-xs mt-4">
                Sie erhalten als Bestätigung eine Kopie der eingegebenen Daten an
                Ihre E-Mail-Adresse {data.session?.user?.email}
            </div>
            <div class="text-xs mt-4">
                Bei Problemen mit dem Antrag schreiben Sie uns bitte an
                info@ischlstrom.org oder kontaktieren unseren Kassier Martin
                Aigner unter 0660 3555118.
            </div>
        </div>
    </div>
{/if}
