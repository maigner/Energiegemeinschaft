<script>
	import "../../app.css";
	import { Button, Hr } from "flowbite-svelte";
	import Navigation from "./Navigation.svelte";
	import { browser } from "$app/environment";

	let { data, children } = $props();
</script>

<Navigation {data} />

<div class="xl:max-w-6xl lg:max-w-4xl md:max-w-3xl mx-auto">
	{@render children()}
</div>

<div class="flex justify-center">
	<Button
		class="mt-48"
		onclick={() => {
			if (browser) {
				window.scrollTo({
					top: 0,
					behavior: "smooth",
				});
			}
		}}>zurück nach oben</Button
	>
</div>

<div class="text-center mt-20 text-xs text-primary-800">
	<a href="/elwg">Neues Stromgesetz (ElWG)</a>
	<span class="mx-2">|</span>
	<a href="/impressum">Impressum</a>
	<span class="mx-2">|</span>
	<a href="/datenschutz">Datenschutz</a>
</div>
<Hr />

<div class="mt-16 flex flex-col items-center">
	<div class="">Mit freundlicher Unterstützung von:</div>
	<div class="">
		<img
			src="/sponsors/SPK-Salzkammergut_Special_print_PNT.jpg"
			class="max-w-64"
			alt="sponsors"
		/>
	</div>
</div>
