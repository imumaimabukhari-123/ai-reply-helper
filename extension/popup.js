// Popup: picks up the text selected on the page (or sent from the right-click menu)
// and shows the reply panel. Remembers the last tone, goal and length.
const API = window.ARH_API;
document.getElementById("site").href = API + "/guide";

async function selectedText() {
  // 1. Text sent from the right-click menu
  const { pending } = await chrome.storage.session.get("pending");
  if (pending) {
    await chrome.storage.session.remove("pending");
    chrome.action.setBadgeText({ text: "" });
    return pending;
  }
  // 2. Text selected in the current tab (activeTab lets us read it after the user clicks the icon)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/.test(tab.url || "")) return "";
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      func: () => String(window.getSelection() || "").trim(),
    });
    return (res && res.result) || "";
  } catch {
    return ""; // some pages (like the Chrome Web Store) can't be read
  }
}

(async () => {
  const { prefs } = await chrome.storage.local.get("prefs");
  const forced = new URLSearchParams(location.search).get("text"); // for testing
  ARH.mount(document.getElementById("app"), {
    api: API,
    message: forced ?? (await selectedText()),
    prefs: prefs || {},
    save: (p) => chrome.storage.local.set({ prefs: { tone: p.tone, goal: p.goal, length: p.length } }),
  });
})();
