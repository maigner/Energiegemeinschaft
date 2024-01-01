<script>
	import "../app.css";
	import { dev } from "$app/environment";

	import { Hr } from "flowbite-svelte";
	import BetaLogin from "$lib/dialog/BetaLogin.svelte";
	import Navigation from "./Navigation.svelte";

	let betaLoginOpen = !dev;
</script>


<BetaLogin bind:open={betaLoginOpen} />
Test
<Navigation />



<slot />

<div class="mt-16 flex place-content-center">
	<img src="sponsors.jpg" class="max-w-sm" alt="sponsors" />
</div>

<div class="flex place-content-center">
	<a href="/impressum">Impressum</a>
</div>

<Hr />
