<script>
	import "./layout.css";


	const { children } = $props();
</script>

<div
	class="min-h-screen bg-[var(--color-bg-primary)] "
>
	{@render children()}
</div>
