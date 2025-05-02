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
          '50': '#f1faeb',
          '100': '#dff4d3',
          '200': '#c0eaac',
          '300': '#9adb7b',
          '400': '#76c952',
          '500': '#5cb837',
          '600': '#418a26',
          '700': '#346a21',
          '800': '#2c551f',
          '900': '#27491e',
          '950': '#11270c',
        },
        secondary: {
          '50': '#f3f8ed',
          '100': '#e3f0d7',
          '200': '#c8e3b3',
          '300': '#a5d086',
          '400': '#85bc5f',
          '500': '#67a042',
          '600': '#4e7f31',
          '700': '#3a5d27',
          '800': '#344f25',
          '900': '#2e4423',
          '950': '#15240f',
        },
        'green': {
          '50': '#f1faeb',
          '100': '#dff4d3',
          '200': '#c0eaac',
          '300': '#9adb7b',
          '400': '#76c952',
          '500': '#5cb837',
          '600': '#418a26',
          '700': '#346a21',
          '800': '#2c551f',
          '900': '#27491e',
          '950': '#11270c',
        },
      }
    }
  }
};

module.exports = config;