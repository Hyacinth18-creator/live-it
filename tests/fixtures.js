import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ context, page, baseURL }, use) => {
    const response = await context.request.post(new URL('/api/login', baseURL).toString(), {
      form: { username: 'liveit-test', password: 'local-test-password' },
    });
    if (!response.ok()) throw new Error(`Test sign-in failed: ${response.status()}`);
    await use(page);
  },
});

export { chromium, expect } from '@playwright/test';