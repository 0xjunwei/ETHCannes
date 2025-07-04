document.addEventListener('DOMContentLoaded', async () => {
  const configureButton = document.getElementById('configureMetaMask');

  if (configureButton) {
    configureButton.addEventListener('click', async () => {
      try {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs[0]) {
          if (tabs[0].url && (tabs[0].url.startsWith('http://') || tabs[0].url.startsWith('https://'))) {
            await chrome.tabs.sendMessage(tabs[0].id, {
              type: 'CONFIGURE_METAMASK_NETWORK'
            });
            window.close();
          } else {
            alert('Please navigate to a webpage first');
          }
        }
      } catch (error) {
        console.error('Failed to configure MetaMask:', error);
        alert('Failed to configure MetaMask. Please make sure you are on a webpage and try again.');
      }
    });
  }
}); 