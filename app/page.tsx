"use client";
import { useState, useEffect, useRef } from "react";
import { CONTAINERS, CURRENCIES, type Currency, type ContainerItem } from "../lib/config";
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

  const [customContainers, setCustomContainers] = useState<ContainerItem[]>([]);
  const [customCurrencies, setCustomCurrencies] = useState<Record<string, Currency>>({});
  const [isCustomDataModalOpen, setIsCustomDataModalOpen] = useState(false);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [autoOpenContainer, setAutoOpenContainer] = useState(true);
  const [autoConfirmBest, setAutoConfirmBest] = useState(true);
  const [isFullInventoryModalOpen, setIsFullInventoryModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  
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

  const [newContName, setNewContName] = useState("");
  const [newContVol, setNewContVol] = useState("");
  const [newCurrName, setNewCurrName] = useState("");
  const [newCurrBills, setNewCurrBills] = useState<{label: string, value: number}[]>([]);

  // Load from cookies on mount
  useEffect(() => {
    const consent = getCookie("cookieConsent");
    if (!consent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        if (parsed.targetDenom !== undefined) setTargetDenom(parsed.targetDenom);
        if (typeof parsed.emergencySplit === 'boolean') setEmergencySplit(parsed.emergencySplit);
        if (typeof parsed.autoOpenContainer === 'boolean') setAutoOpenContainer(parsed.autoOpenContainer);
        if (typeof parsed.autoConfirmBest === 'boolean') setAutoConfirmBest(parsed.autoConfirmBest);
        if (parsed.customContainers) setCustomContainers(parsed.customContainers);
        if (parsed.customCurrencies) setCustomCurrencies(parsed.customCurrencies);
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
        setIsCustomDataModalOpen(false);
        setIsHelpModalOpen(false);
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
        customContainers,
        customCurrencies
      }));
    }
  }, [currencyName, selectedContainer, balancedMode, fullBlocksOnly, targetDenom, emergencySplit, autoOpenContainer, autoConfirmBest, customContainers, customCurrencies, isLoaded, cookieConsent]);

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
      customContainers,
      customCurrencies
    }));
  };

  const allCurrencies = { ...CURRENCIES, ...customCurrencies };
  const activeCurrency = allCurrencies[currencyName] || CURRENCIES["USD"];

  const allContainers = [...CONTAINERS];
  if (customContainers.length > 0) {
    allContainers.push({ name: "Custom Added", items: customContainers });
  }

  const getCapacity = (name: string) => {
    for (const cat of allContainers) {
      for (const item of cat.items) {
        if (item.name === name) return item.capacity;
      }
    }
    return 1;
  };
  

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

    const activeDenoms = activeCurrency.denominations;
    const denomsToUse: number[] = [];
    const maxCountsToUse: number[] = [];
    const denomLabels: string[] = [];

    const currentContainer = overrideContainer || selectedContainer;
    const capacity = getCapacity(currentContainer);

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
      const targetValue = parseInt(targetDenom, 10);
      
      for (let i = 0; i < denomsToUse.length; i++) {
        const denomPackValue = denomsToUse[i];
        if (denomPackValue !== targetValue) continue;
        
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
        const aContainers = Math.ceil((a.packs * 5) / capacity);
        const bContainers = Math.ceil((b.packs * 5) / capacity);
        if (aContainers !== bContainers) return aContainers - bContainers;
          if (a.balanceScore! !== b.balanceScore!) return a.balanceScore! - b.balanceScore!;
        return a.packs - b.packs;
        });
      } else {
        searchResults.sort((a, b) => {
          const aLoose = !!a.looseStr;
          const bLoose = !!b.looseStr;
          if (aLoose !== bLoose) return aLoose ? 1 : -1;
        const aContainers = Math.ceil((a.packs * 5) / capacity);
        const bContainers = Math.ceil((b.packs * 5) / capacity);
        if (aContainers !== bContainers) return aContainers - bContainers;
          return a.packs - b.packs;
        });
      }
    } else {
      searchResults = balancedMode 
      ? balancedSearch(denomsToUse, maxCountsToUse, desiredAmount, fullBlocksOnly, 50, denomLabels, emergencySplit, capacity)
      : greedySearch(denomsToUse, maxCountsToUse, desiredAmount, fullBlocksOnly, 50, denomLabels, emergencySplit, capacity);

      if (!balancedMode) {
        searchResults.sort((a, b) => {
          const aLoose = !!a.looseStr;
          const bLoose = !!b.looseStr;
          if (aLoose !== bLoose) return aLoose ? 1 : -1;
        const aContainers = Math.ceil((a.packs * 5) / capacity);
        const bContainers = Math.ceil((b.packs * 5) / capacity);
        if (aContainers !== bContainers) return aContainers - bContainers;
          return a.packs - b.packs;
        });
      }
    }

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
          <div className="flex items-center space-x-2 ml-4">
            <button 
              onClick={() => setIsHelpModalOpen(true)}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-600 transition-colors text-blue-400 flex-shrink-0"
              title="Help & Shortcuts"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
            <button 
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-600 transition-colors text-gray-300 flex-shrink-0"
              title="Settings & Flow Rules"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
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
                    {Object.keys(allCurrencies).map(c => (
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
                  <span className="text-sm text-gray-400">Volume: {getCapacity(selectedContainer)}</span>
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
              {activeCurrency.denominations.map(d => (
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
                        const filtered = allContainers.flatMap(c => c.items).filter(i => i.name.toLowerCase().includes(containerSearch.toLowerCase()));
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
                const filteredCategories = allContainers.map(c => ({
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
              
              <button 
                onClick={() => {
                  setIsSettingsModalOpen(false);
                  setIsCustomDataModalOpen(true);
                }}
                className="w-full flex items-center justify-between bg-purple-600/10 border border-purple-500/30 hover:bg-purple-600/20 hover:border-purple-500/50 rounded-xl px-5 py-4 transition-all group"
              >
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-lg text-purple-200">Custom Data Manager</span>
                    <span className="text-sm text-purple-400/70 group-hover:text-purple-300/90 transition-colors">Add your own containers and currencies</span>
                  </div>
                </div>
                <svg className="w-5 h-5 text-purple-400 opacity-50 group-hover:opacity-100 transition-all group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Automated Flow</h3>
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={autoOpenContainer}
                    onChange={e => setAutoOpenContainer(e.target.checked)}
                    className="form-checkbox h-5 w-5 text-blue-500 rounded border-gray-600 bg-gray-900 focus:ring-blue-500 focus:ring-offset-gray-800"
                  />
          <span className="text-sm text-gray-300 group-hover:text-white transition-colors">Auto-open Container Select on Amount &apos;Enter&apos;</span>
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

              {Object.values(allCurrencies).map(c => (
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

      {/* Custom Data Manager Modal */}
      {isCustomDataModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-600 w-full max-w-5xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl">
              <h2 className="text-xl font-bold text-white">Custom Data Manager</h2>
              <button onClick={() => setIsCustomDataModalOpen(false)} className="text-gray-400 hover:text-white p-2 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto flex-grow bg-gray-800 rounded-b-xl custom-scrollbar grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Custom Containers */}
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-white border-b border-gray-700 pb-2">Custom Containers</h3>
                <div className="bg-gray-900 p-4 rounded-lg border border-gray-700 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Name (e.g. Duffle Bag)" value={newContName} onChange={e => setNewContName(e.target.value)} className="bg-gray-950 border border-gray-700 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none" />
                    <input type="number" placeholder="Max Packs (e.g. 50)" value={newContVol} onChange={e => setNewContVol(e.target.value)} className="bg-gray-950 border border-gray-700 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none" />
                  </div>
                  <button 
                    onClick={() => {
                      if (!newContName || !newContVol) return;
                      // Automatically multiply packs by 5 to match the volume algorithm
                      setCustomContainers(prev => [...prev, { name: newContName, capacity: parseInt(newContVol, 10) * 5 }]);
                      setNewContName("");
                      setNewContVol("");
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded transition-colors"
                  >
                    + Add Container
                  </button>
                </div>

                <div className="space-y-2">
                  {customContainers.length === 0 && <p className="text-gray-500 text-sm">No custom containers yet.</p>}
                  {customContainers.map(c => (
                    <div key={c.name} className="flex justify-between items-center bg-gray-700/30 border border-gray-600 p-3 rounded">
                      <div>
                        <span className="font-bold text-white block">{c.name}</span>
                        <span className="text-xs text-gray-400">Holds: {c.capacity / 5} packs (Vol: {c.capacity})</span>
                      </div>
                      <button 
                        onClick={() => {
                          setCustomContainers(prev => prev.filter(x => x.name !== c.name));
                          if (selectedContainer === c.name) setSelectedContainer("Backpack");
                        }}
                        className="text-red-400 hover:text-red-300 p-1"
                      ><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Currencies */}
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-white border-b border-gray-700 pb-2">Custom Currencies</h3>
                <div className="bg-gray-900 p-4 rounded-lg border border-gray-700 space-y-4">
                  <input type="text" placeholder="Currency Code (e.g. AUD, RP)" value={newCurrName} onChange={e => setNewCurrName(e.target.value.toUpperCase())} className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-white font-bold focus:border-purple-500 focus:outline-none" />
                  
                  <div className="space-y-2 border-t border-gray-800 pt-3">
                    <p className="text-xs text-gray-400 font-bold uppercase">Add Denominations</p>
                    {newCurrBills.map((b, i) => (
                      <div key={i} className="flex justify-between items-center text-sm bg-gray-800 p-2 rounded border border-gray-700 text-gray-300">
                        <span>{b.label} (Value: {b.value})</span>
                        <button onClick={() => setNewCurrBills(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-white">&times;</button>
                      </div>
                    ))}
                    <div className="flex space-x-2">
                      <input id="newBillLabelInput" type="text" placeholder="Label (e.g. $50)" className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:border-purple-500 focus:outline-none" />
                      <input id="newBillValueInput" type="number" placeholder="Value (e.g. 5000)" className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:border-purple-500 focus:outline-none" />
                      <button 
                        onClick={() => {
                          const lInput = document.getElementById("newBillLabelInput") as HTMLInputElement;
                          const vInput = document.getElementById("newBillValueInput") as HTMLInputElement;
                          if (!lInput.value || !vInput.value) return;
                          setNewCurrBills(prev => [...prev, { label: lInput.value, value: parseInt(vInput.value, 10) }]);
                          lInput.value = ""; vInput.value = "";
                          lInput.focus();
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 rounded font-bold"
                      >+</button>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      if (!newCurrName || newCurrBills.length === 0) return alert("Enter a name and at least one bill.");
                      const currency: Currency = {
                        name: newCurrName,
                        denominations: newCurrBills.map(b => ({
                          label: b.label,
                          value: b.value,
                          id: `${b.value}_${newCurrName.toLowerCase()}`
                        })).sort((a, b) => b.value - a.value)
                      };
                      setCustomCurrencies(prev => ({...prev, [currency.name]: currency}));
                      setNewCurrName("");
                      setNewCurrBills([]);
                    }}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded transition-colors mt-2"
                  >
                    Save Currency
                  </button>
                </div>

                <div className="space-y-2">
                  {Object.keys(customCurrencies).length === 0 && <p className="text-gray-500 text-sm">No custom currencies yet.</p>}
                  {Object.values(customCurrencies).map(c => (
                    <div key={c.name} className="flex justify-between items-center bg-gray-700/30 border border-gray-600 p-3 rounded">
                      <div>
                        <span className="font-bold text-white block">{c.name}</span>
                        <span className="text-xs text-gray-400">{c.denominations.length} denominations</span>
                      </div>
                      <button 
                        onClick={() => {
                          setCustomCurrencies(prev => {
                            const next = { ...prev };
                            delete next[c.name];
                            return next;
                          });
                          if (currencyName === c.name) setCurrencyName("USD");
                        }}
                        className="text-red-400 hover:text-red-300 p-1"
                      ><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-600 w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl">
              <h2 className="text-xl font-bold text-white flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Help & Info
              </h2>
              <button 
                onClick={() => setIsHelpModalOpen(false)} 
                className="text-gray-400 hover:text-white p-2 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-grow bg-gray-800 rounded-b-xl space-y-6 custom-scrollbar">
              
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-2 mb-3">Keyboard Shortcuts</h3>
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <kbd className="bg-gray-700 border border-gray-500 rounded px-2 py-0.5 text-xs font-mono text-white mr-3 mt-0.5 shadow-[0_2px_0_rgba(107,114,128,1)]">k</kbd>
                    <span className="text-sm text-gray-300">Type in any amount or inventory field to add thousands (e.g., <span className="text-white font-mono">15k</span> &rarr; <span className="text-white font-mono">15000</span>).</span>
                  </li>
                  <li className="flex items-start">
                    <kbd className="bg-gray-700 border border-gray-500 rounded px-2 py-0.5 text-xs font-mono text-white mr-3 mt-0.5 shadow-[0_2px_0_rgba(107,114,128,1)]">m</kbd>
                    <span className="text-sm text-gray-300">Type in any amount or inventory field to add millions (e.g., <span className="text-white font-mono">2m</span> &rarr; <span className="text-white font-mono">2000000</span>).</span>
                  </li>
                  <li className="flex items-start">
                    <kbd className="bg-gray-700 border border-gray-500 rounded px-2 py-0.5 text-xs font-mono text-white mr-3 mt-0.5 shadow-[0_2px_0_rgba(107,114,128,1)] text-nowrap">Enter</kbd>
                    <span className="text-sm text-gray-300">Pressing Enter will automatically progress through the workflow: Calculate &rarr; Select top container result &rarr; Confirm best pack.</span>
                  </li>
                  <li className="flex items-start">
                    <kbd className="bg-gray-700 border border-gray-500 rounded px-2 py-0.5 text-xs font-mono text-white mr-3 mt-0.5 shadow-[0_2px_0_rgba(107,114,128,1)]">Esc</kbd>
                    <span className="text-sm text-gray-300">Close any open modal, window, or cancel a packing confirmation instantly.</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-2 mb-3">Terminology</h3>
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <span className="text-green-500 text-xs font-bold mr-3 mt-0.5 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded shadow-sm">*VB</span>
                    <span className="text-sm text-gray-300"><strong>Very Balanced:</strong> This combination uses an exceptionally even spread of your available abundant bills.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 text-xs font-bold mr-3 mt-0.5 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded shadow-sm">*GB</span>
                    <span className="text-sm text-gray-300"><strong>Good Balance:</strong> This combination has a good distribution of bills, avoiding heavy depletion of rare denominations.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-yellow-500 text-xs font-bold mr-3 mt-0.5 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded shadow-sm text-nowrap">⚠️ Break</span>
                    <span className="text-sm text-gray-300"><strong>Emergency Split:</strong> Occurs when you are short on exact change. The algorithm suggests breaking a full pack into loose bills.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-gray-400 text-xs font-bold mr-3 mt-0.5 bg-gray-700 border border-gray-600 px-1.5 py-0.5 rounded font-mono shadow-sm text-nowrap">1 Block = 30</span>
            <span className="text-sm text-gray-300">Containers hold cash in blocks of 30 packs. The &quot;Only allow full blocks&quot; setting restricts results to exact multiples of 30.</span>
                  </li>
                </ul>
              </div>

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
