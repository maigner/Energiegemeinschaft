const config = {
  content: ['./src/**/*.{html,js,svelte,ts}', './node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}'],

  plugins: [require('flowbite/plugin')],

  darkMode: 'class',

  theme: {
    container: {
      center: true,
    },
    extend: {
      // derived from #0b7c3c, which is our main colour, same as the logo
      colors: {
        // flowbite-svelte
        primary: {
          '50': '#eefff4',
          '100': '#d7ffe7',
          '200': '#b2ffd1',
          '300': '#76ffaf',
          '400': '#34f484',
          '500': '#09de62',
          '600': '#01b84e',
          '700': '#059040',
          '800': '#0b7c3c',
          '900': '#0a5d2f',
          '950': '#003418',
        },
        'green': {
          '50': '#eefff4',
          '100': '#d7ffe7',
          '200': '#b2ffd1',
          '300': '#76ffaf',
          '400': '#34f484',
          '500': '#09de62',
          '600': '#01b84e',
          '700': '#059040',
          '800': '#0b7c3c',
          '900': '#0a5d2f',
          '950': '#003418',
      },
      }
    }
  }
};

module.exports = config;