<script>
	import "./layout.css";

	import { onMount } from "svelte";
	import { getCurrentWindow } from "@tauri-apps/api/window";

	async function applyThemeFromOS() {
		const window = getCurrentWindow();
		const theme = await window.theme();

		if (theme === "dark") {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	}

	onMount(async () => {
		// Apply on startup
		applyThemeFromOS();
	});

	const { children } = $props();
</script>

<div
	class="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
>
	{@render children()}
</div>
