import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    // for contact form. TODO: fix
    csrf: {
      checkOrigin: false,
    }
  },
};

export default config;
