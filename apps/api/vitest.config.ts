import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC is used instead of Vite's default transform because Nest DI needs emitted decorator metadata.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
