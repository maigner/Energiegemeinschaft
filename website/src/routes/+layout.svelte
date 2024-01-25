<script>
	import "../app.css";
	import { Hr } from "flowbite-svelte";
	import BetaLogin from "$lib/dialog/BetaLogin.svelte";
	import Navigation from "./Navigation.svelte";

	let betaLoginOpen = true;

	import { page } from "$app/stores"


	export let data;
	if (data.session) {
		betaLoginOpen = false;
	}

	if ($page.route.id === "/verify" ) {
		betaLoginOpen = false;
	}


</script>

<BetaLogin bind:open={betaLoginOpen} />

<Navigation />


<slot />

<!--
<div class="mt-16 flex place-content-center">
	<img src="/sponsors.jpg" class="max-w-sm" alt="sponsors" />
</div>
-->

<div class="ml-5 mt-20">
	<a href="/impressum">Impressum</a>
</div>

<Hr />
