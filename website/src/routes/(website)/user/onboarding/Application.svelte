<script>
    import { Button, Heading, Helper, Radio } from "flowbite-svelte";
    import { signOut } from "@auth/sveltekit/client";
    import Person from "./Person.svelte";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import Company from "./Company.svelte";
    import { isValidIBAN } from "$lib/iban";
    import { isValidMeasurementPointIdentifier } from "$lib/measurementPointFormat";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";

    let { data, applicationData = $bindable() } = $props();

    let homeOrCompany = $state("home");

    let formComplete = $state(false);

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
                applicationData.person.checkBoxes.dataProcessing ===
                    true &&
                applicationData.person.measurementPoints.length >= 1 &&
                applicationData.person.measurementPoints.every(
                    (value) =>
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
                applicationData.company.checkBoxes.dataProcessing ===
                    true &&
                applicationData.company.measurementPoints.length >= 1 &&
                applicationData.company.measurementPoints.every(
                    (value) =>
                        isValidMeasurementPointIdentifier(value.identifier) ===
                        true,
                );
        }
    });
</script>

<JsonView json={applicationData} />

<div class="">
    <Heading tag="h3" class="text-primary-600 mt-6 text-center">Bewerbungsformular</Heading>
</div>

<div class="flex items-center justify-center">
    <div class="w-full max-w-md bg-white p-6 rounded-lg shadow-lg">
        <h1 class="text-xl font-bold text-center">
            {data.session?.user?.email}
        </h1>
        <div class="text-center">
            <Button
                class="text-[8px] p-2"
                onclick={() => {
                    signOut();
                }}
            >
                Andere E-Mail-Adresse verwenden
            </Button>
        </div>

        <p class="text-gray-600 text-center mt-8 mb-8">
            Wir brauchen ein paar Daten für Ihre Aufnahme in unserer
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

        <div class="mt-8 flex flex-col items-center justify-center">
            <Button
                disabled={!formComplete}
                pill
                onclick={async () => {
                    let _applicationData = {};
                    console.log({applicationData});
                    if (homeOrCompany === "home") {
                        _applicationData = applicationData.person;
                    } else if (homeOrCompany === "company") {
                        _applicationData = applicationData.company;
                    } else {
                        throw new Error("Data corrupted");
                    }
                    try {
                        const res = await fetch("/api/user/onboarding", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                email: data.session?.user?.email,
                                homeOrCompany: homeOrCompany,
                                applicationData: _applicationData,
                            }),
                        });

                        const result = await res.json();
                        console.log({result});
                        let responseMessage =
                            result.message || "Error submitting form";

                        alert("Bewerbung erfolgt. Vielen Dank für Ihr Vertrauen!");
                        if (browser) {
                            goto("/");
                        }

                    } catch (error) {
                        alert("Fehler! Das Formular konnte nicht verschickt werden. Bitte versuchen Sie es zu einem späteren Zeitpunkt erneut oder kontaktieren uns info@ischlstrom.org");
                    }
                }}>Bewerbung abschicken</Button
            >
            {#if formComplete === false}
                <Helper>Formular unvollständig</Helper>
            {/if}
        </div>
        <div class="text-xs mt-4">
            Sie erhalten als Bestätigung eine Kopie der eingegebenen Daten an
            Ihre E-Mail-Adresse {data.session?.user?.email}
        </div>
        <div class="text-xs mt-4">
            Bei Problemen mit der Bewerbung schreiben Sie uns bitte an info@ischlstrom.org oder kontaktieren unseren Kassier Martin Aigner unter 0660 3555118.
        </div>
    </div>
</div>

<!-- <JsonView json={data} /> -->
