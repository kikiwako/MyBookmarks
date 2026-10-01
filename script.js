// ========== Core Dice Functions ==========

const rollDice = (faces, bonus = 0) => {
    return Math.ceil(Math.random() * faces) + bonus;
};

const rollDices = (number, faces, flatBonus = 0, perDieBonus = 0) => {
    let total = flatBonus;
    let results = '';

    for (let i = 0; i < number; i++) {
        const lastRoll = rollDice(faces, perDieBonus);
        const baseValue = lastRoll - perDieBonus;  // Value before per-die bonus
        total += lastRoll;
        
        // Mark max/min individual dice
        let rollText = `${lastRoll}`;
        if (baseValue === faces) {
            rollText = `<span class="die-max">${lastRoll}</span>`;
        } else if (baseValue === 1) {
            rollText = `<span class="die-min">${lastRoll}</span>`;
        }
        
        results += (i === 0 ? '' : '+') + rollText;
    }

    return { total, result: `${number}d${faces}(${results})` };
};

/**
 * Rolls with advantage (higher) or disadvantage (lower).
 */
const rollDicesAdv = (number, faces, flatBonus = 0, perDieBonus = 0, advantage = true) => {
    // Roll two independent sets
    const roll1 = rollDices(number, faces, flatBonus, perDieBonus);
    const roll2 = rollDices(number, faces, flatBonus, perDieBonus);

    let useRoll, label, highlightClass;
    if (advantage) {
        useRoll = Math.max(roll1.total, roll2.total);
        label = 'adv';
        highlightClass = 'adv-chosen';
    } else {
        useRoll = Math.min(roll1.total, roll2.total);
        label = 'dis';
        highlightClass = 'dis-chosen';
    }

    // Mark which roll was chosen
    const r1Text = roll1.total === useRoll 
        ? `<span class="${highlightClass}">${roll1.total}</span>` 
        : roll1.total;
    const r2Text = roll2.total === useRoll 
        ? `<span class="${highlightClass}">${roll2.total}</span>` 
        : roll2.total;

    const results = `${label}[${r1Text},${r2Text}]`;

    return { total: useRoll, result: results };
};

const NUMBERS = '0123456789'.split('');
const OPERATORS = '+-'.split('');

const splitRollOperations = (str = '') => {
    const operations = [];
    let lastElement = '';
    let lastElementType = '+';

    str.split('').forEach(char => {
        const isDiceOrDigit = ['d', ...NUMBERS].includes(char);
        const isBracket = ['[', ']'].includes(char);
        const isOperator = OPERATORS.includes(char);

        if (isDiceOrDigit) {
            lastElement += char;
        } else if (isBracket) {
            // Brackets are part of dice expressions (e.g., 1d20[adv])
            lastElement += char;
        } else if (isOperator) {
            if (lastElement) {
                operations.push(lastElementType + lastElement);
                lastElement = '';
            }
            lastElementType = char;
        } else {
            throw `Unexpected Character: "${char}"`;
        }
    });

    if (lastElement) {
        operations.push(lastElementType + lastElement);
    }

    return operations;
};

const rollString = (str) => {
    const operations = splitRollOperations(str);

    let total = 0;
    let results = '';
    let max = 0;
    let min = 0;

    operations.forEach(operation => {
        if (operation.includes('d')) {
            const operator = operation[0];
            const parts = operation.slice(1).split('d');
            const number = parseInt(parts[0], 10);
            const facesRest = parts[1];
    
            if (isNaN(number)) {
                throw `Invalid number in dice expression: "${operation}"`;
            }
    
            // Extract modifier from brackets: 1d20[adv] or 1d20[dis]
            let faces = parseInt(facesRest, 10);
            let advantageMode = null;
    
            if (facesRest.includes('[adv]')) {
                faces = parseInt(facesRest.replace('[adv]', ''), 10);
                advantageMode = true;
            } else if (facesRest.includes('[dis]')) {
                faces = parseInt(facesRest.replace('[dis]', ''), 10);
                advantageMode = false;
            }
    
            if (isNaN(faces)) {
                throw `Invalid faces in dice expression: "${operation}"`;
            }
    
            let roll;
            if (advantageMode !== null) {
                roll = rollDicesAdv(number, faces, 0, 0, advantageMode);
            } else {
                roll = rollDices(number, faces, 0, 0);
            }
    
            const signed = operator === '-' ? -roll.total : roll.total;
    
            min += operator === '-' ? -faces * number : number;
            max += operator === '-' ? -number : faces * number;
            total += signed;
            results += operator + roll.result;
        } else {
            const value = parseInt(operation, 10);
            min += value;
            max += value;
            total += value;
            results += operation;
        }
    });

    if (total === max) {
        results = `[MAX] <span class="roll-max">${results}</span>`;
    } else if (total === min) {
        results = `<min> <span class="roll-min">${results}</span>`;
    }

    return { total, results };
};

const rollAction = (action, title = null) => {
    const results = {};
    const lines = [];

    Object.keys(action).forEach((key) => {
        results[key] = rollString(action[key]);
        const total = results[key].total;
        const breakdown = results[key].results;
        lines.push(`<span class="roll-key">${key}:</span> <strong>${total}</strong> <span class="roll-breakdown">[${breakdown}]</span>`);
    });

    if (title) {
        lines.unshift(`<span class="action-title">${title}:</span>`);
    }

    appendGroupLog(lines.join('\n'), 'roll-group');

    return results;
};

const pad = (val, lgt) => {
    const str = `${val}`;
    if (lgt <= str.length) return str;
    const diff = lgt - str.length;
    return str.padStart(Math.ceil(lgt - (diff / 2)), " ")
            .padEnd(Math.floor(lgt), " ");
};

const buildButtons = (data, parentElement, path = []) => {
    Object.entries(data).forEach(([key, value]) => {
        if (typeof value === 'string' && value.includes('d')) {
            // Leaf roll string - skip, parent will roll this
            return;
        } else if (typeof value === 'object' && value !== null) {
            // Check if this object has roll strings at THIS level
            const hasRollStrings = Object.values(value).some(v => typeof v === 'string' && v.includes('d'));
            
            if (hasRollStrings) {
                // Create button that rolls all sub-rolls together
                const btn = document.createElement('button');
                btn.textContent = key;
                btn.style.marginLeft = `${path.length * 10}px`;
                btn.addEventListener('click', () => {
                    const actionName = [...path, key].join(' > ');
                    rollAction(value, actionName); // Pass title instead of separate appendLog
                });
                parentElement.appendChild(btn);
            } else {
                // No roll strings at this level, recurse deeper
                const subHeading = document.createElement('h4');
                subHeading.textContent = key;
                subHeading.style.marginTop = '8px';
                parentElement.appendChild(subHeading);
                
                const subContainer = document.createElement('div');
                buildButtons(value, subContainer, [...path, key]);
                parentElement.appendChild(subContainer);
            }
        }
    });
};

const updateFixedDisplay = (entryClone) => {
    const fixedContent = document.getElementById('fixed-content');
    
    if (entryClone) {
        entryClone.removeAttribute('id');
        entryClone.id = '';
        
        const subRolls = entryClone.querySelectorAll('.sub-roll');
        subRolls.forEach(sr => sr.style.opacity = '0.7');
        
        fixedContent.innerHTML = entryClone.innerHTML;
        fixedContent.parentElement.style.display = 'block';
    } else {
        fixedContent.parentElement.style.display = 'none';
    }
};

// ===== HISTORY MANAGEMENT =====
const HISTORY_KEY = 'diceRollerHistory';
const MAX_HISTORY = 5;

const executeRoll = (expression, addToHistory = true) => {
    try {
        const result = rollString(expression);
        appendLog(`🎲 <strong>${expression}</strong> → Total: ${result.total} [${result.results}]`, 'roll');
        
        if (addToHistory) {
            saveToHistory(expression);
        }
    } catch (e) {
        appendLog(`❌ Error: ${e.message}`, 'error');
    }
};

const saveToHistory = (rollStringText) => {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    history = history.filter(h => h !== rollStringText);
    history.unshift(rollStringText);
    history = history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistoryButtons();
};

const renderHistoryButtons = () => {
    const historyContainer = document.getElementById('history-buttons');
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    
    if (history.length === 0) {
        historyContainer.style.display = 'none';
        historyContainer.innerHTML = '';
        return;
    }
    
    historyContainer.style.display = 'flex';
    historyContainer.style.flexWrap = 'wrap';
    historyContainer.style.gap = '4px';
    historyContainer.style.marginTop = '8px';
    historyContainer.innerHTML = '';
    
    history.forEach((text, index) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.className = 'history-button';
        btn.title = `Recent roll #${index + 1}`;
        
        btn.addEventListener('click', () => {
            executeRoll(text, false);
        });
        
        historyContainer.appendChild(btn);
    });
};

// ========== UI Wiring ==========

const outputEl = document.getElementById('output');
const actionsContainer = document.getElementById('actions-container');
const jsonInput = document.getElementById('json-input');
const parseError = document.getElementById('parse-error');
const rollStringInput = document.getElementById('roll-string-input');
const rollStringBtn = document.getElementById('roll-string-btn');
const rollStringOutput = document.getElementById('roll-string-output');

// Track entry count for uniqueness
let entryCounter = 0;

// New logging function with timestamp and styling
const appendLog = (line, type = 'roll') => {
    const timestamp = new Date().toLocaleTimeString();
    const entryId = ++entryCounter;
    
    const entryDiv = document.createElement('div');
    entryDiv.className = `roll-entry ${type}`;
    entryDiv.id = `entry-${entryId}`;
    entryDiv.innerHTML = `<span class="timestamp">${timestamp}</span>${line}`;
    
    outputEl.insertBefore(entryDiv, outputEl.firstChild);
    updateFixedDisplay(entryDiv.cloneNode(true));
};

const appendGroupLog = (content, type = 'roll-group') => {
    const timestamp = new Date().toLocaleTimeString();
    const entryId = ++entryCounter;
    
    const entryDiv = document.createElement('div');
    entryDiv.className = `roll-entry ${type}`;
    entryDiv.id = `entry-${entryId}`;
    
    const lines = content.split('\n');
    let innerHTML = `<span class="timestamp">${timestamp}</span>`;
    innerHTML += `<div class="group-content">${lines.map((line, i) =>
        i === 0 ? `<strong>${line}</strong>` :
        `<div class="sub-roll">${line}</div>`
    ).join('')}</div>`;
    
    entryDiv.innerHTML = innerHTML;
    
    outputEl.insertBefore(entryDiv, outputEl.firstChild);
    
    updateFixedDisplay(entryDiv.cloneNode(true));
};

// Load default JSON on page load
const DEFAULT_ROLL_OBJECT = {
      "Yasha Dreamchaser": {
        "Defense Abilities": {
          "Hadozee Dodge": {
            "Reduce damage": "1d6+4"
          },
          "Deflect Missile": {
            "Reduce damage": "1d10+15"
          }
        },
        "Healing Abilities": {
          "Hand of Healing": {
            "Heal": "1d8+6"
          },
          "Hands of 1k Blessings": {
            "Heal": "2d10+18"
          },
          "Verdict: Absolve": {
            "Heal": "6d10"
          }
        },
        "Offensive Abilities": {
          "Hand of Harm": {
            "Necrotic or Radiant": "1d8+6"
          },
          "Verdict: Condemn": {
            "Necrotic or Radiant": "8d10"
          }
        },
        "Attacks": {
          "Unarmed Strike": {
            "Attack": "1d20+12",
            "Bludgeoning": "1d8+8",
            "Radiant or Necrotic": "2d10"
          },
          "Yklwa": {
            "Attack": "1d20+12",
            "Damage": "1d8+8",
            "Radiant or Necrotic": "2d10"
          },
          "Kukri": {
            "Attack": "1d20+12",
            "Damage": "1d8+8",
            "Radiant or Necrotic": "2d10"
          },
          "Tomahawk": {
            "Attack": "1d20+12",
            "Damage": "1d8+8",
            "Radiant or Necrotic": "2d10"
          },
          "Hammer": {
            "Attack": "1d20+12",
            "Damage": "1d8+8",
            "Radiant or Necrotic": "2d10"
          },
          "Sling": {
            "Attack": "1d20+12",
            "Damage": "1d8+8",
            "Radiant or Necrotic": "2d10"
          },
          "Boomerang": {
            "Attack": "1d20+12",
            "Damage": "1d8+8",
            "Radiant or Necrotic": "2d10"
          },
          "Javelin of Lightning": {
            "Attack": "1d20+13",
            "Damage": "1d8+8",
            "Radiant or Necrotic": "2d10",
            "Lightning Throw": "4d6"
          }
        }
      }
};

document.addEventListener('DOMContentLoaded', () => {
    jsonInput.value = JSON.stringify(DEFAULT_ROLL_OBJECT, null, 4);
    renderHistoryButtons();
    appendLog('🎲 Ready. Use the roll field, load JSON, or call functions from console.', 'info');

    // Single roll string button
    rollStringBtn.addEventListener('click', () => {
        const expression = rollStringInput.value.trim();
        if (!expression) {
            appendLog('⚠️ Enter a roll string (e.g., "1d20+10")', 'error');
            return;
        }
    
        executeRoll(expression, true);
    });

    // Allow pressing Enter in roll string field
    rollStringInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            rollStringBtn.click();
        }
    });

    // Load JSON and create buttons
    document.getElementById('load-json-btn').addEventListener('click', () => {
        parseError.textContent = '';
        actionsContainer.innerHTML = '';
    
        let parsed;
        try {
            parsed = JSON.parse(jsonInput.value);
        } catch (e) {
            parseError.textContent = '⚠️ JSON Parse Error: ' + e.message;
            appendLog('⚠️ Failed to parse JSON: ' + e.message, 'error');
            return;
        }
    
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            parseError.textContent = '⚠️ Root must be an object: {"CharacterName": {...}}';
            appendLog('⚠️ JSON root must be an object', 'error');
            return;
        }
    
        appendLog('✅ Loading character actions...', 'info');
    
        Object.entries(parsed).forEach(([character, actions]) => {
            const heading = document.createElement('h2');
            heading.textContent = character;
            actionsContainer.appendChild(heading);
    
            if (typeof actions !== 'object' || actions === null) {
                appendLog(`⚠️ ${character}: Invalid actions object`, 'error');
                return;
            }
    
            buildButtons(actions, actionsContainer, [character]);
        });
    
        appendLog('✓ Loaded character actions! Click to roll.', 'info');
    });

    // Clear JSON button
    document.getElementById('clear-json-btn').addEventListener('click', () => {
        jsonInput.value = '';
        parseError.textContent = '';
        actionsContainer.innerHTML = '';
        appendLog('Cleared.', 'info');
    });
});

// Expose functions globally for console use
window.rollString = rollString;
window.rollDice = rollDice;
window.rollDices = rollDices;
window.rollAction = rollAction;
window.pad = pad;
