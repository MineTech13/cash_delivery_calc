"use client";
import { useState, useEffect, useRef } from "react";
import { CONTAINERS, CURRENCIES, getContainerCapacity } from "../lib/config";
import { greedySearch, balancedSearch, calculateVolume, calculateBalanceScore, type SearchResult } from "../lib/algorithms";

type ResultRow = {
  comboStr: string;
  packs: number;
  blocks: number;
  volume: number;
  containersNeeded: number;
  containerName: string;
  balanceScore?: number;
  combo: number[];
  looseStr?: string;
};

const setCookie = (name: string, value: string, days = 365) => {
  const d = new Date();
  d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
};

const getCookie = (name: string) => {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
};

export default function CashDeliveryCalculator() {
  const [amount, setAmount] = useState<string>("");
  const [currencyName, setCurrencyName] = useState<string>("USD");
  const [balancedMode, setBalancedMode] = useState(false);
  const [fullBlocksOnly, setFullBlocksOnly] = useState(false);
  const [targetDenom, setTargetDenom] = useState<string>("");
  const [emergencySplit, setEmergencySplit] = useState(false);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [autoOpenContainer, setAutoOpenContainer] = useState(true);
  const [autoConfirmBest, setAutoConfirmBest] = useState(true);
  const [denomOrder, setDenomOrder] = useState<Record<string, string[]>>({});
  const [isFullInventoryModalOpen, setIsFullInventoryModalOpen] = useState(false);
  
  const [inventory, setInventory] = useState<Record<string, string>>({});
  const [modifiers, setModifiers] = useState<Record<string, string>>({});
  
  const [selectedContainer, setSelectedContainer] = useState<string>("Backpack");
  const [isContainerModalOpen, setIsContainerModalOpen] = useState(false);
  const [containerSearch, setContainerSearch] = useState("");
  
  const [results, setResults] = useState<ResultRow[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<ResultRow | null>(null);

  const [cookieConsent, setCookieConsent] = useState<boolean>(true); // Default true to avoid flash
  const [isLoaded, setIsLoaded] = useState(false);

  const amountInputRef = useRef<HTMLInputElement>(null);

  const [calcTrigger, setCalcTrigger] = useState(0); // Used to re-trigger focus on new calculations

  const [draggedDenom, setDraggedDenom] = useState<string | null>(null);

  // Load from cookies on mount
  useEffect(() => {
    const consent = getCookie("cookieConsent");
    if (!consent) {
      setCookieConsent(false);
    }
    
    const savedInv = getCookie("cashCalcInventory");
    if (savedInv) {
      try {
        setInventory(JSON.parse(savedInv));
      } catch (e) {
        console.error("Failed to parse saved inventory", e);
      }
    }

    const savedSettings = getCookie("cashCalcSettings");
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        if (parsed.currencyName) setCurrencyName(parsed.currencyName);
        if (parsed.selectedContainer) setSelectedContainer(parsed.selectedContainer);
        if (typeof parsed.balancedMode === 'boolean') setBalancedMode(parsed.balancedMode);
        if (typeof parsed.fullBlocksOnly === 'boolean') setFullBlocksOnly(parsed.fullBlocksOnly);
        if (typeof parsed.singleDenomOnly === 'boolean' && parsed.singleDenomOnly) {
          // Legacy migration
          setTargetDenom("any_single");
        }
        if (parsed.targetDenom !== undefined) setTargetDenom(parsed.targetDenom);
        if (typeof parsed.emergencySplit === 'boolean') setEmergencySplit(parsed.emergencySplit);
        if (typeof parsed.autoOpenContainer === 'boolean') setAutoOpenContainer(parsed.autoOpenContainer);
        if (typeof parsed.autoConfirmBest === 'boolean') setAutoConfirmBest(parsed.autoConfirmBest);
        if (parsed.denomOrder) setDenomOrder(parsed.denomOrder);
      } catch (e) {
        console.error("Failed to parse saved settings", e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsContainerModalOpen(false);
        setPendingConfirmation(null);
        setIsSettingsModalOpen(false);
        setIsFullInventoryModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Save to cookies when inventory changes (if consent granted)
  useEffect(() => {
    if (isLoaded && cookieConsent) {
      // Inventory object is small, easily fits in standard 4KB cookie limit
      setCookie("cashCalcInventory", JSON.stringify(inventory));
    }
  }, [inventory, isLoaded, cookieConsent]);

  // Save to cookies when settings change
  useEffect(() => {
    if (isLoaded && cookieConsent) {
      setCookie("cashCalcSettings", JSON.stringify({
        currencyName,
        selectedContainer,
        balancedMode,
        fullBlocksOnly,
        targetDenom,
        emergencySplit,
        autoOpenContainer,
        autoConfirmBest,
        denomOrder
      }));
    }
  }, [currencyName, selectedContainer, balancedMode, fullBlocksOnly, targetDenom, emergencySplit, autoOpenContainer, autoConfirmBest, denomOrder, isLoaded, cookieConsent]);

  const acceptCookies = () => {
    setCookieConsent(true);
    setCookie("cookieConsent", "true");
    setCookie("cashCalcInventory", JSON.stringify(inventory));
    setCookie("cashCalcSettings", JSON.stringify({
      currencyName,
      selectedContainer,
      balancedMode,
      fullBlocksOnly,
      targetDenom,
      emergencySplit,
      autoOpenContainer,
      autoConfirmBest,
      denomOrder
    }));
  };

  const activeCurrency = CURRENCIES[currencyName];
  
  // Calculate the custom drag & drop priority order
  const getOrderedDenoms = (currency: typeof activeCurrency) => {
    const order = denomOrder[currency.name];
    if (!order) return [...currency.denominations];
    return [...currency.denominations].sort((a, b) => {
      let idxA = order.indexOf(a.id);
      let idxB = order.indexOf(b.id);
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      return idxA - idxB;
    });
  };
  const orderedActiveDenoms = getOrderedDenoms(activeCurrency);

  const handleModify = (dId: string, action: 'add' | 'sub' | 'set') => {
    const val = parseInt(modifiers[dId] || "0", 10) || 0;
    if (isNaN(val)) return;

    setInventory(prev => {
      const current = parseInt(prev[dId] || "0", 10) || 0;
      let nextVal = current;
      if (action === 'add') nextVal = current + val;
      if (action === 'sub') nextVal = Math.max(0, current - val);
      if (action === 'set') nextVal = Math.max(0, val);
      return { ...prev, [dId]: nextVal.toString() };
    });

    setModifiers(prev => ({ ...prev, [dId]: "" }));
  };

  const handleCalculate = (overrideContainer?: string, autoConfirm?: boolean) => {
    const desiredAmount = parseInt(amount, 10);
    if (isNaN(desiredAmount) || desiredAmount <= 0) {
      if (!autoConfirm) alert("Please enter a valid amount");
      return;
    }

    const activeDenoms = orderedActiveDenoms;
    const denomsToUse: number[] = [];
    const maxCountsToUse: number[] = [];
    const denomLabels: string[] = [];

    for (const d of activeDenoms) {
      const invStr = inventory[d.id];
      if (!invStr) continue;
      const count = parseInt(invStr, 10);
      if (isNaN(count) || count <= 0) continue;
      
      const maxUseful = (emergencySplit || targetDenom !== "")
        ? Math.min(count, Math.ceil(desiredAmount / d.value))
        : Math.min(count, Math.floor(desiredAmount / d.value));
      
      if (maxUseful > 0) {
        denomsToUse.push(d.value);
        maxCountsToUse.push(maxUseful);
        denomLabels.push(d.label);
      }
    }

    if (denomsToUse.length === 0) {
      setResults([]);
      alert("No valid combinations found with current inventory.");
      return;
    }

    let searchResults: SearchResult[] = [];

    if (targetDenom !== "") {
      const targetValue = targetDenom === "any_single" ? null : parseInt(targetDenom, 10);
      
      for (let i = 0; i < denomsToUse.length; i++) {
        const denomPackValue = denomsToUse[i];
        if (targetValue !== null && denomPackValue !== targetValue) continue;
        
        const maxAvailable = maxCountsToUse[i];
        const faceValue = denomPackValue / 100;
        const label = denomLabels[i];
        
        const fullPacks = Math.floor(desiredAmount / denomPackValue);
        const remainder = desiredAmount % denomPackValue;
        
        if (remainder === 0) {
          if (fullPacks > 0 && fullPacks <= maxAvailable && (!fullBlocksOnly || fullPacks % 30 === 0)) {
            const combo = new Array(denomsToUse.length).fill(0);
            combo[i] = fullPacks;
            searchResults.push({ combo, packs: fullPacks, total: desiredAmount });
          }
        } else if (remainder % faceValue === 0) {
          // Always show loose bill alternatives for single denom targets if it perfectly divides
          const looseBillsCount = remainder / faceValue;
          const packsToConsume = fullPacks + 1;
          if (packsToConsume <= maxAvailable && (!fullBlocksOnly || packsToConsume % 30 === 0)) {
            const combo = new Array(denomsToUse.length).fill(0);
            combo[i] = packsToConsume;
            searchResults.push({
              combo,
              packs: packsToConsume,
              total: desiredAmount,
              looseStr: `Break 1x ${label} pack for ${looseBillsCount} loose bills`
            });
          }
        }
      }
      if (balancedMode) {
        searchResults.forEach(r => { r.balanceScore = calculateBalanceScore(denomsToUse, maxCountsToUse, r.combo); });
        searchResults.sort((a, b) => {
          const aLoose = !!a.looseStr;
          const bLoose = !!b.looseStr;
          if (aLoose !== bLoose) return aLoose ? 1 : -1;
          if (a.balanceScore! !== b.balanceScore!) return a.balanceScore! - b.balanceScore!;
          return a.packs - b.packs;
        });
      } else {
        searchResults.sort((a, b) => {
          const aLoose = !!a.looseStr;
          const bLoose = !!b.looseStr;
          if (aLoose !== bLoose) return aLoose ? 1 : -1;
          return a.packs - b.packs;
        });
      }
    } else {
      searchResults = balancedMode 
        ? balancedSearch(denomsToUse, maxCountsToUse, desiredAmount, fullBlocksOnly, 50, denomLabels, emergencySplit)
        : greedySearch(denomsToUse, maxCountsToUse, desiredAmount, fullBlocksOnly, 50, denomLabels, emergencySplit);

      if (!balancedMode) {
        searchResults.sort((a, b) => {
          const aLoose = !!a.looseStr;
          const bLoose = !!b.looseStr;
          if (aLoose !== bLoose) return aLoose ? 1 : -1;
          return a.packs - b.packs;
        });
      }
    }

    const currentContainer = overrideContainer || selectedContainer;
    const capacity = getContainerCapacity(currentContainer);

    const formattedResults = searchResults.map(res => {
      const volume = calculateVolume(denomsToUse, res.combo);
      const containersNeeded = Math.ceil(volume / capacity);
      
      const comboItems = [];
      const fullCombo = new Array(activeDenoms.length).fill(0);

      for (let i = 0; i < denomsToUse.length; i++) {
        if (res.combo[i] > 0) {
          comboItems.push({ val: denomsToUse[i], label: denomLabels[i], count: res.combo[i] });
          const originalIdx = activeDenoms.findIndex(d => d.value === denomsToUse[i]);
          if (originalIdx !== -1) {
            fullCombo[originalIdx] = res.combo[i];
          }
        }
      }
      comboItems.sort((a, b) => b.val - a.val); // Display highest to lowest
      const comboStr = comboItems.map(item => `${item.label}:${item.count}`).join(", ");

      return {
        comboStr,
        packs: res.packs,
        blocks: Math.floor(res.packs / 30),
        volume: Math.floor(volume),
        containersNeeded,
        containerName: currentContainer,
        balanceScore: res.balanceScore,
        combo: fullCombo,
        looseStr: res.looseStr
      };
    });

    const finalResults = formattedResults.slice(0, 30);
    setResults(finalResults);
    setCalcTrigger(prev => prev + 1);

    if (autoConfirm && finalResults.length > 0) {
      setPendingConfirmation(finalResults[0]);
    } else if (finalResults.length === 0) {
      alert("No valid combinations found. Check your inventory or denomination settings.");
    }
  };

  const confirmPacking = () => {
    if (!pendingConfirmation) return;
    
    setInventory(prev => {
      const next = { ...prev };
      activeCurrency.denominations.forEach((d, idx) => {
        const deductCount = pendingConfirmation.combo[idx];
        if (deductCount > 0) {
          const current = parseInt(next[d.id] || "0", 10) || 0;
          next[d.id] = Math.max(0, current - deductCount).toString();
        }
      });
      return next;
    });

    setResults([]);
    setPendingConfirmation(null);
    setAmount("");
    
    // Let the modal unmount from the DOM first, then focus the amount input
    setTimeout(() => {
      amountInputRef.current?.focus();
    }, 0);
  };

  return (
    <div className="bg-gray-900 text-gray-100 min-h-screen font-sans p-4 md:p-8 selection:bg-blue-500/30 pb-24">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-center border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Cash Delivery Calculator</h1>
            <p className="text-gray-400 mt-1">Plan your physical cash packing operations.</p>
          </div>
          <button 
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-600 transition-colors text-gray-300 ml-4 flex-shrink-0"
            title="Settings & Flow Rules"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Settings */}
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
              <h2 className="text-lg font-semibold mb-4 text-white">Job Details</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Job Amount</label>
                  <input 
                    type="text" 
                    ref={amountInputRef}
                    autoFocus
                    inputMode="numeric"
                    value={amount}
                    onChange={e => {
                      let val = e.target.value.toLowerCase();
                      val = val.replace(/k/g, '000').replace(/m/g, '000000');
                      val = val.replace(/[^0-9]/g, '');
                      setAmount(val);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const desiredAmount = parseInt(amount, 10);
                        if (!isNaN(desiredAmount) && desiredAmount > 0) {
                          if (autoOpenContainer) {
                            setContainerSearch("");
                            setIsContainerModalOpen(true);
                          } else {
                            handleCalculate();
                          }
                        } else {
                          alert("Please enter a valid amount first.");
                        }
                      }
                    }}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-gray-500" 
                    placeholder="e.g. 500000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Currency</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(CURRENCIES).map(c => (
                      <button 
                        key={c}
                        onClick={() => {
                          setCurrencyName(c);
                          setResults([]);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                          c === currencyName 
                            ? 'bg-blue-500 border-blue-500 text-white' 
                            : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <label className="flex items-center space-x-3 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={fullBlocksOnly}
                      onChange={e => setFullBlocksOnly(e.target.checked)}
                      className="form-checkbox h-5 w-5 text-blue-500 rounded border-gray-600 bg-gray-900 focus:ring-blue-500 focus:ring-offset-gray-800"
                    />
                    <span className="text-sm text-gray-300 group-hover:text-white transition-colors">Only allow full blocks (30 packs)</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={balancedMode}
                      onChange={e => setBalancedMode(e.target.checked)}
                      className="form-checkbox h-5 w-5 text-green-500 rounded border-gray-600 bg-gray-900 focus:ring-green-500 focus:ring-offset-gray-800"
                    />
                    <span className="text-sm text-green-500 font-medium group-hover:text-green-400 transition-colors">Smart Balance (Prioritize abundant)</span>
                  </label>
                  <div className="flex items-center space-x-3 group">
                    <select 
                      value={targetDenom}
                      onChange={e => setTargetDenom(e.target.value)}
                      className="bg-gray-900 border border-gray-600 text-purple-400 rounded-lg px-2 py-1.5 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm cursor-pointer"
                    >
                      <option value="">Mixed Denominations</option>
                      <option value="any_single">Any Single Denomination</option>
                      {activeCurrency.denominations.map(d => (
                        <option key={d.id} value={d.value}>Only {d.label}</option>
                      ))}
                    </select>
                    <span className="text-sm text-purple-400 font-medium group-hover:text-purple-300 transition-colors">Force specific bills</span>
                  </div>
                  <label className="flex items-center space-x-3 cursor-pointer group pt-1">
                    <input 
                      type="checkbox" 
                      checked={emergencySplit}
                      onChange={e => setEmergencySplit(e.target.checked)}
                      className="form-checkbox h-5 w-5 text-yellow-500 rounded border-gray-600 bg-gray-900 focus:ring-yellow-500 focus:ring-offset-gray-800"
                    />
                    <span className="text-sm text-yellow-500 font-medium group-hover:text-yellow-400 transition-colors">Emergency Split (Break packs for exact change)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
              <h2 className="text-lg font-semibold mb-4 text-white">Container Selection</h2>
              <button 
                onClick={() => {
                  setContainerSearch("");
                  setIsContainerModalOpen(true);
                }}
                className="w-full flex items-center justify-between bg-gray-900 border border-gray-600 hover:border-blue-500 rounded-lg px-4 py-3 text-white transition-colors group"
              >
                <div className="flex flex-col text-left">
                  <span className="font-bold text-lg">{selectedContainer}</span>
                  <span className="text-sm text-gray-400">Volume: {getContainerCapacity(selectedContainer)}</span>
                </div>
                <span className="text-blue-500 font-semibold group-hover:text-blue-400 transition-colors">Change</span>
              </button>
            </div>
          </div>

          {/* Right Column: Denominations */}
          <div className="lg:col-span-2 bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white">Inventory Management</h2>
              <button 
                onClick={() => setIsFullInventoryModalOpen(true)}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                Full Inventory
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow">
              {orderedActiveDenoms.map(d => (
                <div key={d.id} className="bg-gray-900 p-4 rounded-xl border border-gray-700 shadow-inner flex flex-col justify-between space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <label className="font-bold text-gray-200 flex items-center space-x-2">
                        <span className="text-xl">{d.label}</span>
                      </label>
                      <span className="text-xs font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded mt-2 inline-block">1 Block = 30</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Current</div>
                      <div className="text-2xl font-mono text-white">{inventory[d.id] || "0"}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 bg-gray-800 p-2 rounded-lg border border-gray-700/50">
                    <input 
                      type="text" 
                      inputMode="numeric"
                      value={modifiers[d.id] || ""}
                      onChange={e => {
                        let val = e.target.value.toLowerCase();
                        val = val.replace(/k/g, '000').replace(/m/g, '000000');
                        val = val.replace(/[^0-9]/g, '');
                        setModifiers({ ...modifiers, [d.id]: val });
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleModify(d.id, 'add');
                      }}
                      className="w-20 bg-gray-950 border border-gray-600 rounded px-2 py-1.5 text-white text-center font-mono focus:border-blue-500 focus:outline-none placeholder-gray-600" 
                      placeholder="0"
                    />
                    <button onClick={() => handleModify(d.id, 'add')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1.5 rounded font-bold transition-colors" title="Add to inventory">+</button>
                    <button onClick={() => handleModify(d.id, 'sub')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1.5 rounded font-bold transition-colors" title="Subtract from inventory">-</button>
                    <button onClick={() => handleModify(d.id, 'set')} className="flex-1 bg-blue-600/80 hover:bg-blue-500 text-white py-1.5 rounded font-bold transition-colors" title="Set exact amount">Set</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <button 
                onClick={() => handleCalculate()}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg"
              >
                Think for me
              </button>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
            <h2 className="text-lg font-semibold text-white">Calculated Configurations</h2>
            <span className="text-xs text-gray-400">*VB = Very Balanced, *GB = Good Balance</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-900 text-gray-400 text-sm">
                  <th className="p-4 font-medium">Counts</th>
                  <th className="p-4 font-medium text-center">Packs</th>
                  <th className="p-4 font-medium text-center">Blocks</th>
                  <th className="p-4 font-medium text-center">Volume</th>
                  <th className="p-4 font-medium text-right">Containers Needed</th>
                  <th className="p-4 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      Enter job details and calculate to see results.
                    </td>
                  </tr>
                ) : (
                  results.map((r, i) => (
                    <tr key={`${calcTrigger}-${i}`} className="hover:bg-gray-800/80 transition-colors bg-gray-800">
                      <td className="p-4">
                        <span className="font-mono text-gray-300">{r.comboStr}</span>
                        {r.balanceScore !== undefined && r.balanceScore < 50 && (
                          <span className="text-green-500 text-xs font-bold ml-2">*VB</span>
                        )}
                        {r.balanceScore !== undefined && r.balanceScore >= 50 && r.balanceScore < 100 && (
                          <span className="text-blue-500 text-xs font-bold ml-2">*GB</span>
                        )}
                        {r.looseStr && (
                          <span className="block text-yellow-400 text-xs font-bold mt-1 bg-yellow-400/10 inline-block px-2 py-0.5 rounded-sm border border-yellow-400/20">{r.looseStr}</span>
                        )}
                      </td>
                      <td className="p-4 text-center font-medium text-white">{r.packs}</td>
                      <td className="p-4 text-center text-gray-400">{r.blocks}</td>
                      <td className="p-4 text-center text-gray-400">{r.volume}</td>
                      <td className="p-4 text-right text-gray-400">{r.containersNeeded} x {r.containerName}</td>
                      <td className="p-4 text-center">
                        <button 
                          autoFocus={i === 0}
                          onClick={() => setPendingConfirmation(r)}
                          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-semibold transition-colors"
                        >
                          Use Packs
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Container Selection Modal */}
      {isContainerModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-600 w-full max-w-4xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl">
              <h2 className="text-xl font-bold text-white">Select Container</h2>
              <button 
                onClick={() => setIsContainerModalOpen(false)} 
                className="text-gray-400 hover:text-white p-2 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-grow bg-gray-800 rounded-b-xl space-y-6 custom-scrollbar">
              <div className="relative mb-2">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  autoFocus
                  type="text"
                  className="block w-full pl-10 pr-3 py-3 border border-gray-700 rounded-lg leading-5 bg-gray-900 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:text-sm"
                  placeholder="Search containers..."
                  value={containerSearch}
                  onChange={(e) => setContainerSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      let matchedContainer = selectedContainer;
                      if (containerSearch) {
                        const filtered = CONTAINERS.flatMap(c => c.items).filter(i => i.name.toLowerCase().includes(containerSearch.toLowerCase()));
                        if (filtered.length > 0) matchedContainer = filtered[0].name;
                        else return; // Do nothing if search typed but no match
                      }
                      setSelectedContainer(matchedContainer);
                      setIsContainerModalOpen(false);
                      setTimeout(() => handleCalculate(matchedContainer, autoConfirmBest), 0);
                    }
                  }}
                />
              </div>

              {(() => {
                const filteredCategories = CONTAINERS.map(c => ({
                  ...c,
                  items: c.items.filter(i => i.name.toLowerCase().includes(containerSearch.toLowerCase()))
                })).filter(c => c.items.length > 0);

                if (filteredCategories.length === 0) {
                  return <div className="text-center text-gray-500 py-12">No containers match your search.</div>;
                }

                return filteredCategories.map(category => (
                  <div key={category.name}>
                    <h3 className="text-lg font-bold text-gray-300 mb-3 border-b border-gray-700 pb-1">{category.name}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {category.items.map(item => {
                        const isSelected = item.name === selectedContainer;
                        return (
                          <button 
                            key={item.name}
                            onClick={() => {
                              setSelectedContainer(item.name);
                              setIsContainerModalOpen(false);
                              setTimeout(() => handleCalculate(item.name, autoConfirmBest), 0);
                            }}
                            className={`flex flex-col text-left p-3 rounded-xl border-2 transition-all ${
                              isSelected 
                                ? 'bg-blue-500/10 border-blue-500 shadow-lg shadow-blue-500/20 scale-[1.02]' 
                                : 'bg-gray-900 border-gray-700 hover:border-gray-500 hover:bg-gray-800 hover:scale-[1.02]'
                            }`}
                          >
                            <div className={`h-24 w-full bg-gray-800 rounded-lg mb-3 flex items-center justify-center border border-dashed ${
                              isSelected ? 'border-blue-500/50 text-blue-500' : 'border-gray-700 text-gray-600'
                            }`}>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <span className="font-bold text-white text-sm md:text-base">{item.name}</span>
                            <span className="text-xs text-gray-400 mt-1">Vol: {item.capacity}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Packing Confirmation Modal */}
      {pendingConfirmation && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-600 w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 overflow-y-auto flex-grow text-gray-200 rounded-t-xl custom-scrollbar">
              <h2 className="text-2xl font-bold mb-6 text-white border-b border-gray-700 pb-2">PACKING CONFIRMATION</h2>
              
              <div className="bg-gray-900 rounded-lg p-4 mb-6 border border-gray-700">
                <p className="text-lg font-bold text-blue-500">Job Amount: {amount} {currencyName}</p>
              </div>
              
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Pack the following:</h3>
                {activeCurrency.denominations.map((d, idx) => {
                  const count = pendingConfirmation.combo[idx];
                  if (count === 0) return null;
                  const blocks = Math.floor(count / 30);
                  const remainder = count % 30;
                  const blkStr = blocks > 0 ? `(${blocks} blocks${remainder > 0 ? ` and ${remainder} packs` : ''})` : '';
                  
                  return (
                    <p key={d.id} className="mb-2 text-lg text-gray-300">
                      • <span className="font-bold text-white">{count} packs</span> {blkStr} of <span className="text-yellow-400">{d.label}</span>
                    </p>
                  );
                })}
              </div>
              
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <p className="text-gray-400 mb-1">Total Packs: <span className="text-white font-mono">{pendingConfirmation.packs}</span></p>
                <p className="text-gray-400 mb-1">Volume: <span className="text-white font-mono">{pendingConfirmation.volume}</span></p>
                <p className="text-gray-400">Required: <span className="text-white font-mono">{pendingConfirmation.containersNeeded} x {pendingConfirmation.containerName}</span></p>
              </div>

              {pendingConfirmation.looseStr && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mt-4">
                  <p className="text-yellow-400 font-bold text-sm flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    ⚠️ {pendingConfirmation.looseStr}
                  </p>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-gray-900 border-t border-gray-700 flex justify-end space-x-4 rounded-b-xl">
              <button 
                onClick={() => setPendingConfirmation(null)} 
                className="px-6 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors"
              >
                CANCEL
              </button>
              <button 
                autoFocus
                onClick={confirmPacking} 
                className="px-6 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold transition-colors"
              >
                CONFIRM PACKING
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-600 w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl">
              <h2 className="text-xl font-bold text-white">Workflow & Rules Settings</h2>
              <button 
                onClick={() => setIsSettingsModalOpen(false)} 
                className="text-gray-400 hover:text-white p-2 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-grow bg-gray-800 rounded-b-xl space-y-8 custom-scrollbar">
              
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Automated Flow</h3>
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={autoOpenContainer}
                    onChange={e => setAutoOpenContainer(e.target.checked)}
                    className="form-checkbox h-5 w-5 text-blue-500 rounded border-gray-600 bg-gray-900 focus:ring-blue-500 focus:ring-offset-gray-800"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white transition-colors">Auto-open Container Select on Amount 'Enter'</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={autoConfirmBest}
                    onChange={e => setAutoConfirmBest(e.target.checked)}
                    className="form-checkbox h-5 w-5 text-blue-500 rounded border-gray-600 bg-gray-900 focus:ring-blue-500 focus:ring-offset-gray-800"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white transition-colors">Auto-confirm best option on Container Select</span>
                </label>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Denomination Priority ({currencyName})</h3>
                <p className="text-xs text-gray-500 mb-2">Drag and drop to set the priority in which bills are selected by the algorithm. Top is highest priority.</p>
                <div className="space-y-2">
                  {orderedActiveDenoms.map((d, index) => (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDraggedDenom(d.id);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!draggedDenom || draggedDenom === d.id) return;
                        
                        setDenomOrder(prev => {
                          const current = prev[currencyName] || activeCurrency.denominations.map(x => x.id);
                          const newOrder = [...current];
                          const fromIdx = newOrder.indexOf(draggedDenom);
                          let toIdx = newOrder.indexOf(d.id);
                          if (fromIdx === -1 || toIdx === -1) return prev;
                          
                          newOrder.splice(fromIdx, 1);
                          newOrder.splice(toIdx, 0, draggedDenom);
                          
                          return { ...prev, [currencyName]: newOrder };
                        });
                        setDraggedDenom(null);
                      }}
                      className="bg-gray-900 border border-gray-700 rounded p-3 flex items-center cursor-move hover:border-blue-500 transition-colors shadow-sm"
                    >
                      <svg className="w-5 h-5 text-gray-500 mr-3 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                      <span className="font-bold text-white">{d.label}</span>
                      <span className="ml-4 mr-2 text-xs text-gray-500">Value: {d.value}</span>
                      
                      <div className="flex flex-col ml-auto">
                        <button 
                          disabled={index === 0} 
                          onClick={() => { setDenomOrder(prev => { const cur = prev[currencyName] || activeCurrency.denominations.map(x => x.id); const idx = cur.indexOf(d.id); if (idx <= 0) return prev; const arr = [...cur]; [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]]; return { ...prev, [currencyName]: arr }; }); }}
                          className="p-1 text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        ><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg></button>
                        <button 
                          disabled={index === orderedActiveDenoms.length - 1} 
                          onClick={() => { setDenomOrder(prev => { const cur = prev[currencyName] || activeCurrency.denominations.map(x => x.id); const idx = cur.indexOf(d.id); if (idx === -1 || idx === cur.length - 1) return prev; const arr = [...cur]; [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]; return { ...prev, [currencyName]: arr }; }); }}
                          className="p-1 text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        ><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Inventory Modal */}
      {isFullInventoryModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-600 w-full max-w-4xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl">
              <h2 className="text-xl font-bold text-white">Full Inventory View</h2>
              <button 
                onClick={() => setIsFullInventoryModalOpen(false)} 
                className="text-gray-400 hover:text-white p-2 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-grow bg-gray-800 rounded-b-xl space-y-8 custom-scrollbar">
              
              <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                <p className="text-gray-400 text-sm">Manage all your cash stacks across every currency globally.</p>
                <button 
                  onClick={() => {
                    if (window.confirm("Are you sure you want to clear ALL inventory? This cannot be undone.")) {
                      setInventory({});
                    }
                  }}
                  className="text-red-400 hover:text-red-300 text-sm font-semibold flex items-center transition-colors"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Clear All
                </button>
              </div>

              {Object.values(CURRENCIES).map(c => (
                <div key={c.name} className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-300">{c.name}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {c.denominations.map(d => (
                      <div key={d.id} className="bg-gray-900 p-3 rounded-xl border border-gray-700 shadow-inner flex flex-col justify-between space-y-3">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-gray-200 text-lg">{d.label}</span>
                          <span className="text-xl font-mono text-white">{inventory[d.id] || "0"}</span>
                        </div>
                        <div className="flex items-center space-x-2 bg-gray-800 p-2 rounded-lg border border-gray-700/50">
                          <input 
                            type="text" 
                            inputMode="numeric"
                            value={modifiers[d.id] || ""}
                            onChange={e => {
                              let val = e.target.value.toLowerCase();
                              val = val.replace(/k/g, '000').replace(/m/g, '000000');
                              val = val.replace(/[^0-9]/g, '');
                              setModifiers({ ...modifiers, [d.id]: val });
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleModify(d.id, 'add');
                            }}
                            className="w-16 bg-gray-950 border border-gray-600 rounded px-2 py-1 text-white text-center font-mono focus:border-blue-500 focus:outline-none placeholder-gray-600 text-sm" 
                            placeholder="0"
                          />
                          <button onClick={() => handleModify(d.id, 'add')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 rounded font-bold transition-colors text-sm" title="Add">+</button>
                          <button onClick={() => handleModify(d.id, 'sub')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 rounded font-bold transition-colors text-sm" title="Subtract">-</button>
                          <button onClick={() => handleModify(d.id, 'set')} className="flex-1 bg-blue-600/80 hover:bg-blue-500 text-white py-1 rounded font-bold transition-colors text-sm" title="Set exact">Set</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cookie Banner */}
      {!cookieConsent && isLoaded && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 p-4 shadow-2xl z-50 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-bottom-full duration-500">
          <p className="text-gray-300 text-sm text-center sm:text-left">
            This site uses browser cookies to save the values you enter and remember your inventory.
          </p>
          <button 
            onClick={acceptCookies}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold whitespace-nowrap transition-colors"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
