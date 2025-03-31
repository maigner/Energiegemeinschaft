<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import FirstName from "./FirstName.svelte";
    import LastName from "./LastName.svelte";
    import Address from "./Address.svelte";
    import Iban from "./IBAN.svelte";
    import AccountName from "./AccountName.svelte";
    import CheckSepa from "./CheckSepa.svelte";
    import CheckTerms from "./CheckTerms.svelte";
    import CheckDataProcessing from "./CheckDataProcessing.svelte";
    import CheckNewsletter from "./CheckNewsletter.svelte";
    import MeasurementPoints from "./MeasurementPoints.svelte";

    export let applicationData;

</script>

<CheckTerms bind:checkTerms={applicationData.checkBoxes.terms} />
<FirstName bind:firstName={applicationData.firstName} />
<LastName bind:lastName={applicationData.lastName} />
<Address bind:address={applicationData.address} />
<Iban bind:iban={applicationData.iban} />
<AccountName bind:accountName={applicationData.accountName} />
<CheckSepa bind:checkSepa={applicationData.checkBoxes.sepa} />

<MeasurementPoints bind:measurementPoints={applicationData.measurementPoints} />

<CheckDataProcessing bind:dataProcessing={applicationData.checkBoxes.dataProcessing} />
<CheckNewsletter bind:checkNewsletter={applicationData.checkBoxes.newsletter} />

