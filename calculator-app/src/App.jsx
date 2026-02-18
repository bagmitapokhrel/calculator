import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, Brain, X, Loader2 } from 'lucide-react';

// --- Gemini API Utilities ---

const GEMINI_API_KEY = ""; // System will inject the key at runtime

const callGeminiMath = async (prompt) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: {
            parts: [{
              text: "You are a calculator backend. The user will ask a math question in natural language. You must reply with ONLY the numeric result. Do not include text, units, or markdown. Example: If user asks 'minutes in a year', reply '525600'. If the query is invalid or not math-related, reply 'Error'. For currency or units, strip the unit and return just the number."
            }]
          }
        })
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || "Error";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error";
  }
};

const callGeminiExplain = async (number, history) => {
  try {
    const context = history ? `The calculation was: ${history} = ${number}` : `The number is ${number}`;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Explain this number: ${context}` }] }],
          systemInstruction: {
            parts: [{
              text: "You are a math tutor. Provide a fun, 1-sentence explanation or fact about the provided number or calculation. If it's a specific constant (like Pi or e) mention it. If it's a mundane number, make a math joke or fact about it."
            }]
          }
        })
      }
    );

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Could not analyze.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Service unavailable.";
  }
};

// --- Components ---

const CalculatorButton = ({ 
  onClick, 
  className = "", 
  children, 
  variant = "default", 
  active = false
}) => {
  const baseStyles = "h-14 w-14 sm:h-20 sm:w-20 rounded-full text-xl sm:text-3xl font-medium transition-all duration-100 active:scale-95 flex items-center justify-center select-none shadow-sm";
  
  const variants = {
    default: "bg-gray-800 text-white hover:bg-gray-700",
    primary: `bg-orange-500 text-white hover:bg-orange-400 ${active ? 'bg-white text-orange-500' : ''}`,
    secondary: "bg-gray-300 text-black hover:bg-gray-200",
    zero: "col-span-2 w-full text-left pl-8 bg-gray-800 text-white hover:bg-gray-700 rounded-[40px]" 
  };

  const styleClass = variant === 'zero' ? variants.zero : `${baseStyles} ${variants[variant]}`;

  return (
    <button onClick={onClick} className={`${styleClass} ${className}`}>
      {children}
    </button>
  );
};

// Small pill button for AI features
const SmartButton = ({ icon: Icon, label, onClick, isLoading }) => (
  <button 
    onClick={onClick}
    disabled={isLoading}
    className="flex-1 bg-gray-800/80 hover:bg-gray-700 backdrop-blur-md text-cyan-300 text-sm font-medium py-2 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700/50"
  >
    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
    {label}
  </button>
);

const App = () => {
  const [displayValue, setDisplayValue] = useState('0');
  const [firstOperand, setFirstOperand] = useState(null);
  const [operator, setOperator] = useState(null);
  const [waitingForSecondOperand, setWaitingForSecondOperand] = useState(false);
  const [history, setHistory] = useState('');
  
  // AI States
  const [showMagicInput, setShowMagicInput] = useState(false);
  const [magicPrompt, setMagicPrompt] = useState('');
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiExplanation, setAiExplanation] = useState(null);
  const modalInputRef = useRef(null);

  // Focus input when magic modal opens
  useEffect(() => {
    if (showMagicInput && modalInputRef.current) {
      modalInputRef.current.focus();
    }
  }, [showMagicInput]);

  // Handle number input
  const inputDigit = (digit) => {
    if (waitingForSecondOperand) {
      setDisplayValue(String(digit));
      setWaitingForSecondOperand(false);
    } else {
      setDisplayValue(displayValue === '0' ? String(digit) : displayValue + digit);
    }
  };

  const inputDecimal = () => {
    if (waitingForSecondOperand) {
      setDisplayValue('0.');
      setWaitingForSecondOperand(false);
      return;
    }
    if (!displayValue.includes('.')) {
      setDisplayValue(displayValue + '.');
    }
  };

  const clearDisplay = () => {
    setDisplayValue('0');
    setFirstOperand(null);
    setOperator(null);
    setWaitingForSecondOperand(false);
    setHistory('');
    setAiExplanation(null);
  };

  const handleBackspace = () => {
    if (waitingForSecondOperand) return;
    if (displayValue.length === 1) {
      setDisplayValue('0');
    } else {
      setDisplayValue(displayValue.slice(0, -1));
    }
  };

  const performOperation = (nextOperator) => {
    const inputValue = parseFloat(displayValue);

    if (firstOperand === null) {
      setFirstOperand(inputValue);
    } else if (operator) {
      const currentValue = firstOperand || 0;
      const result = calculate(currentValue, inputValue, operator);
      
      let formattedResult = String(result);
      if (formattedResult.length > 10) {
        formattedResult = String(parseFloat(result.toPrecision(10)));
      }

      setDisplayValue(formattedResult);
      setFirstOperand(result);
      setHistory(`${currentValue} ${operator} ${inputValue} =`);
    }

    setWaitingForSecondOperand(true);
    setOperator(nextOperator);
  };

  const calculate = (first, second, op) => {
    switch (op) {
      case '+': return first + second;
      case '-': return first - second;
      case '*': return first * second;
      case '/': return second !== 0 ? first / second : 'Error';
      default: return second;
    }
  };

  const toggleSign = () => {
    const value = parseFloat(displayValue);
    if (value === 0) return;
    setDisplayValue(String(value * -1));
  };

  const inputPercent = () => {
    const value = parseFloat(displayValue);
    setDisplayValue(String(value / 100));
  };

  // --- AI Feature Handlers ---

  const handleMagicMath = async (e) => {
    e.preventDefault();
    if (!magicPrompt.trim()) return;

    setIsProcessingAI(true);
    const result = await callGeminiMath(magicPrompt);
    setIsProcessingAI(false);

    if (result !== 'Error') {
      setDisplayValue(result);
      setHistory(magicPrompt); // Show the question in history
      setShowMagicInput(false);
      setMagicPrompt('');
      setFirstOperand(null); // Reset calc state as this is a fresh value
      setOperator(null);
      setWaitingForSecondOperand(true); // Treat as a result state
    } else {
      // Basic error handling in UI
      const originalDisplay = displayValue;
      setDisplayValue("Error");
      setTimeout(() => setDisplayValue(originalDisplay), 1500);
    }
  };

  const handleExplain = async () => {
    setIsProcessingAI(true);
    const text = await callGeminiExplain(displayValue, history);
    setIsProcessingAI(false);
    setAiExplanation(text);
    
    // Auto hide after 6 seconds
    setTimeout(() => setAiExplanation(null), 6000);
  };

  // Keyboard support
  const handleKeyDown = useCallback((event) => {
    if (showMagicInput) return; // Disable calc shortcuts when typing in modal

    const { key } = event;
    if (/[0-9]/.test(key)) {
      event.preventDefault();
      inputDigit(key);
    } else if (key === '.') {
      event.preventDefault();
      inputDecimal();
    } else if (key === 'Enter' || key === '=') {
      event.preventDefault();
      if (operator) performOperation('=');
    } else if (key === 'Backspace') {
      event.preventDefault();
      handleBackspace();
    } else if (key === 'Escape') {
      event.preventDefault();
      clearDisplay();
    } else if (['+', '-', '*', '/'].includes(key)) {
      event.preventDefault();
      performOperation(key);
    }
  }, [displayValue, waitingForSecondOperand, operator, firstOperand, showMagicInput]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const formatDisplay = (val) => {
    if (val === 'Error') return 'Error';
    if (!val) return '0';
    if (val.includes('e')) return val;
    const parts = val.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join('.');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 font-sans relative overflow-hidden">
      
      {/* Background Gradient Blob for aesthetics */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-orange-900/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm bg-black rounded-[44px] shadow-2xl overflow-hidden p-6 border border-gray-800 z-10 relative">
        
        {/* Screen / Display Area */}
        <div className="h-44 flex flex-col justify-end items-end mb-4 px-2 break-all relative">
           
           {/* Explanation Toast */}
           {aiExplanation && (
             <div className="absolute top-0 left-0 right-0 bg-gray-800/95 backdrop-blur-sm p-3 rounded-2xl border border-gray-700 animate-in fade-in slide-in-from-top-2 z-20">
               <div className="flex justify-between items-start gap-2">
                 <p className="text-sm text-gray-200 leading-snug">{aiExplanation}</p>
                 <button onClick={() => setAiExplanation(null)} className="text-gray-500 hover:text-white">
                   <X className="w-4 h-4" />
                 </button>
               </div>
             </div>
           )}

           {/* History / Small text */}
           <div className="text-gray-400 text-lg h-6 mb-1 font-light tracking-wide w-full text-right truncate">
             {operator && waitingForSecondOperand && !history ? `${firstOperand} ${operator}` : history}
           </div>
           
           {/* Main Display */}
           <div className={`text-white font-light tracking-tight transition-all duration-200 text-right w-full ${displayValue.length > 8 ? 'text-5xl' : 'text-7xl'}`}>
             {formatDisplay(displayValue)}
           </div>
        </div>

        {/* AI Toolbar */}
        <div className="flex gap-3 mb-6">
          <SmartButton 
            icon={Sparkles} 
            label="Magic Math" 
            onClick={() => setShowMagicInput(true)} 
            isLoading={isProcessingAI && showMagicInput}
          />
          <SmartButton 
            icon={Brain} 
            label="Insight" 
            onClick={handleExplain} 
            isLoading={isProcessingAI && !showMagicInput}
          />
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-4 gap-3 sm:gap-4">
          <CalculatorButton onClick={clearDisplay} variant="secondary">
            {displayValue !== '0' ? 'C' : 'AC'}
          </CalculatorButton>
          <CalculatorButton onClick={toggleSign} variant="secondary">±</CalculatorButton>
          <CalculatorButton onClick={inputPercent} variant="secondary">%</CalculatorButton>
          <CalculatorButton onClick={() => performOperation('/')} variant="primary" active={operator === '/'}>÷</CalculatorButton>

          <CalculatorButton onClick={() => inputDigit(7)}>7</CalculatorButton>
          <CalculatorButton onClick={() => inputDigit(8)}>8</CalculatorButton>
          <CalculatorButton onClick={() => inputDigit(9)}>9</CalculatorButton>
          <CalculatorButton onClick={() => performOperation('*')} variant="primary" active={operator === '*'}>×</CalculatorButton>

          <CalculatorButton onClick={() => inputDigit(4)}>4</CalculatorButton>
          <CalculatorButton onClick={() => inputDigit(5)}>5</CalculatorButton>
          <CalculatorButton onClick={() => inputDigit(6)}>6</CalculatorButton>
          <CalculatorButton onClick={() => performOperation('-')} variant="primary" active={operator === '-'}>−</CalculatorButton>

          <CalculatorButton onClick={() => inputDigit(1)}>1</CalculatorButton>
          <CalculatorButton onClick={() => inputDigit(2)}>2</CalculatorButton>
          <CalculatorButton onClick={() => inputDigit(3)}>3</CalculatorButton>
          <CalculatorButton onClick={() => performOperation('+')} variant="primary" active={operator === '+'}>+</CalculatorButton>

          <CalculatorButton onClick={() => inputDigit(0)} variant="zero">0</CalculatorButton>
          <CalculatorButton onClick={inputDecimal}>.</CalculatorButton>
          <CalculatorButton onClick={() => performOperation('=')} variant="primary">=</CalculatorButton>
        </div>

        {/* Magic Input Modal */}
        {showMagicInput && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col p-6 animate-in fade-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-white text-xl font-medium flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400" /> Magic Math
              </h3>
              <button 
                onClick={() => setShowMagicInput(false)}
                className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-gray-400 mb-4 text-sm">
                Ask anything! E.g., "50 euros in dollars", "Square root of 1234", "15% tip on 85.50"
              </p>
              <form onSubmit={handleMagicMath}>
                <textarea
                  ref={modalInputRef}
                  value={magicPrompt}
                  onChange={(e) => setMagicPrompt(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-2xl p-4 text-white text-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all resize-none mb-4"
                  rows="3"
                  placeholder="Type your math problem..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleMagicMath(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!magicPrompt.trim() || isProcessingAI}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {isProcessingAI ? <Loader2 className="w-5 h-5 animate-spin" /> : "Calculate"}
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;