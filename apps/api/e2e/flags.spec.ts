import { test, expect, type Page } from '@playwright/test';
const password = process.env.E2E_ADMIN_PASSWORD!;
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Admin password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Feature flags' }),
  ).toBeVisible();
}
test('create flag, target a plan, and observe the React app change', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await page.getByRole('button', { name: 'Create flag', exact: true }).click();
  await page.getByLabel('Flag key', { exact: true }).fill('new-checkout');
  await page
    .getByLabel('Description')
    .fill('A simpler checkout for Orbit customers.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create flag', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Edit new-checkout' }),
  ).toBeVisible();
  const example = await context.newPage();
  await example.goto('http://localhost:3101');
  await example.getByLabel('Client SDK key').fill(process.env.E2E_CLIENT_KEY!);
  await expect(
    example.getByRole('heading', { name: 'The classic checkout.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Edit new-checkout' }).click();
  await page.getByRole('switch', { name: 'Enable flag' }).click();
  await page.getByRole('button', { name: 'Add rule', exact: true }).click();
  await page
    .getByLabel('Default serves variation', { exact: true })
    .selectOption('0');
  await page
    .getByRole('button', { name: 'Evaluate context', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('RULE_MATCH');
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.getByRole('dialog')).toContainText('Before');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Changes saved' }),
  ).toBeVisible();
  await example.getByLabel('Plan', { exact: true }).selectOption('pro');
  await expect(
    example.getByRole('heading', { name: 'Meet your new checkout.' }),
  ).toBeVisible();
  await example.getByLabel('Plan', { exact: true }).selectOption('free');
  await expect(
    example.getByRole('heading', { name: 'The classic checkout.' }),
  ).toBeVisible();
  await page
    .getByRole('heading', { name: 'new-checkout', exact: true })
    .click();
  await page.screenshot({
    path: 'test-results/editor-desktop.png',
    fullPage: true,
  });
  // A rollout edits a live percentage preview before it is committed.
  await page
    .getByLabel('Default serves', { exact: true })
    .selectOption('rollout');
  await page.getByLabel('Default serves false percentage').fill('2500');
  await expect(page.locator('output').first()).toHaveText('25.00%');
  // Verify narrow screens do not clip the page.
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('heading', { name: 'new-checkout', exact: true })
    .click();
  await page.screenshot({
    path: 'test-results/editor-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.getByRole('link', { name: 'All flags', exact: true }).click();
  await page.getByRole('button', { name: 'production', exact: true }).click();
  await page.getByRole('switch', { name: 'Toggle new-checkout' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Change production targeting?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.getByRole('switch', { name: 'Toggle new-checkout' }),
  ).toHaveAttribute('aria-checked', 'false');
  await page.screenshot({
    path: 'test-results/flags-desktop.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Activity log' }).click();
  await expect(page.getByText('config updated')).toBeVisible();
  await page.locator('summary').first().click();
  await expect(
    page.getByRole('heading', { name: 'Before', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('shows a version conflict without overwriting another save', async ({
  page,
  context,
}) => {
  await login(page);
  await page.request.post('/api/projects/demo/flags', {
    headers: { 'X-Flagpole-CSRF': '1' },
    data: { key: 'conflict-flag', type: 'boolean', variations: [false, true] },
  });
  await page.goto('/projects/demo/flags/conflict-flag');
  const other = await context.newPage();
  await other.goto('/projects/demo/flags/conflict-flag');
  await expect(
    other.getByRole('switch', { name: 'Enable flag' }),
  ).toBeVisible();
  await page.getByRole('switch', { name: 'Enable flag' }).click();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Changes saved' }),
  ).toBeVisible();
  await other.getByRole('button', { name: 'Review changes' }).click();
  await other
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(
    other.getByRole('alert').filter({ hasText: 'This flag changed' }),
  ).toBeVisible();
  await other.getByRole('button', { name: 'Reload latest' }).click();
  await expect(
    other.getByRole('switch', { name: 'Enable flag' }),
  ).toHaveAttribute('aria-checked', 'true');
});
