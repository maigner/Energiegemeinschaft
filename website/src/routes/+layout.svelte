<script>
	import "../app.css";
	import { Hr } from "flowbite-svelte";
	import Navigation from "./Navigation.svelte";

</script>


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
