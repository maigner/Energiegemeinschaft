import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from "@sveltejs/kit/vite";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [vitePreprocess({})],
  kit: {
    adapter: adapter(),
    // for contact form. TODO: fix
    csrf: {
      checkOrigin: false,
    }
  },
};

export default config;
