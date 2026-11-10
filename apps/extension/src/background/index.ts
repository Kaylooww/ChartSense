import { loadSession, saveSession } from '../storage/chromeStorage';
import { fail } from '../types/messages';
import { createBackground } from './handlers';

/**
 * MV3 service worker entry point. All listeners are registered synchronously at top level so
 * Chrome can wake the worker for them. State lives in chrome.storage.session, not in memory.
 *
 * This worker never injects scripts, never touches the trading site, and has no way to place
 * orders: it only authorizes a tab on a toolbar click and takes user-requested screenshots.
 */

const logError = (error: unknown) => {
  // Log only the message: never request payloads, which could contain screenshots.
  console.error('[ChartSense]', error instanceof Error ? error.message : String(error));
};

const background = createBackground({
  extensionId: chrome.runtime.id,
  sidePanelUrl: chrome.runtime.getURL('sidepanel.html'),
  nowMs: () => Date.now(),
  loadSession,
  saveSession,
  getActiveTabId: async (windowId) => {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    return tab?.id;
  },
  getZoom: (tabId) => chrome.tabs.getZoom(tabId),
  captureVisibleTab: (windowId) => chrome.tabs.captureVisibleTab(windowId, { format: 'png' }),
});

// Clicking the toolbar icon is the user gesture that (a) grants Chrome's temporary `activeTab`
// permission for the current tab and (b) lets us open the side panel.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    // Must be called synchronously inside the click handler to count as a user gesture.
    chrome.sidePanel.open({ tabId: tab.id }).catch(logError);
  }
  background.onToolbarClick(tab).catch(logError);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  background
    .handleMessage(message, sender)
    .then(sendResponse)
    .catch((error: unknown) => {
      logError(error);
      sendResponse(fail('INTERNAL', 'Unexpected error in the background worker.'));
    });
  return true; // keep the message channel open for the async response
});

// The side panel holds a port open while it is visible; when it closes, monitoring pauses.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel' || !port.sender?.url?.startsWith(chrome.runtime.getURL('sidepanel.html'))) return;
  port.onDisconnect.addListener(() => {
    background.onPanelClosed().catch(logError);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  background.onTabUpdated(tabId, changeInfo, tab).catch(logError);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  background.onTabRemoved(tabId).catch(logError);
});
