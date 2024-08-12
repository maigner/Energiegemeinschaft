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

<!--
<div class="mt-16 flex place-content-center">
	<img src="/sponsors.jpg" class="max-w-sm" alt="sponsors" />
</div>
-->

{#if $page.route.id !== "/impressum" &&  $page.route.id?.toString().startsWith("/board") == false }
	<div class="text-center mt-20">
		<a href="/impressum">Impressum</a>
	</div>
	<Hr />
{/if}


