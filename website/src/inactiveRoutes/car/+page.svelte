<script>
    // @ts-nocheck

    import { browser } from "$app/environment";

    // To use Html5QrcodeScanner (more info below)
    import { Html5QrcodeScanner } from "html5-qrcode";

    import { onMount } from "svelte";

    let result = "";

    function onScanSuccess(decodedText, decodedResult) {
        // handle the scanned code as you like, for example:
        console.log(`Code matched = ${decodedText}`, decodedResult);
        result = decodedText;
    }

    function onScanFailure(error) {
        // handle scan failure, usually better to ignore and keep scanning.
        // for example:
        //console.warn(`Code scan error = ${error}`);

    }

    onMount(() => {
        let html5QrcodeScanner = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false,
        );
        html5QrcodeScanner.render(onScanSuccess);
    });

    //
</script>

<div id="reader" width="600px"></div>

<h1>Result: {result}</h1>