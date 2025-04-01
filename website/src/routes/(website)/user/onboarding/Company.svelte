<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import CompanyName from "./CompanyName.svelte";
    import Address from "./Address.svelte";
    import Iban from "./IBAN.svelte";
    import AccountName from "./AccountName.svelte";
    import CheckTerms from "./CheckTerms.svelte";
    import CheckSepa from "./CheckSepa.svelte";
    import CheckDataProcessing from "./CheckDataProcessing.svelte";
    import CheckNewsletter from "./CheckNewsletter.svelte";
    import MeasurementPoints from "./MeasurementPoints.svelte";

    export let applicationData;

</script>

<div class="bg-yellow-300 rounded-md m-4 p-2">
    <p>
        Hinweis: Als Kleinunternehmen weisen wir auf unseren Abrechnungen KEINE Umsatzsteuer aus!
    </p>    
</div>

<CheckTerms bind:checkTerms={applicationData.checkBoxes.terms} />
<CompanyName bind:companyName={applicationData.companyName} />
<Address bind:address={applicationData.address} />
<Iban bind:iban={applicationData.iban} />
<AccountName bind:accountName={applicationData.accountName} />
<CheckSepa bind:checkSepa={applicationData.checkBoxes.sepa} />
<MeasurementPoints bind:measurementPoints={applicationData.measurementPoints} />
<CheckDataProcessing bind:dataProcessing={applicationData.checkBoxes.dataProcessing} />
<CheckNewsletter bind:checkNewsletter={applicationData.checkBoxes.newsletter} />

