// Right-click menu: "Reply to this with AI" on selected text.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "arh-reply", title: "Reply to this with AI", contexts: ["selection"] });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "arh-reply" || !info.selectionText) return;
  await chrome.storage.session.set({ pending: info.selectionText.slice(0, 6000) });
  try {
    await chrome.action.openPopup();
  } catch {
    // Older Chrome can't open the popup from here: show a badge so the user clicks the icon.
    chrome.action.setBadgeText({ text: "1" });
    chrome.action.setBadgeBackgroundColor({ color: "#0e7490" });
  }
});
