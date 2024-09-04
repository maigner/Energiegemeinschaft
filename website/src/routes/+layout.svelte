<script>
	import "../app.css";
	import { page } from "$app/stores";
	import { Hr } from "flowbite-svelte";
	import Navigation from "./Navigation.svelte";

	//export let data;
</script>
<Navigation />


<div class="xl:max-w-6xl lg:max-w-4xl md:max-w-3xl mx-auto">
	<slot />
</div>




{#if $page.route.id !== "/impressum" &&  $page.route.id?.toString().startsWith("/board") == false }
	<div class="text-center mt-20 text-xs text-primary-800">
		<a href="/impressum">Impressum</a>
	</div>
	<Hr />
{/if}


<div class="mt-16 flex flex-col items-center">
	<div class="">
		Mit freundlicher Unterstützung von:

	</div>
	<div class="">
		<img src="/sponsors/SPK-Salzkammergut_Special_print_PNT.jpg" class="max-w-xs" alt="sponsors" />

	</div>

</div>
