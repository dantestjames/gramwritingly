import { getSettings, saveSettings, send, siteKey, type StatusReply } from "./shared";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function currentSite(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ? siteKey(tab.url) : "";
}

async function render() {
  const settings = await getSettings();
  const site = await currentSite();
  const status = await send<StatusReply>({ type: "status" });
  const s = status.ok ? status.data : null;

  $("server").textContent = s?.server ? "Connected" : "Offline: style checks only";
  $("server").className = s?.server ? "ok" : "warn";
  $<HTMLInputElement>("enabled").checked = settings.enabled;
  $<HTMLInputElement>("site").checked = !settings.disabledSites.includes(site);
  $("site-name").textContent = site || "this site";
  $<HTMLSelectElement>("language").value = settings.language;
  $<HTMLInputElement>("readability").checked = settings.readabilityInline;

  const signedIn = !!s?.signedIn;
  $("signed-in").hidden = !signedIn;
  $("signed-out").hidden = signedIn;
  if (signedIn && s) {
    $("email").textContent = s.email ?? "";
    $("plan").textContent = s.plan ?? "";
    $("credits").textContent =
      s.aiCreditsLimit === null ? `${s.aiCreditsUsed} AI credits used` : `${s.aiCreditsUsed} of ${s.aiCreditsLimit} AI credits used this month`;
  }
  $<HTMLAnchorElement>("open-editor").href = settings.webUrl;
}

$("enabled").addEventListener("change", async (e) => {
  await saveSettings({ enabled: (e.target as HTMLInputElement).checked });
});
$("site").addEventListener("change", async (e) => {
  const site = await currentSite();
  const settings = await getSettings();
  const on = (e.target as HTMLInputElement).checked;
  const list = new Set(settings.disabledSites);
  if (on) list.delete(site);
  else list.add(site);
  await saveSettings({ disabledSites: [...list] });
});
$("language").addEventListener("change", async (e) => {
  await saveSettings({ language: (e.target as HTMLSelectElement).value as never });
});
$("readability").addEventListener("change", async (e) => {
  await saveSettings({ readabilityInline: (e.target as HTMLInputElement).checked });
});
$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("error").textContent = "";
  const res = await send({ type: "login", email: $<HTMLInputElement>("login-email").value, password: $<HTMLInputElement>("login-password").value });
  if (!res.ok) $("error").textContent = res.error;
  await render();
});
$("logout").addEventListener("click", async () => {
  await send({ type: "logout" });
  await render();
});
$("open-options").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
