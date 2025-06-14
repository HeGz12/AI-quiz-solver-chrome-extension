// ========== POPRAWIONY popup.js ==========

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveKeyButton = document.getElementById('saveKey');
  const checkApiButton = document.getElementById('checkApi');
  const apiStatus = document.getElementById('apiStatus');
  const solveTextButton = document.getElementById('solveText');
  const solveScreenshotButton = document.getElementById('solveScreenshot');
  const autoSelectCheckbox = document.getElementById('autoSelect');
  const status = document.getElementById('status');

  chrome.storage.sync.get(['apiKey', 'autoSelectEnabled'], (result) => {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    autoSelectCheckbox.checked = result.autoSelectEnabled !== false;
  });

  saveKeyButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.sync.set({ apiKey: apiKey }, () => {
        status.textContent = 'Klucz API zapisany!';
        status.style.color = 'green';
        setTimeout(() => { status.textContent = 'Gotowy do działania.'; status.style.color = ''; }, 2000);
      });
    } else {
      status.textContent = 'Proszę wprowadzić klucz API.';
      status.style.color = 'red';
    }
  });

  autoSelectCheckbox.addEventListener('change', () => {
    chrome.storage.sync.set({ autoSelectEnabled: autoSelectCheckbox.checked });
  });

  checkApiButton.addEventListener('click', async () => {
    apiStatus.textContent = 'Sprawdzanie...';
    apiStatus.style.color = '';
    const { apiKey } = await chrome.storage.sync.get(['apiKey']);
    if (!apiKey) {
      apiStatus.textContent = 'Status: Brak klucza API!';
      apiStatus.style.color = 'red';
      return;
    }
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (response.ok) {
        apiStatus.textContent = 'Status: API działa poprawnie!';
        apiStatus.style.color = 'green';
      } else {
        const errorData = await response.json();
        apiStatus.textContent = `Status: Błąd! (${errorData.error?.message || 'Nieznany błąd'})`;
        apiStatus.style.color = 'red';
      }
    } catch (error) {
      apiStatus.textContent = 'Status: Błąd sieci lub CORS.';
      apiStatus.style.color = 'red';
    }
  });

  solveTextButton.addEventListener('click', async () => {
    const { apiKey } = await chrome.storage.sync.get(['apiKey']);
    if (!apiKey) {
      status.textContent = 'Błąd: Najpierw ustaw klucz API!';
      status.style.color = 'red';
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    status.textContent = 'Automatyczne wykrywanie...';
    status.style.color = 'blue';
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    }, () => {
      if (chrome.runtime.lastError) {
        status.textContent = 'Błąd wstrzykiwania skryptu.';
        status.style.color = 'red';
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: 'startAutoDetection' });
    });
  });

  solveScreenshotButton.addEventListener('click', async () => {
    const { apiKey } = await chrome.storage.sync.get(['apiKey']);
    if (!apiKey) {
      status.textContent = 'Błąd: Najpierw ustaw klucz API!';
      status.style.color = 'red';
      return;
    }
    status.textContent = 'Przetwarzanie zrzutu ekranu...';
    status.style.color = 'blue';
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.runtime.sendMessage({ action: 'solveScreenshot', tabId: tab.id });
  });

  // POPRAWIONA SEKCJA
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (sender.tab) return; // Ignoruj wiadomości z content scriptów
    
    if (request.action === 'showStatusInPopup') {
      const isError = request.status.toLowerCase().includes('błąd') || request.status.toLowerCase().includes('error');
      status.textContent = request.status;
      status.style.color = isError ? 'red' : 'green';
    }
  });
});