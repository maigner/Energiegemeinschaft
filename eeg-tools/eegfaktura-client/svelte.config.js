// Tauri doesn't have a Node.js server to do proper SSR
// so we will use adapter-static to prerender the app (SSG)
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";


/** @type {import('@sveltejs/kit').Config} */
/*
const config = {
  kit: {
    adapter: adapter(),
  },
};
*/

//export default config;

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: false
    }),
    prerender: {
      entries: [],  // Don't prerender anything
      handleMissingId: 'ignore',
      handleUnseenRoutes: 'ignore'  // This is the key line
    }
  }
};