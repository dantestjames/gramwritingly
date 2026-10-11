import { getSettings, saveSettings } from "./shared";

const api = document.getElementById("api-url") as HTMLInputElement;
const web = document.getElementById("web-url") as HTMLInputElement;
const saved = document.getElementById("saved")!;

getSettings().then((s) => {
  api.value = s.apiUrl;
  web.value = s.webUrl;
});

document.getElementById("form")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const clean = (u: string) => u.trim().replace(/\/$/, "");
  try {
    new URL(clean(api.value));
    new URL(clean(web.value));
  } catch {
    saved.textContent = "Enter full URLs, starting with https://";
    return;
  }
  await saveSettings({ apiUrl: clean(api.value), webUrl: clean(web.value) });
  saved.textContent = "Saved.";
});
