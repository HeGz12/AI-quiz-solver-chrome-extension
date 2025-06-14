// ========== POPRAWIONY background.js ==========

const GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendDataToAI') {
    handleTextAnalysis(request.data, sender.tab.id);
    return true;
  }
  if (request.action === 'solveScreenshot') {
    handleScreenshotAnalysis(request.tabId || sender.tab.id);
    return true;
  }
});

async function getSettings() {
    return new Promise(resolve => {
        chrome.storage.sync.get(['apiKey', 'autoSelectEnabled'], resolve);
    });
}

async function handleTextAnalysis(data, tabId) {
  const { question, answers } = data;
  const { apiKey, autoSelectEnabled } = await getSettings();

  if (!apiKey) {
    chrome.tabs.sendMessage(tabId, { action: 'error', message: 'Brak klucza API.' });
    return;
  }

  const prompt = `Jesteś ekspertem w rozwiązywaniu quizów. Przeanalizuj poniższe pytanie i listę odpowiedzi. Twoim zadaniem jest wybrać jedną, poprawną odpowiedź.

PYTANIE:
"${question}"

MOŻLIWE ODPOWIEDZI:
${answers.map((answer) => `- ${answer}`).join('\n')}

INSTRUKCJE:
1. Uważnie przeczytaj pytanie i wszystkie odpowiedzi.
2. Wykorzystaj swoją wiedzę, aby wybrać najlepszą odpowiedź.
3. Zwróć TYLKO I WYŁĄCZNIE DOKŁADNY TEKST wybranej odpowiedzi z powyższej listy.
4. Nie dodawaj żadnych wyjaśnień, numeracji, ani słów typu "Odpowiedź:". Skopiuj tekst 1:1.

PRAWIDŁOWA ODPOWIEDŹ:`;

  try {
    const aiAnswer = await callGeminiAPI(apiKey, prompt);
    console.log('🤖 Odpowiedź AI (tekst):', aiAnswer);

    const bestMatch = findBestMatch(aiAnswer, answers);
    const finalAnswer = bestMatch || aiAnswer;
    
    chrome.tabs.sendMessage(tabId, { 
        action: 'highlightAnswer', 
        answer: finalAnswer,
        // KLUCZOWA POPRAWKA:
        autoSelect: autoSelectEnabled === true 
    });

    chrome.runtime.sendMessage({
        action: 'showStatusInPopup',
        status: `AI wybrało: ${finalAnswer.substring(0, 50)}...`
    });

  } catch (error) {
    console.error('❌ Błąd analizy tekstu:', error);
    const errorMessage = `Błąd: ${error.message}`;
    chrome.tabs.sendMessage(tabId, { action: 'error', message: errorMessage });
    chrome.runtime.sendMessage({ action: 'showStatusInPopup', status: errorMessage });
  }
}

async function handleScreenshotAnalysis(tabId) {
  const { apiKey, autoSelectEnabled } = await getSettings();

  if (!apiKey) {
    const errorMessage = 'Błąd: Brak klucza API.';
    chrome.runtime.sendMessage({ action: 'showStatusInPopup', status: errorMessage });
    return;
  }

  try {
    const screenshotUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 90 });
    const base64Image = screenshotUrl.split(',')[1];

    const prompt = `Przeanalizuj zrzut ekranu przedstawiający pytanie z testu wielokrotnego wyboru.

TWOJE ZADANIE:
1. Zidentyfikuj pytanie na obrazku.
2. Zidentyfikuj wszystkie możliwe opcje odpowiedzi.
3. Wybierz jedną, prawidłową odpowiedź.

INSTRUKCJE DOTYCZĄCE ODPOWIEDZI:
- Zwróć TYLKO I WYŁĄCZNIE DOKŁADNY TEKST prawidłowej odpowiedzi, tak jak jest widoczny na obrazku.
- Skopiuj odpowiedź 1:1, wliczając w to litery lub cyfry na początku.
- Nie dodawaj żadnych wyjaśnień ani komentarzy.

PRAWIDŁOWA ODPOWIEDŹ:`;

    const aiAnswer = await callGeminiAPI(apiKey, prompt, base64Image);
    console.log('🤖 Odpowiedź AI (zrzut ekranu):', aiAnswer);

    chrome.tabs.sendMessage(tabId, { 
        action: 'highlightAnswer', 
        answer: aiAnswer,
        // KLUCZOWA POPRAWKA:
        autoSelect: autoSelectEnabled === true
    });

    chrome.runtime.sendMessage({
        action: 'showStatusInPopup',
        status: `AI wybrało: ${aiAnswer.substring(0, 50)}...`
    });

  } catch (error) {
    console.error('❌ Błąd analizy zrzutu ekranu:', error);
    const errorMessage = `Błąd: ${error.message}`;
    chrome.runtime.sendMessage({
        action: 'showStatusInPopup',
        status: errorMessage
    });
  }
}

async function callGeminiAPI(apiKey, prompt, base64Image = null) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  
  const parts = [{ text: prompt }];
  if (base64Image) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64Image } });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 800, topP: 0.9, topK: 10 }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`API (${response.status}): ${errorData.error?.message || 'Nieznany błąd'}`);
  }

  const responseData = await response.json();
  
  if (!responseData.candidates?.[0]?.content?.parts?.[0]?.text) {
    console.error("Nieprawidłowa struktura odpowiedzi AI:", responseData);
    throw new Error("AI zwróciło odpowiedź w nieoczekiwanym formacie.");
  }

  return responseData.candidates[0].content.parts[0].text.trim();
}

function findBestMatch(aiResponse, options) {
    if (!aiResponse || options.length === 0) return null;
    let bestMatch = null;
    let highestScore = 0;
    const cleanAiResponse = aiResponse.toLowerCase().replace(/[^a-z0-9\s]/gi, '').trim();
    options.forEach(option => {
        const cleanOption = option.toLowerCase().replace(/[^a-z0-9\s]/gi, '').trim();
        let score = 0;
        if (cleanOption === cleanAiResponse) score = 1.0;
        else if (cleanOption.includes(cleanAiResponse)) score = 0.9;
        else if (cleanAiResponse.includes(cleanOption)) score = 0.8;
        if (score > highestScore) {
            highestScore = score;
            bestMatch = option;
        }
    });
    return highestScore > 0.7 ? bestMatch : null;
}