// ========== content.js ==========

let isProcessing = false;

// Wzorce do rozpoznawania pytań (rozszerzone)
const questionPatterns = [
  /^(\d+[\.\)]|\w+[\.\)]|\w+:|\*|\-|\•)\s*(.+\?)/,
  /pytanie\s*\d*[\:\.]?\s*(.+\?)/i,
  /question\s*\d*[\:\.]?\s*(.+\?)/i,
  /(.+\?)$/,
  /które?\s+z?\s+poniższych/i,
  /co\s+(to\s+)?jest/i,
  /jak\s+(się\s+)?nazywa/i,
  /wybierz\s+(prawidłową|właściwą)/i,
  /wskaż\s+(prawidłową|poprawną)/i,
  /zaznacz\s+(prawidłową|poprawną)/i,
  /\b(który|która|które|co|jak|gdzie|kiedy|dlaczego|czemu)\b/i
];

// Wzorce do rozpoznawania odpowiedzi
const answerPatterns = [
  /^[a-z][\)\.]\s+/i,  // a) b) c) lub A. B. C.
  /^[0-9][\)\.]\s+/,   // 1) 2) 3) lub 1. 2. 3.
  /^[\*\-\•]\s+/,       // bullet points
  /^(tak|nie)$/i,       // tak/nie
  /^[ivxlcdm]+[\)\.]\s+/i, // rzymskie: i) ii) iii)
];

function getTextFromElement(element) {
  if (!element) return '';
  // Priorytet dla innerText, który lepiej oddaje widoczny tekst
  let text = element.innerText?.trim() || '';
  
  // Jeśli element jest input/textarea, sprawdź value i placeholder
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    text = element.value?.trim() || element.placeholder?.trim() || text;
  }
  
  // Sprawdź atrybuty, jeśli tekst jest pusty
  if (!text) {
    text = element.getAttribute('aria-label')?.trim() || 
           element.getAttribute('title')?.trim() || 
           element.textContent?.trim() || '';
  }
  
  return text.replace(/\s+/g, ' ').trim(); // Normalizuj spacje
}

function findQuizElements() {
  if (isProcessing) return { question: null, answers: [], questionElement: null, answerElements: [] };
  console.log('🔍 Rozpoczynam wykrywanie pytań i odpowiedzi...');

  const allVisibleElements = Array.from(document.querySelectorAll('body *:not(script):not(style):not(noscript)'))
    .filter(el => el.offsetHeight > 0 && el.offsetWidth > 0);

  let detectedQuestion = null;
  let detectedAnswers = [];
  let questionElement = null;
  let answerElements = [];

  // KROK 1: Znajdź pytanie
  for (const el of allVisibleElements) {
    const text = getTextFromElement(el);
    if (!text || text.length < 10) continue;

    const isQuestion = questionPatterns.some(pattern => pattern.test(text));
    if (isQuestion && text.length < 500) { // Pytania nie powinny być zbyt długie
      detectedQuestion = text;
      questionElement = el;
      console.log('✅ Wykryto potencjalne pytanie:', text);
      break;
    }
  }

  if (!detectedQuestion) {
    console.log('⚠️ Nie znaleziono jednoznacznego pytania. Próbuję znaleźć najbardziej prawdopodobne.');
    // Jeśli nie znaleziono, weź pierwszy element z znakiem zapytania
    for (const el of allVisibleElements) {
        const text = getTextFromElement(el);
        if (text && text.includes('?') && text.length > 15 && text.length < 500) {
            detectedQuestion = text;
            questionElement = el;
            console.log('✅ Wykryto pytanie (fallback):', text);
            break;
        }
    }
  }

  // KROK 2: Znajdź odpowiedzi w pobliżu pytania
  if (questionElement) {
    let searchArea = questionElement.closest('form, fieldset, .quiz-container, .question-block, div[role="radiogroup"]') || questionElement.parentElement.parentElement || document.body;
    
    // Strategia 1: Inputy (radio/checkbox) i ich labele
    const inputs = Array.from(searchArea.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
    inputs.forEach(input => {
        let label = document.querySelector(`label[for="${input.id}"]`) || input.closest('label');
        let text = label ? getTextFromElement(label) : getTextFromElement(input.parentElement);
        if (text && text.length > 0 && text.length < 300) {
            detectedAnswers.push(text);
            answerElements.push(label || input.parentElement);
        }
    });

    // Strategia 2: Listy (ul, ol)
    if (detectedAnswers.length < 2) {
        const lists = Array.from(searchArea.querySelectorAll('ul, ol'));
        const listItems = lists.flatMap(list => Array.from(list.querySelectorAll('li')));
        listItems.forEach(item => {
            const text = getTextFromElement(item);
            if (text && text.length > 0 && text.length < 300) {
                detectedAnswers.push(text);
                answerElements.push(item);
            }
        });
    }

    // Strategia 3: Ogólne elementy, które wyglądają jak odpowiedzi
    if (detectedAnswers.length < 2) {
        const potentialAnswers = Array.from(searchArea.querySelectorAll('div, span, p, button, a'));
        potentialAnswers.forEach(el => {
            const text = getTextFromElement(el);
            if (text && text.length > 0 && text.length < 300 && answerPatterns.some(p => p.test(text))) {
                if (!detectedAnswers.includes(text)) {
                    detectedAnswers.push(text);
                    answerElements.push(el);
                }
            }
        });
    }
  }

  // Oczyszczanie
  const uniqueAnswers = [];
  const uniqueElements = [];
  const seenText = new Set();

  detectedAnswers.forEach((answer, index) => {
      if (!seenText.has(answer)) {
          seenText.add(answer);
          uniqueAnswers.push(answer);
          uniqueElements.push(answerElements[index]);
      }
  });
  
  detectedAnswers = uniqueAnswers.slice(0, 10);
  answerElements = uniqueElements.slice(0, 10);

  console.log(`📄 Wykryto pytanie:`, detectedQuestion);
  console.log(`📋 Wykryto ${detectedAnswers.length} odpowiedzi:`, detectedAnswers);

  return { question: detectedQuestion, answers: detectedAnswers, questionElement, answerElements };
}


function highlightElements(questionElement, answerElements) {
  if (questionElement) {
    questionElement.style.border = '3px solid blue';
    questionElement.style.backgroundColor = 'rgba(0, 0, 255, 0.1)';
  }
  answerElements.forEach(el => {
    el.style.border = '2px solid orange';
    el.style.backgroundColor = 'rgba(255, 165, 0, 0.1)';
  });
}

function sendDataToAI(data) {
  if (isProcessing) return;
  isProcessing = true;
  console.log('Wysyłanie danych do AI:', data);
  chrome.runtime.sendMessage({ action: 'sendDataToAI', data: { question: data.question, answers: data.answers } });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startAutoDetection') {
    const { question, answers, questionElement, answerElements } = findQuizElements();
    
    if (question && answers.length > 1) {
      highlightElements(questionElement, answerElements);
      sendDataToAI({ question, answers });
    } else {
      alert('Nie udało się automatycznie wykryć pytania i odpowiedzi. Spróbuj trybu ze zrzutem ekranu.');
      isProcessing = false;
    }
  }

  if (request.action === 'highlightAnswer') {
    const { answer: answerText, autoSelect } = request;
    console.log('Otrzymano odpowiedź od AI:', answerText, 'AutoSelect:', autoSelect);
    
    // Usuń poprzednie podświetlenia
    document.querySelectorAll('[style*="border: 3px solid blue"], [style*="border: 2px solid orange"]').forEach(el => {
      el.style.border = '';
      el.style.backgroundColor = '';
    });

    const allElements = Array.from(document.querySelectorAll('body *'));
    let bestMatchElement = null;
    let highestScore = 0;

    allElements.forEach(el => {
      const elText = getTextFromElement(el);
      if (!elText) return;

      const score = similarity(elText, answerText);
      if (score > highestScore) {
        highestScore = score;
        bestMatchElement = el;
      }
    });

    if (bestMatchElement && highestScore > 0.5) { // Użyj progu podobieństwa
      console.log('✅ Znaleziono pasujący element z wynikiem:', highestScore, bestMatchElement);
      
      bestMatchElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      bestMatchElement.style.backgroundColor = 'lightgreen';
      bestMatchElement.style.border = '4px solid green';
      bestMatchElement.style.padding = '5px';
      bestMatchElement.style.borderRadius = '5px';
      
      // **NOWOŚĆ: Pogrubienie pierwszej litery**
      const originalText = bestMatchElement.innerText;
      if (originalText && originalText.length > 0) {
        const firstLetter = originalText.charAt(0);
        const restOfText = originalText.slice(1);
        bestMatchElement.innerHTML = `<strong>${firstLetter}</strong>${restOfText}`;
      }

      // **NOWOŚĆ: Automatyczne zaznaczanie odpowiedzi**
      if (autoSelect) {
        setTimeout(() => {
          // Szukaj inputa wewnątrz, lub powiązanego przez label
          let input = bestMatchElement.querySelector('input[type="radio"], input[type="checkbox"]');
          if (!input) {
            const label = bestMatchElement.closest('label');
            if (label) {
              input = document.getElementById(label.getAttribute('for')) || label.querySelector('input');
            }
          }
          
          if (input) {
            input.checked = true;
            // Symuluj kliknięcie, aby wywołać eventy na stronie
            input.click(); 
            console.log('🤖 Automatycznie zaznaczono input.');
          } else if (bestMatchElement.click) {
            // Jeśli nie ma inputa, po prostu kliknij element
            bestMatchElement.click();
            console.log('🤖 Automatycznie kliknięto element.');
          }
        }, 300); // Małe opóźnienie
      }

    } else {
      alert(`AI odpowiedziało: "${answerText}"\n\nNie znaleziono dokładnie pasującego elementu na stronie. Sprawdź odpowiedź manualnie.`);
    }
    
    isProcessing = false;
  }

  if (request.action === 'error') {
    alert(`Wystąpił błąd: ${request.message}`);
    isProcessing = false;
  }
});

// Funkcja pomocnicza do porównywania stringów (prosta wersja)
function similarity(s1, s2) {
    let longer = s1;
    let shorter = s2;
    if (s1.length < s2.length) {
        longer = s2;
        shorter = s1;
    }
    let longerLength = longer.length;
    if (longerLength === 0) {
        return 1.0;
    }
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) {
            costs[s2.length] = lastValue;
        }
    }
    return costs[s2.length];
}