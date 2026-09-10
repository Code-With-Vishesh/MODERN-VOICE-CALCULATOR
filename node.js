// STATE
    const displayEl = document.getElementById('displayValue');
    const expressionEl = document.getElementById('expressionValue');
    const saidEl = document.getElementById('said');
    const mic = document.getElementById('mic');
    const micWrap = document.getElementById('micWrap');
    const micLabel = document.getElementById('micLabel');
    const micLabelText = micLabel.querySelector('.status-text');
    const micStatus = document.getElementById('micStatus');
    const themeLightBtn = document.getElementById('themeLightBtn');
    const themeDarkBtn = document.getElementById('themeDarkBtn');
    const toasts = document.getElementById('toasts');
    const html = document.documentElement;

    let expr = '';
    let lastResult = null;
    let justEvaluated = false;
    let calculatorMode = localStorage.getItem('calculatorMode') || 'basic';
    let angleMode = localStorage.getItem('calculatorAngleMode') || 'DEG';
    let memoryValue = Number(sessionStorage.getItem('calculatorMemory') || 0);
    let history = [];
    try { history = JSON.parse(localStorage.getItem('calculatorHistory') || '[]'); } catch { history = []; }
    if(!Array.isArray(history)) history = [];
    let recognition = null;
    let listening = false;
    let voiceCommandsEnabled = localStorage.getItem('voiceCommandsEnabled') !== 'false';
    let voiceFeedbackEnabled = localStorage.getItem('voiceFeedbackEnabled') !== 'false';
    let voiceLanguage = localStorage.getItem('voiceLanguage') || 'en-IN';
    let voiceRate = Number(localStorage.getItem('voiceRate') || 1);

    // THEME MANAGEMENT — extended appearance support: light, dark, and the operating-system preference.
    function applyTheme(theme){
      const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
      html.setAttribute('data-theme', resolved);
      themeLightBtn.classList.toggle('active', resolved === 'light');
      themeDarkBtn.classList.toggle('active', resolved === 'dark');
      themeLightBtn.setAttribute('aria-pressed', String(resolved === 'light'));
      themeDarkBtn.setAttribute('aria-pressed', String(resolved === 'dark'));
      document.querySelectorAll('input[name="theme"]').forEach(input => input.checked = input.value === theme);
      localStorage.setItem('voiceCalculatorTheme', theme);
    }

    themeLightBtn.addEventListener('click', () => { applyTheme('light'); showToast('Light theme enabled', 'success'); });
    themeDarkBtn.addEventListener('click', () => { applyTheme('dark'); showToast('Dark theme enabled', 'success'); });

    // Load saved theme
    const savedTheme = localStorage.getItem('voiceCalculatorTheme') || 'dark';
    applyTheme(savedTheme);

    // Toast helper — type is 'success' | 'warning' | 'error' | 'info'
    const TOAST_ICONS = { success: '✓', warning: '⚠', error: '✕', info: 'ℹ' };
    function showToast(msg, type = 'info', timeout = 2500){
      const el = document.createElement('div');
      el.className = `toast toast--${type}`;
      const icon = document.createElement('span');
      icon.className = 'toast-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = TOAST_ICONS[type] || TOAST_ICONS.info;
      const text = document.createElement('span');
      text.textContent = msg;
      el.append(icon, text);
      toasts.appendChild(el);
      const isMobile = window.matchMedia('(max-width: 640px)').matches;
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = isMobile ? 'translateY(30px)' : 'translateX(400px)';
        setTimeout(() => el.remove(), 400);
      }, timeout);
    }

    // Calculator UI actions
    let lastRenderedResultText = null;
    function getLivePreview(expression){
      const trimmed = (expression || '').trim();
      if(!trimmed) return { state: 'empty' };
      try{
        const value = evalExpression(trimmed);
        return { state: 'ok', value };
      } catch(e){
        if(e.message === 'DIV_BY_ZERO') return { state: 'div0' };
        return { state: 'invalid' };
      }
    }

    // The value currently shown in RESULT — the confirmed "=" result if one is
    // showing, otherwise the live preview of the expression being typed.
    function getDisplayedResultValue(){
      if(justEvaluated && lastResult !== null) return lastResult;
      const preview = getLivePreview(expr);
      return preview.state === 'ok' ? preview.value : null;
    }

    function setResultDisplay(text, isLive, isPlaceholder, isMessage){
      if(text !== lastRenderedResultText){
        lastRenderedResultText = text;
        displayEl.textContent = text;
        displayEl.classList.remove('result-updated');
        void displayEl.offsetWidth; // restart the CSS update animation
        displayEl.classList.add('result-updated');
      }
      displayEl.classList.toggle('placeholder', !!isPlaceholder);
      displayEl.classList.toggle('value--message', !!isMessage);
      if(liveBadge) liveBadge.hidden = !isLive;
    }

    function render(){
      expressionEl.textContent = expr || (justEvaluated && lastResult !== null ? formatNumber(lastResult) : '0');
      if(justEvaluated && lastResult !== null){
        setResultDisplay(formatNumber(lastResult), false, false, false);
        return;
      }
      const preview = getLivePreview(expr);
      if(preview.state === 'ok'){
        setResultDisplay(formatNumber(preview.value), true, false, false);
      } else if(preview.state === 'div0'){
        setResultDisplay('Cannot divide by zero', false, true, true);
      } else {
        setResultDisplay('—', false, true, false);
      }
    }

    function formatNumber(value){
      if(!Number.isFinite(Number(value))) return 'Error';
      const rounded = Math.round(Number(value) * 1e12) / 1e12;
      return Math.abs(rounded) >= 1e15 || (Math.abs(rounded) > 0 && Math.abs(rounded) < 1e-9)
        ? rounded.toExponential(8).replace(/\.0+e/, 'e')
        : new Intl.NumberFormat('en-US', {maximumFractionDigits: 12}).format(rounded);
    }

    function clearAll(){
      expr = '';
      lastResult = null;
      justEvaluated = false;
      saidEl.textContent = '—';
      render();
      showToast('Cleared', 'success');
    }

    function deleteLast(){
      if(justEvaluated){
        expr = String(lastResult ?? '');
        justEvaluated = false;
      }
      expr = expr.slice(0, -1);
      render();
    }

    function appendChar(ch){
      if(expr.length > 120) return;
      if(ch === '.'){
        const currentNumber = expr.split(/[+\-*/^%()]/).pop();
        if(currentNumber.includes('.')) return;
      }
      if(justEvaluated){
        // A number starts a new calculation; an operator continues from the result.
        expr = /[0-9.]/.test(ch) ? '' : String(lastResult ?? '');
        justEvaluated = false;
      }
      expr += ch;
      render();
    }

    // Safe evaluation using shunting-yard
    function tokenize(s){
      s = s.replace(/×/g, '*').replace(/÷/g, '/');
      const re = /\d*\.?\d+|[()+\-*/%]/g;
      return s.match(re) || [];
    }

    function applyOp(a, op, b){
      a = Number(a);
      b = Number(b);
      if(op == '+') return a + b;
      if(op == '-') return a - b;
      if(op == '*') return a * b;
      if(op == '/'){
        if(b === 0) throw new Error('DIV_BY_ZERO');
        return a / b;
      }
      return 0;
    }

    function precedence(op){
      if(op == '+' || op == '-') return 1;
      if(op == '*' || op == '/') return 2;
      return 0;
    }

    function evalExpression(input){
      if(!input || !input.trim()) throw new Error('EMPTY');
      const source = input.toLowerCase().replace(/×/g, '*').replace(/÷/g, '/');
      const tokens = [];
      const pattern = /\s*(?:(\d*\.?\d+(?:e[+-]?\d+)?)|([a-z]+)|(.))/igy;
      let match;
      while((match = pattern.exec(source))){
        if(match[1]) tokens.push({type:'number', value:Number(match[1])});
        else if(match[2]) tokens.push({type:'name', value:match[2]});
        else if('+-*/^%!()'.includes(match[3])) tokens.push({type:'op', value:match[3]});
        else throw new Error('INVALID');
      }
      let position = 0;
      const peek = () => tokens[position];
      const take = () => tokens[position++];
      const accept = value => peek() && peek().value === value ? (take(), true) : false;
      const finite = value => { if(!Number.isFinite(value)) throw new Error('RANGE'); return value; };
      const factorial = value => {
        if(!Number.isInteger(value) || value < 0) throw new Error('FACTORIAL');
        if(value > 170) throw new Error('RANGE');
        let total = 1; for(let i=2;i<=value;i++) total *= i; return total;
      };
      const callFunction = (name, value) => {
        const radians = angleMode === 'DEG' ? value * Math.PI / 180 : value;
        const degrees = value => angleMode === 'DEG' ? value * 180 / Math.PI : value;
        if(name === 'sin') return Math.sin(radians);
        if(name === 'cos') return Math.cos(radians);
        if(name === 'tan') return Math.tan(radians);
        if(name === 'asin') return degrees(Math.asin(value));
        if(name === 'acos') return degrees(Math.acos(value));
        if(name === 'atan') return degrees(Math.atan(value));
        if(name === 'sqrt') { if(value < 0) throw new Error('DOMAIN'); return Math.sqrt(value); }
        if(name === 'cbrt') return Math.cbrt(value);
        if(name === 'log') { if(value <= 0) throw new Error('DOMAIN'); return Math.log10(value); }
        if(name === 'ln') { if(value <= 0) throw new Error('DOMAIN'); return Math.log(value); }
        throw new Error('FUNCTION');
      };
      const primary = () => {
        const token = take();
        if(!token) throw new Error('INVALID');
        if(token.type === 'number') return token.value;
        if(token.value === '('){ const value = expression(); if(!accept(')')) throw new Error('PARENS'); return value; }
        if(token.type === 'name'){
          if(token.value === 'pi') return Math.PI;
          if(token.value === 'e') return Math.E;
          if(!accept('(')) throw new Error('FUNCTION');
          const value = expression(); if(!accept(')')) throw new Error('PARENS'); return finite(callFunction(token.value, value));
        }
        throw new Error('INVALID');
      };
      const unary = () => accept('+') ? unary() : accept('-') ? -unary() : primary();
      const postfix = () => { let value = unary(); while(accept('!')) value = factorial(value); if(accept('%')) value /= 100; return value; };
      const power = () => { const left = postfix(); return accept('^') ? finite(Math.pow(left, power())) : left; };
      const term = () => { let value = power(); while(peek() && ['*','/'].includes(peek().value)){ const op=take().value, right=power(); if(op==='/' && right===0) throw new Error('DIV_BY_ZERO'); value=finite(op==='*'?value*right:value/right); } return value; };
      const expression = () => { let value = term(); while(peek() && ['+','-'].includes(peek().value)){ const op=take().value; value=finite(op==='+'?value+term():value-term()); } return value; };
      const result = expression();
      if(position !== tokens.length) throw new Error('INVALID');
      return finite(result);
    }

    // Use one calculation path for buttons, keyboard input, and voice input.
    function calculate(){
      const value = evalExpression(expr);
      lastResult = value;
      justEvaluated = true;
      addHistory(expr, value);
      render();
      return value;
    }

    const historyList = document.getElementById('historyList');
    const memoryIndicator = document.getElementById('memoryIndicator');
    const scientificKeys = document.getElementById('scientificKeys');
    const basicKeypad = document.getElementById('basicKeypad');
    const smartTools = document.getElementById('smartTools');

    function saveHistory(){ localStorage.setItem('calculatorHistory', JSON.stringify(history.slice(0, 150))); }
    function addHistory(expression, result){
      if(!expression) return;
      history.unshift({id: Date.now() + Math.random(), expression, result, mode: calculatorMode, timestamp: Date.now()});
      history = history.slice(0, 150); saveHistory(); renderHistory();
    }
    function renderHistory(query = ''){
      const term = query.trim().toLowerCase();
      const items = history.filter(item => `${item.expression} ${formatNumber(item.result)}`.toLowerCase().includes(term));
      historyList.innerHTML = items.length ? '' : '<p class="muted">No calculations yet.</p>';
      items.forEach(item => {
        const row = document.createElement('div'); row.className = 'history-item';
        const text = document.createElement('div'); text.className = 'history-text';
        const expressionLine = document.createElement('div'); expressionLine.textContent = item.expression;
        const resultLine = document.createElement('div'); resultLine.className = 'history-result'; resultLine.textContent = `= ${formatNumber(item.result)}`;
        text.append(expressionLine, resultLine);
        row.append(text);
        [['Copy','copy'],['Use','use'],['Delete','delete']].forEach(([label, action]) => {
          const button = document.createElement('button'); button.className='utility-btn'; button.textContent=label; button.dataset.historyAction=action; button.dataset.historyId=item.id; button.setAttribute('aria-label', `${label} history calculation`); row.append(button);
        });
        historyList.append(row);
      });
    }
    function updateMemory(){
      const hasMemory = memoryValue !== 0;
      memoryIndicator.hidden = !hasMemory;
      memoryIndicator.title = hasMemory ? `Memory: ${formatNumber(memoryValue)}` : '';
      sessionStorage.setItem('calculatorMemory', String(memoryValue));
    }
    function getCurrentValue(){ return justEvaluated && lastResult !== null ? lastResult : evalExpression(expr); }
    function setMode(mode){
      calculatorMode = mode; localStorage.setItem('calculatorMode', mode);
      scientificKeys.hidden = mode !== 'scientific';
      smartTools.hidden = mode !== 'tools';
      basicKeypad.hidden = mode === 'tools';
      document.querySelector('.memory-row').hidden = mode === 'tools';
      document.querySelectorAll('[data-mode]').forEach(btn => { const active = btn.dataset.mode === mode; btn.classList.toggle('active', active); btn.setAttribute('aria-pressed', active); });
    }
    function setAngleMode(mode){
      angleMode = mode; localStorage.setItem('calculatorAngleMode', mode);
      document.querySelectorAll('[data-angle]').forEach(btn => { const active = btn.dataset.angle === mode; btn.classList.toggle('active', active); btn.setAttribute('aria-pressed', active); });
    }
    async function copyText(value, success){
      try { if(navigator.clipboard) await navigator.clipboard.writeText(value); else { const area=document.createElement('textarea'); area.value=value; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); } showToast(success, 'success'); }
      catch { showToast('Copy failed. Please select the text manually.', 'error'); }
    }
    function calculationText(){ return `${expr || '0'} = ${formatNumber(lastResult ?? 0)}`; }
    function friendlyError(error){
      const messages = {DIV_BY_ZERO:'Cannot divide by zero.', EMPTY:'Enter a calculation first.', PARENS:'Check the parentheses.', FACTORIAL:'Factorial needs a whole number of 0 or more.', DOMAIN:'That value is outside the real-number range.', RANGE:'Result is outside the supported range.', FUNCTION:'Unknown or incomplete function.', INVALID:'Invalid expression.'};
      return messages[error.message] || 'Cannot calculate that expression.';
    }

    // Button wiring
    document.querySelectorAll('button.key').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const value = btn.dataset.value;
        if(action === 'clear') clearAll();
        else if(action === 'back') deleteLast();
        else if(action === 'percent') appendChar('%');
        else if(action === 'square') appendChar('^2');
        else if(action === 'cube') appendChar('^3');
        else if(action === 'reciprocal'){
          expr = `1/(${expr || (lastResult ?? 0)})`;
          justEvaluated = false;
          render();
        }
        else if(action === 'equals'){
          try{
            calculate();
            showToast('Calculated', 'success');
          } catch(e){
            showToast(friendlyError(e), 'error');
          }
        } else if(value) appendChar(value);
      });
    });

    document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
    document.querySelectorAll('[data-angle]').forEach(btn => btn.addEventListener('click', () => setAngleMode(btn.dataset.angle)));
    document.querySelectorAll('[data-memory]').forEach(btn => btn.addEventListener('click', () => {
      try{
        const action = btn.dataset.memory;
        if(action === 'clear') memoryValue = 0;
        if(action === 'recall') appendChar(formatNumber(memoryValue).replace(/,/g, ''));
        if(action === 'add') memoryValue += getCurrentValue();
        if(action === 'subtract') memoryValue -= getCurrentValue();
        updateMemory(); showToast(action === 'clear' ? 'Memory cleared' : action === 'recall' ? 'Memory recalled' : 'Memory updated', 'success');
      } catch { showToast('Enter a valid value first.', 'warning'); }
    }));
    document.getElementById('copyResult').addEventListener('click', () => copyText(formatNumber(lastResult ?? evalExpression(expr || '0')), 'Result copied'));
    document.getElementById('copyExpression').addEventListener('click', () => copyText(expr || '0', 'Expression copied'));
    document.getElementById('shareCalculation').addEventListener('click', async () => {
      const text = calculationText();
      try { if(navigator.share) await navigator.share({title:'Smart Calculator', text}); else await copyText(text, 'Calculation copied for sharing'); }
      catch(error) { if(error.name !== 'AbortError') showToast('Unable to share calculation.', 'error'); }
    });
    document.getElementById('historyToggle').addEventListener('click', () => { const panel=document.getElementById('historyPanel'); panel.hidden=!panel.hidden; if(!panel.hidden) renderHistory(); });
    document.getElementById('settingsToggle').addEventListener('click', () => { const panel=document.getElementById('settingsPanel'); panel.hidden=!panel.hidden; });
    document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => document.getElementById(btn.dataset.close).hidden=true));
    document.getElementById('historySearch').addEventListener('input', event => renderHistory(event.target.value));
    historyList.addEventListener('click', event => {
      const button = event.target.closest('[data-history-action]'); if(!button) return;
      const index = history.findIndex(item => String(item.id) === button.dataset.historyId); if(index < 0) return;
      const item = history[index];
      if(button.dataset.historyAction === 'copy') copyText(`${item.expression} = ${formatNumber(item.result)}`, 'Calculation copied');
      if(button.dataset.historyAction === 'use') { expr=item.expression; lastResult=item.result; justEvaluated=true; render(); showToast('Calculation restored', 'success'); }
      if(button.dataset.historyAction === 'delete') { history.splice(index,1); saveHistory(); renderHistory(document.getElementById('historySearch').value); }
    });
    document.getElementById('clearHistory').addEventListener('click', () => { if(confirm('Clear all saved calculation history?')) { history=[]; saveHistory(); renderHistory(); showToast('History cleared', 'success'); } });
    document.querySelectorAll('input[name="theme"]').forEach(input => input.addEventListener('change', () => { if(input.checked) { applyTheme(input.value); showToast(`${input.value} theme enabled`, 'success'); } }));
    function applyAccessibility(){
      const highContrast = localStorage.getItem('calculatorHighContrast') === 'true';
      const reduceMotion = localStorage.getItem('calculatorReduceMotion') === 'true';
      const largeButtons = localStorage.getItem('calculatorLargeButtons') === 'true';
      html.classList.toggle('high-contrast', highContrast);
      html.classList.toggle('reduce-motion', reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches);
      html.classList.toggle('large-buttons', largeButtons);
      document.getElementById('highContrast').checked = highContrast;
      document.getElementById('reduceMotion').checked = reduceMotion;
      document.getElementById('largeButtons').checked = largeButtons;
    }
    [['highContrast','calculatorHighContrast'],['reduceMotion','calculatorReduceMotion'],['largeButtons','calculatorLargeButtons']].forEach(([id, key]) => document.getElementById(id).addEventListener('change', event => { localStorage.setItem(key, event.target.checked); applyAccessibility(); }));
    function applyVoicePreferences(){
      document.getElementById('voiceCommands').checked=voiceCommandsEnabled;
      document.getElementById('voiceFeedback').checked=voiceFeedbackEnabled;
      document.getElementById('voiceLanguage').value=voiceLanguage;
      document.getElementById('voiceRate').value=String(voiceRate);
    }
    document.getElementById('voiceCommands').addEventListener('change', event => { voiceCommandsEnabled=event.target.checked; localStorage.setItem('voiceCommandsEnabled',voiceCommandsEnabled); if(!voiceCommandsEnabled && listening) recognition?.stop(); });
    document.getElementById('voiceFeedback').addEventListener('change', event => { voiceFeedbackEnabled=event.target.checked; localStorage.setItem('voiceFeedbackEnabled',voiceFeedbackEnabled); if(!voiceFeedbackEnabled && 'speechSynthesis' in window) speechSynthesis.cancel(); });
    document.getElementById('voiceLanguage').addEventListener('change', event => { voiceLanguage=event.target.value; localStorage.setItem('voiceLanguage',voiceLanguage); });
    document.getElementById('voiceRate').addEventListener('change', event => { voiceRate=Number(event.target.value); localStorage.setItem('voiceRate',voiceRate); });

    // Smart finance tools: pure calculations plus one small UI adapter.
    const financeResult = document.getElementById('financeResult');
    const financeError = document.getElementById('financeError');
    const financeActions = document.querySelector('.finance-actions');
    let financeSummary = '';
    const money = value => new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', minimumFractionDigits:2, maximumFractionDigits:2}).format(value);
    const numberFrom = (form, name, label, {integer=false, positive=false} = {}) => {
      const raw = String(form.elements[name].value).trim();
      if(raw === '') throw new Error(label);
      const value = Number(raw);
      if(!Number.isFinite(value) || (positive ? value <= 0 : value < 0) || (integer && !Number.isInteger(value))) throw new Error(label);
      return value;
    };
    const showFinance = (title, lines) => {
      financeSummary = `${title}\n${lines.map(([label, value]) => `${label}: ${value}`).join('\n')}`;
      financeResult.replaceChildren();
      const heading=document.createElement('strong'); heading.textContent=title; financeResult.append(heading);
      lines.forEach(([label, value]) => { const line=document.createElement('div'); line.textContent=`${label}: ${value}`; financeResult.append(line); });
      financeError.textContent=''; financeActions.hidden=false;
    };
    const financeFail = message => { financeError.textContent=message; financeActions.hidden=true; };
    function calculateFinance(form){
      const type=form.dataset.financeForm;
      if(type === 'percentage'){
        const kind=form.elements.kind.value, a=numberFrom(form,'rate','Please enter a valid first value.'), b=numberFrom(form,'value','Please enter a valid second value.');
        if(kind==='of') showFinance('PERCENTAGE RESULT', [[`${formatNumber(a)}% of ${formatNumber(b)}`,formatNumber(b*a/100)]]);
        else if(kind==='what'){ if(b===0) throw new Error('Total must be greater than zero.'); showFinance('PERCENTAGE RESULT', [[`${formatNumber(a)} is`,`${formatNumber(a/b*100)}% of ${formatNumber(b)}`]]); }
        else { if(a===0) throw new Error('Original value must be greater than zero.'); const change=(b-a)/a*100; showFinance('PERCENTAGE CHANGE', [[change >= 0 ? 'Increase' : 'Decrease',`${formatNumber(Math.abs(change))}%`],[ 'From / To',`${formatNumber(a)} / ${formatNumber(b)}`]]); }
      }
      if(type === 'discount'){
        const price=numberFrom(form,'price','Please enter a valid price.'), rate=numberFrom(form,'rate','Please enter a valid discount.');
        if(rate >= 100) throw new Error('Discount must be less than 100%.');
        if(form.elements.kind.value==='reverse'){ const original=price/(1-rate/100); showFinance('ORIGINAL PRICE', [['Original price',money(original)],['Amount saved',money(original-price)]]); }
        else { const quantity=numberFrom(form,'quantity','Quantity must be at least 1.',{integer:true,positive:true}), subtotal=price*quantity, saved=subtotal*rate/100; showFinance('FINAL PRICE', [['Subtotal',money(subtotal)],['Discount',money(saved)],[ 'Final total',money(subtotal-saved)]]); }
      }
      if(type === 'gst'){
        const amount=numberFrom(form,'amount','Please enter a valid amount.'), rate=numberFrom(form,'rate','Please enter a valid GST rate.');
        const remove=form.elements.kind.value==='remove', base=remove ? amount/(1+rate/100) : amount, tax=remove ? amount-base : base*rate/100, total=remove ? amount : base+tax;
        showFinance(remove ? 'GST REMOVED' : 'GST ADDED', [['Base amount',money(base)],['GST rate',`${formatNumber(rate)}%`],['GST amount',money(tax)],['Grand total',money(total)]]);
      }
      if(type === 'tip'){
        const bill=numberFrom(form,'bill','Please enter a valid bill amount.'), tipRate=numberFrom(form,'tip','Please enter a valid tip rate.'), people=numberFrom(form,'people','Number of people must be at least 1.',{integer:true,positive:true}), taxRate=numberFrom(form,'tax','Please enter a valid tax rate.');
        const tax=bill*taxRate/100, tipBase=form.elements.tipAfterTax.checked ? bill+tax : bill, tip=tipBase*tipRate/100, total=bill+tax+tip;
        showFinance('TIP SUMMARY', [['Bill',money(bill)],['Tax',money(tax)],['Tip',money(tip)],['Total',money(total)],['Per person',money(total/people)]]);
      }
      if(type === 'split'){
        const bill=numberFrom(form,'bill','Please enter a valid bill amount.'), people=numberFrom(form,'people','Number of people must be at least 1.',{integer:true,positive:true}), tipRate=numberFrom(form,'tip','Please enter a valid tip rate.'), taxRate=numberFrom(form,'tax','Please enter a valid tax rate.');
        const tax=bill*taxRate/100, tip=bill*tipRate/100, total=bill+tax+tip, per=total/people, rounded=Math.floor(per*100)/100, remaining=total-rounded*people;
        showFinance('SPLIT BILL', [['Bill',money(bill)],['Tax',money(tax)],['Tip',money(tip)],['Total',money(total)],['Approx. per person',money(per)],['Rounding remaining',money(remaining)]]);
      }
    }
    function updatePercentageLabels(form){ const kind=form.elements.kind.value; form.querySelector('[data-percent-label]').firstChild.textContent=kind==='what'?'Part ':kind==='change'?'Original value ':'Percentage '; form.querySelector('[data-value-label]').firstChild.textContent=kind==='what'?'Total ':kind==='change'?'New value ':'Value '; }
    document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => { const tool=button.dataset.tool; document.querySelectorAll('[data-tool]').forEach(tab => { const active=tab===button; tab.classList.toggle('active',active); tab.setAttribute('aria-selected',active); }); document.querySelectorAll('[data-finance-form]').forEach(form => form.hidden=form.dataset.financeForm!==tool); localStorage.setItem('smartCalculator.financeTool',tool); financeError.textContent=''; financeResult.textContent='Enter your values and tap Calculate.'; financeActions.hidden=true; }));
    document.querySelectorAll('[data-finance-form]').forEach(form => { form.addEventListener('submit', event => { event.preventDefault(); try { calculateFinance(form); } catch(error) { financeFail(error.message || 'Please check your values.'); } }); form.addEventListener('reset', () => setTimeout(() => { financeError.textContent=''; financeResult.textContent='Enter your values and tap Calculate.'; financeActions.hidden=true; },0)); });
    document.querySelectorAll('.preset-row button').forEach(button => button.addEventListener('click', () => { const form=button.closest('form'); const target=form.dataset.financeForm==='tip' ? 'tip' : 'rate'; form.elements[target].value=button.dataset.preset; }));
    document.querySelector('[data-finance-form="percentage"] select').addEventListener('change', event => updatePercentageLabels(event.target.form));
    document.getElementById('copyFinance').addEventListener('click', () => copyText(financeSummary, 'Finance result copied'));
    document.getElementById('shareFinance').addEventListener('click', async () => { try { if(navigator.share) await navigator.share({title:'Smart Calculator', text:financeSummary}); else await copyText(financeSummary, 'Finance result copied for sharing'); } catch(error) { if(error.name !== 'AbortError') financeFail('Unable to share this result.'); } });

    // Keyboard support
    window.addEventListener('keydown', (e) => {
      if(e.target.matches('input, textarea, select')) return;
      if(e.key.match(/[0-9]/)) appendChar(e.key);
      else if(['+', '-', '*', '/', '.', '%', '(', ')', '^'].includes(e.key)) appendChar(e.key);
      else if(e.key === 'Enter'){
        e.preventDefault();
        try{
          calculate();
          showToast('Calculated', 'success');
        } catch(err){
          showToast(friendlyError(err), 'error');
        }
      } else if(e.key === 'Backspace') { e.preventDefault(); deleteLast(); }
      else if(e.key === 'Delete') clearAll();
      else if(e.key === 'Escape') clearAll();
    });

    // Voice command layer: maps recognized phrases to the existing UI and engines.
    const voiceDialog = document.getElementById('voiceDialog');
    const voiceDialogState = document.getElementById('voiceDialogState');
    const voiceLiveTranscript = document.getElementById('voiceLiveTranscript');
    function speak(text){
      if(!voiceFeedbackEnabled || !('speechSynthesis' in window)) return;
      speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang=voiceLanguage; utterance.rate=voiceRate; speechSynthesis.speak(utterance);
    }
    function selectFinanceTool(tool){ setMode('tools'); const tab=document.querySelector(`[data-tool="${tool}"]`); if(tab) tab.click(); return document.querySelector(`[data-finance-form="${tool}"]`); }
    function runVoiceFinance(tool, values){
      const form=selectFinanceTool(tool); Object.entries(values).forEach(([name,value]) => { if(form.elements[name]) form.elements[name].value=value; });
      if(tool==='percentage') updatePercentageLabels(form);
      calculateFinance(form); speak(financeSummary.replace(/\n/g, '. ')); showToast('Voice command recognized', 'success');
    }
    function handleVoiceInput(rawText, confidence=1){
      let text=rawText.toLowerCase().trim().replace(/[?!,]/g,' ');
      text=text.replace(/calculator clear karo/g,'clear').replace(/dark mode karo/g,'dark mode').replace(/answer repeat karo/g,'repeat answer').replace(/(\d+)\s+ka\s+square root/g,'square root of $1').replace(/(\d+)\s+ko\s+(\d+)\s+logon mein divide karo/g,'split $1 between $2 people');
      const number='(\\d+(?:\\.\\d+)?)';
      // Note: this function now throws on failure instead of swallowing the
      // error, so callers (mic result handler, example command chips) can
      // tell success and failure apart and drive the mic's visual state.
      if(/^(clear|clear calculator|reset calculator|clear everything)$/.test(text)){ clearAll(); speak('Calculator cleared.'); return true; }
      if(/^(delete last|delete last digit|backspace|remove last)$/.test(text)){ deleteLast(); speak('Deleted last entry.'); return true; }
      if(/^(repeat answer|say the answer again|repeat result)$/.test(text)){ if(lastResult===null) throw new Error('There is no answer to repeat.'); speak(`The answer is ${formatNumber(lastResult)}.`); return true; }
      if(/turn voice (feedback )?off/.test(text)){ voiceFeedbackEnabled=false; localStorage.setItem('voiceFeedbackEnabled','false'); applyVoicePreferences(); showToast('Voice feedback turned off.', 'info'); return true; }
      if(/turn voice (feedback )?on/.test(text)){ voiceFeedbackEnabled=true; localStorage.setItem('voiceFeedbackEnabled','true'); applyVoicePreferences(); speak('Voice feedback turned on.'); return true; }
      if(/dark (mode|theme)|turn on dark/.test(text)){ applyTheme('dark'); speak('Dark mode enabled.'); return true; }
      if(/light (mode|theme)|turn on light/.test(text)){ applyTheme('light'); speak('Light mode enabled.'); return true; }
      if(/system theme|automatic theme/.test(text)){ applyTheme('system'); speak('System theme enabled.'); return true; }
      if(/open scientific|scientific mode|switch to scientific/.test(text)){ setMode('scientific'); speak('Scientific mode open.'); return true; }
      if(/open discount/.test(text)){ selectFinanceTool('discount'); speak('Discount calculator open.'); return true; }
      if(/open (gst|tax)/.test(text)){ selectFinanceTool('gst'); speak('GST calculator open.'); return true; }
      if(/open tip/.test(text)){ selectFinanceTool('tip'); speak('Tip calculator open.'); return true; }
      if(/open split/.test(text)){ selectFinanceTool('split'); speak('Split bill calculator open.'); return true; }
      if(/open percentage/.test(text)){ selectFinanceTool('percentage'); speak('Percentage calculator open.'); return true; }
      if(/open (finance|tools)|finance calculator/.test(text)){ setMode('tools'); speak('Smart tools open.'); return true; }
      if(/memory recall|recall memory/.test(text)){ appendChar(String(memoryValue)); speak('Memory recalled.'); return true; }
      if(/clear memory/.test(text)){ memoryValue=0; updateMemory(); speak('Memory cleared.'); return true; }
      if(/memory plus|add this to memory|add to memory/.test(text)){ memoryValue+=getCurrentValue(); updateMemory(); speak('Memory updated.'); return true; }
      let match;
      if((match=text.match(new RegExp(`${number}\\s*percent\\s*(?:off|discount on)\\s*${number}`)))){ runVoiceFinance('discount',{kind:'standard',rate:match[1],price:match[2],quantity:1}); return true; }
      if((match=text.match(new RegExp(`remove\\s+${number}\\s*percent\\s*gst\\s*from\\s*${number}`)))){ runVoiceFinance('gst',{kind:'remove',rate:match[1],amount:match[2]}); return true; }
      if((match=text.match(new RegExp(`${number}\\s*(?:plus|with)\\s*${number}\\s*percent\\s*gst`)))){ runVoiceFinance('gst',{kind:'add',amount:match[1],rate:match[2]}); return true; }
      if((match=text.match(new RegExp(`${number}\\s*percent\\s*tip\\s*on\\s*${number}(?:\\s*for\\s*${number}\\s*people)?`)))){ runVoiceFinance('tip',{tip:match[1],bill:match[2],people:match[3]||1,tax:0}); return true; }
      if((match=text.match(new RegExp(`split\\s+${number}\\s+between\\s+${number}\\s+people(?:\\s+with\\s+${number}\\s*percent\\s*tip)?`)))){ runVoiceFinance('split',{bill:match[1],people:match[2],tip:match[3]||0,tax:0}); return true; }
      if((match=text.match(new RegExp(`${number}\\s*percent\\s*of\\s*${number}`)))){ runVoiceFinance('percentage',{kind:'of',rate:match[1],value:match[2]}); return true; }
      // Chromium commonly reports 0 when it does not provide a confidence
      // score. Treat that as unavailable, not as an unsuccessful command.
      if(Number.isFinite(confidence) && confidence > 0 && confidence < 0.45) throw new Error("I couldn't understand that clearly. Please try again.");
      const expression=spokenToExpression(text);
      if(!expression || !/[0-9pie]/.test(expression)) throw new Error("I couldn't identify a complete calculation.");
      expr=expression; calculate(); saidEl.textContent=`"${rawText}"`; showToast('Voice command recognized', 'success'); speak(`The answer is ${formatNumber(lastResult)}.`); return true;
    }

    // Mic UI state machine: idle | listening | processing | success | error | unsupported
    let micResetTimer = null;
    function setMicState(state, text){
      mic.dataset.state = state;
      if(micWrap) micWrap.dataset.state = state;
      micLabel.dataset.state = state;
      if(text != null) micLabelText.textContent = text;
      mic.setAttribute('aria-label', state === 'listening' ? 'Stop voice input' : 'Start voice input');
      if(typeof voiceDialogState !== 'undefined' && voiceDialogState && text != null) voiceDialogState.textContent = text;
    }
    function scheduleIdleReset(delay = 2200){
      clearTimeout(micResetTimer);
      micResetTimer = setTimeout(() => { if(!listening) setMicState('idle', 'Tap to speak'); }, delay);
    }
    function pulseMicClick(){
      mic.classList.remove('pulse-click');
      // Force reflow so the animation can re-trigger on rapid clicks.
      void mic.offsetWidth;
      mic.classList.add('pulse-click');
      setTimeout(() => mic.classList.remove('pulse-click'), 400);
    }

    // Voice recognition
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    if(!SpeechRec){
      micStatus.textContent = "Voice input isn't supported in this browser.";
      setMicState('unsupported', "Not supported");
      mic.setAttribute('aria-disabled', 'true');
    } else {
      recognition = new SpeechRec();
      recognition.lang = voiceLanguage;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.addEventListener('start', () => {
        listening = true;
        clearTimeout(micResetTimer);
        try{ const beep=document.getElementById('micActivationSound'); if(beep){ beep.currentTime=0; beep.play().catch(()=>{}); } } catch(e){}
        setMicState('listening', 'Listening...');
        voiceDialog.hidden = false;
        voiceLiveTranscript.textContent = 'Say a calculation or command';
        showToast('Listening...', 'info');
      });

      recognition.addEventListener('end', () => {
        listening = false;
        // Only snap back to idle here if nothing else (result/error) already
        // moved the UI into processing/success/error — those states manage
        // their own reset timing via scheduleIdleReset().
        if(mic.dataset.state === 'listening') setMicState('idle', 'Tap to speak');
      });

      recognition.addEventListener('result', (ev) => {
        const result = ev.results[ev.resultIndex];
        const text = result[0].transcript;
        voiceLiveTranscript.textContent = `“${text}”`;
        if(!result.isFinal) return;
        setMicState('processing', 'Processing...');
        if(!voiceCommandsEnabled){
          showToast('Voice commands are turned off in Settings.', 'warning');
          setMicState('idle', 'Tap to speak');
          voiceDialog.hidden = true;
          return;
        }
        try{
          handleVoiceInput(text, result[0].confidence);
          setMicState('success', 'Got it!');
        } catch(err){
          showToast(err.message || "I couldn't understand that calculation.", 'error');
          speak(err.message || "I couldn't understand that calculation.");
          setMicState('error', 'Try again');
        }
        voiceDialog.hidden = true;
        scheduleIdleReset();
      });

      recognition.addEventListener('nomatch', () => {
        showToast("No speech detected. Try again.", 'error');
        setMicState('error', 'Try again');
        voiceDialog.hidden = true;
        scheduleIdleReset();
      });

      recognition.addEventListener('error', (e) => {
        const friendlyErrors = {
          'not-allowed': 'Microphone permission is required.',
          'permission-denied': 'Microphone permission is required.',
          'no-speech': 'No speech detected. Try again.',
          'audio-capture': 'No microphone was found.',
          'network': 'Network error. Check your connection.'
        };
        showToast(friendlyErrors[e.error] || 'Something went wrong. Try again.', 'error');
        setMicState('error', 'Try again');
        voiceDialog.hidden = true;
        scheduleIdleReset();
      });
    }

    function startStopMic(){
      if(!recognition) return showToast("Voice input isn't supported in this browser.", 'warning');
      if(!voiceCommandsEnabled) return showToast('Enable Voice commands in Settings first.', 'warning');
      if('speechSynthesis' in window && speechSynthesis.speaking){ speechSynthesis.cancel(); return; }
      pulseMicClick();
      if(listening){
        recognition.stop();
        voiceDialog.hidden = true;
        setMicState('idle', 'Tap to speak');
      } else {
        try{
          recognition.lang = voiceLanguage;
          recognition.start();
        } catch(e){}
      }
    }

    mic.addEventListener('click', startStopMic);
    mic.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); startStopMic(); }
    });
    micLabel.addEventListener('click', startStopMic);

    // Example command chips reuse the exact same voice-command parser, so
    // there is only ever one source of truth for interpreting a phrase.
    document.querySelectorAll('.cmd-chip[data-say]').forEach(chip => {
      chip.addEventListener('click', () => {
        const phrase = chip.dataset.say;
        setMicState('processing', 'Processing...');
        try{
          handleVoiceInput(phrase);
          saidEl.textContent = `"${phrase}"`;
          setMicState('success', 'Got it!');
        } catch(err){
          showToast(err.message || "I couldn't understand that calculation.", 'error');
          setMicState('error', 'Try again');
        }
        scheduleIdleReset();
      });
    });
    document.getElementById('stopVoice').addEventListener('click', () => { if(listening) recognition.stop(); voiceDialog.hidden=true; });
    document.getElementById('closeVoiceDialog').addEventListener('click', () => { if(listening) recognition.stop(); voiceDialog.hidden=true; });

    // Spoken -> expression
    function spokenToExpression(text){
      let s = text.toLowerCase().trim();
      s = s.replace(/open (bracket|parenthesis)/g, ' ( ').replace(/close (bracket|parenthesis)/g, ' ) ');
      s = s.replace(/square root of/g, 'sqrt( ').replace(/cube root of/g, 'cbrt( ');
      s = s.replace(/natural log of|natural log/g, 'ln( ').replace(/logarithm of/g, 'log( ');
      s = s.replace(/sine/g, 'sin( ').replace(/cosine/g, 'cos( ').replace(/tangent/g, 'tan( ');
      s = s.replace(/raised to the power of|to the power of|raised to/g, ' ^ ');
      s = s.replace(/negative/g, ' - ');
      // Speech recognition often returns "x" or "ex" for multiplication.
      // It can also include harmless conversational words and punctuation.
      s = s.replace(/[?!,]/g, ' ');
      s = s.replace(/(\d)\s*[x×]\s*(\d)/g, '$1 * $2');
      s = s.replace(/\b(what is|calculate|compute|please|equals?|equal to)\b/g, ' ');
      s = s.replace(/\b(multiplied by|multiply by|times|into|x|ex)\b/g, ' * ');
      s = s.replace(/\b(divided by|divide by|over)\b/g, ' / ');
      s = s.replace(/\b(plus|add|added to)\b/g, ' + ');
      s = s.replace(/\b(minus|subtract|take away)\b/g, ' - ');
      // Convert "ten percent of fifty" to 10% * 50.
      s = s.replace(/\b(percent of|percentage of)\b/g, '% * ');
      s = s.replace(/\b(percent|percentage)\b/g, '%');
      s = s.replace(/÷/g, ' / ').replace(/×/g, ' * ');
      s = s.replace(/point/g, ' point ');

      const numWords = new Set(['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million', 'point']);
      const parts = s.split(/\s+/);
      let outParts = [];
      
      for(let i = 0; i < parts.length;){
        if(numWords.has(parts[i])){
          let j = i;
          let run = [];
          while(j < parts.length && numWords.has(parts[j])){
            run.push(parts[j]);
            j++;
          }
          const num = wordsToNumber(run);
          outParts.push(num);
          i = j;
        } else {
          outParts.push(parts[i]);
          i++;
        }
      }

      let expr = outParts.join(' ').replace(/\s+/g, ' ').trim();
      expr = expr.replace(/\s*([+\-*/%()])\s*/g, '$1');
      expr = expr.replace(/(\d+(?:\.\d+)?)\s*squared/g, '$1^2').replace(/(\d+(?:\.\d+)?)\s*cubed/g, '$1^3').replace(/(\d+(?:\.\d+)?)\s*factorial/g, '$1!');
      if(/^(sqrt|cbrt|sin|cos|tan|log|ln|asin|acos|atan)\(/.test(expr) && !expr.endsWith(')')) expr += ')';
      return expr;
    }

    // Convert words to number
    function wordsToNumber(words){
      const idx = words.indexOf('point');
      if(idx >= 0){
        const intWords = words.slice(0, idx);
        const decWords = words.slice(idx + 1);
        const intPart = wordsToNumber(intWords);
        const decPart = decWords.map(w => wordToDigit(w)).join('') || '0';
        return `${intPart}.${decPart}`;
      }

      let total = 0;
      let current = 0;
      for(const w of words){
        if(w === 'zero') current += 0;
        else if(w === 'one') current += 1;
        else if(w === 'two') current += 2;
        else if(w === 'three') current += 3;
        else if(w === 'four') current += 4;
        else if(w === 'five') current += 5;
        else if(w === 'six') current += 6;
        else if(w === 'seven') current += 7;
        else if(w === 'eight') current += 8;
        else if(w === 'nine') current += 9;
        else if(w === 'ten') current += 10;
        else if(w === 'eleven') current += 11;
        else if(w === 'twelve') current += 12;
        else if(w === 'thirteen') current += 13;
        else if(w === 'fourteen') current += 14;
        else if(w === 'fifteen') current += 15;
        else if(w === 'sixteen') current += 16;
        else if(w === 'seventeen') current += 17;
        else if(w === 'eighteen') current += 18;
        else if(w === 'nineteen') current += 19;
        else if(w === 'twenty') current += 20;
        else if(w === 'thirty') current += 30;
        else if(w === 'forty') current += 40;
        else if(w === 'fifty') current += 50;
        else if(w === 'sixty') current += 60;
        else if(w === 'seventy') current += 70;
        else if(w === 'eighty') current += 80;
        else if(w === 'ninety') current += 90;
        else if(w === 'hundred') current *= 100;
        else if(w === 'thousand'){ current *= 1000; total += current; current = 0; }
        else if(w === 'million'){ current *= 1000000; total += current; current = 0; }
      }
      return String(total + current);
    }

    function wordToDigit(w){
      const map = {'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9};
      return map[w] !== undefined ? map[w] : (parseInt(w) || 0);
    }

    // Expose functions
    window.clearAll = clearAll;
    window.deleteLast = deleteLast;
    window.appendChar = appendChar;

    // Initialize saved calculator preferences and UI state.
    setMode(calculatorMode);
    setAngleMode(angleMode);
    updateMemory();
    applyAccessibility();
    applyVoicePreferences();
    renderHistory();
    updatePercentageLabels(document.querySelector('[data-finance-form="percentage"]'));
    const savedFinanceTool = localStorage.getItem('smartCalculator.financeTool');
    if(savedFinanceTool){ const tab=document.querySelector(`[data-tool="${savedFinanceTool}"]`); if(tab) tab.click(); }
    render();

    // Load saved calculation
    try{
      const last = localStorage.getItem('lastCalc');
      if(last){
        expr = last;
        render();
      }
    } catch(e){}

    // Auto-save expression
    setInterval(() => {
      try{
        localStorage.setItem('lastCalc', expr || '');
      } catch(e){}
    }, 3000);