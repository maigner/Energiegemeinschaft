<script>
	import "../app.css";
	import { page } from "$app/stores";
	import { Hr } from "flowbite-svelte";
	import Navigation from "./Navigation.svelte";
    import BottomNavigation from "./BottomNavigation.svelte";

	export let data;
</script>
<Navigation />



<slot />

<!--
<div class="mt-16 flex place-content-center">
	<img src="/sponsors.jpg" class="max-w-sm" alt="sponsors" />
</div>
-->

{#if $page.route.id !== "/impressum"}
	<div class="text-center mt-20">
		<a href="/impressum">Impressum</a>
	</div>
{/if}

<Hr />

<!--
{#if data.session}
<BottomNavigation />
{/if}
-->
