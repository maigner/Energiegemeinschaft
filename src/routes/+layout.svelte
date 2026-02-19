<script>
	import "./layout.css";

	const { children } = $props();
	
</script>

<div class="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
	<!-- Main Content Area -->
	<div class="flex flex-col flex-1 overflow-hidden">
		<!-- Page Content -->
		<main class="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2">
			<div class="mx-auto">
				{@render children()}
			</div>
		</main>
	</div>
</div>
