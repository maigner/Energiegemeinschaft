<script>
	import "../app.css";
	import { dev } from "$app/environment";

	import { Hr } from "flowbite-svelte";
	import BetaLogin from "$lib/dialog/BetaLogin.svelte";
	import Navigation from "./Navigation.svelte";

	let betaLoginOpen = !dev;
</script>

<BetaLogin bind:open={betaLoginOpen} />

<Navigation />

<slot />

<div class="center mt-16">
	<img src="sponsors.jpg" width="80%" alt="sponsors" />
</div>

<div class="center">
	<a href="/impressum">Impressum</a>
</div>

<Hr />
