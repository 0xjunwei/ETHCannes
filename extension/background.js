chrome.runtime.onInstalled.addListener(() => {
  console.log('Gas Out RPC Extension installed');
});

// Handle messages for stats updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TRANSACTION_PROCESSED') {
    updateStats(request.data);
    sendResponse({ success: true });
  }
});

async function updateStats(data) {
  try {
    const current = await chrome.storage.local.get(['txCount', 'gasSaved']);
    await chrome.storage.local.set({
      txCount: (current.txCount || 0) + 1,
      gasSaved: (current.gasSaved || 0) + parseFloat(data.gasSaved || 0)
    });
    console.log('Stats updated - Transactions:', (current.txCount || 0) + 1);
  } catch (error) {
    console.error('Failed to update stats:', error);
  }
}
  