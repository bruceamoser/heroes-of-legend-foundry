/** The V14.369 join page uses userId selection; V14.367 used a username field. */
export async function selectTestUser(page, name) {
  await page.locator('select[name=userId], input[name=username]').first().waitFor();
  const users = page.locator('select[name=userId]');
  if (await users.count()) await users.selectOption({label:name});
  else await page.locator('input[name=username]').fill(name);
}
