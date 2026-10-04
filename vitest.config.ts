import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node everywhere; the three client specs that need a DOM opt in with a
    // `// @vitest-environment jsdom` pragma, so the default stays cheap.
    environment: 'node',
    testTimeout: 10000,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
  },
})