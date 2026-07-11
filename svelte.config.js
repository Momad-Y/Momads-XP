import preprocess from "svelte-preprocess";
import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      routes: {
        include: ['/*'],
        exclude: [
          '<build>',
          '/audio/*',
          '/empty/*',
          '/favicon.png',
          '/files/*',
          '/fonts/*',
          '/html/*',
          '/images/*',
          '/js/*',
          '/json/*',
        ]
      }
    })
  },
  compilerOptions: {
    compatibility: {
      componentApi: 4
    }
  },

  preprocess: [
    preprocess({
      postcss: true,
    }),
  ],
};

export default config;
