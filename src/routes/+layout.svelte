<script>
	import "./layout.css";

	const { children } = $props();
</script>

<div
	class="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
>
	{@render children()}
</div>
