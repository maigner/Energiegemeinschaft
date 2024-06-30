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
          '50': '#f2f8ed',
          '100': '#e2f0d7',
          '200': '#c7e3b3',
          '300': '#a4d086',
          '400': '#84bb60',
          '500': '#65a042',
          '600': '#4d7f31',
          '700': '#395c27',
          '800': '#334f25',
          '900': '#2d4423',
          '950': '#15240f',
        },
        'green': {
          '50': '#f2f8ed',
          '100': '#e2f0d7',
          '200': '#c7e3b3',
          '300': '#a4d086',
          '400': '#84bb60',
          '500': '#65a042',
          '600': '#4d7f31',
          '700': '#395c27',
          '800': '#334f25',
          '900': '#2d4423',
          '950': '#15240f',
        },
      }
    }
  }
};

module.exports = config;