import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    // checkOrigin (default true) braucht hinter dem Reverse-Proxy die
    // PROTOCOL_HEADER/HOST_HEADER-Umgebungsvariablen, siehe "start" in package.json
  },
};

export default config;
