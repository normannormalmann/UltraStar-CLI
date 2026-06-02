import { _electron as electron, expect, test } from "@playwright/test";

test("app boots and shows the search view", async () => {
  const app = await electron.launch({ args: ["out/main/index.js"] });
  const window = await app.firstWindow();

  await expect(window).toHaveTitle("UltraStar");
  // Sidebar-Einträge vorhanden
  await expect(window.getByRole("button", { name: /Suche/ })).toBeVisible();
  await expect(window.getByRole("button", { name: /Queue/ })).toBeVisible();
  await expect(window.getByRole("button", { name: /Einstellungen/ })).toBeVisible();
  // Such-View ist die Startansicht
  await expect(window.getByPlaceholder("Interpret…")).toBeVisible();

  await app.close();
});
