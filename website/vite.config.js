import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		// openhabProvision.js importiert die firstboot-Dateien aus
		// Batteriemanagement/ per ?raw - dem Dev-Server das Repo erlauben.
		fs: { allow: ['..'] }
	}
});
