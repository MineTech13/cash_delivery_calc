"use client";
import { useState } from "react";
import { CONTAINERS, CURRENCIES, getContainerCapacity } from "../lib/config";
import { greedySearch, balancedSearch, calculateVolume } from "../lib/algorithms";

export default function CashDeliveryCalculator() {
  const [amount, setAmount] = useState<string>("");
  const [currencyName, setCurrencyName] = useState<string>("Dollars");
  const [balancedMode, setBalancedMode] = useState(false);
  const [fullBlocksOnly, setFullBlocksOnly] = useState(false);
  
  const [inventory, setInventory] = useState<Record<string, string>>({});
  const [onlyFlags, setOnlyFlags] = useState<Record<string, boolean>>({});
  const [priorityFlags, setPriorityFlags] = useState<Record<string, boolean>>({});
  
  const [selectedContainer, setSelectedContainer] = useState<string>("Small Box");
  
  const [results, setResults] = useState<{
    comboStr: string;
    packs: number;
    blocks: number;
    volume: number;
    containersNeeded: number;
    balanceScore?: number;
  }[]>([]);

  const activeCurrency = CURRENCIES[currencyName];

  const handleCalculate = () => {
    const desiredAmount = parseInt(amount, 10);
    if (isNaN(desiredAmount) || desiredAmount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    let activeDenoms = [...activeCurrency.denominations];

    // Handle "Only"
    const onlySelected = Object.keys(onlyFlags).filter(k => onlyFlags[k]);
    if (onlySelected.length > 0) {
      activeDenoms = activeDenoms.filter(d => onlySelected.includes(d.id));
    } else {
      // Handle "Priority"
      const prioritySelected = Object.keys(priorityFlags).filter(k => priorityFlags[k]);
      if (prioritySelected.length > 0) {
        activeDenoms.sort((a, b) => {
          const aPrio = prioritySelected.includes(a.id);
          const bPrio = prioritySelected.includes(b.id);
          if (aPrio && !bPrio) return -1;
          if (!aPrio && bPrio) return 1;
          return b.value - a.value; // Sort by value desc otherwise
        });
      }
    }

    const denomsToUse: number[] = [];
    const maxCountsToUse: number[] = [];
    const denomLabels: string[] = [];

    for (const d of activeDenoms) {
      const invStr = inventory[d.id];
      if (!invStr) continue;
      const count = parseInt(invStr, 10);
      if (isNaN(count) || count <= 0) continue;
      
      const maxUseful = Math.min(count, Math.floor(desiredAmount / d.value));
      
      if (maxUseful > 0) {
        denomsToUse.push(d.value);
        maxCountsToUse.push(maxUseful);
        denomLabels.push(d.label);
      }
    }

    if (denomsToUse.length === 0) {
      setResults([]);
      alert("No valid denominations with sufficient inventory.");
      return;
    }

    const searchResults = balancedMode 
      ? balancedSearch(denomsToUse, maxCountsToUse, desiredAmount, fullBlocksOnly)
      : greedySearch(denomsToUse, maxCountsToUse, desiredAmount, fullBlocksOnly);

    if (!balancedMode) {
      searchResults.sort((a, b) => a.packs - b.packs);
    }

    const capacity = getContainerCapacity(selectedContainer);

    const formattedResults = searchResults.map(res => {
      const volume = calculateVolume(denomsToUse, res.combo);
      const containersNeeded = Math.ceil(volume / capacity);
      
      const comboItems = [];
      for (let i = 0; i < denomsToUse.length; i++) {
        if (res.combo[i] > 0) {
          comboItems.push({ val: denomsToUse[i], label: denomLabels[i], count: res.combo[i] });
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
        balanceScore: res.balanceScore
      };
    });

    setResults(formattedResults);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans dark:bg-gray-900 dark:text-gray-100">
      <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
        <h1 className="text-3xl font-bold mb-8 text-center text-blue-600 dark:text-blue-400">Cash Delivery Calculator</h1>

        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 bg-gray-50 dark:bg-gray-800/50 p-6 rounded-lg border border-gray-100 dark:border-gray-700/50">
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Job Amount</label>
            <input 
              type="number" 
              value={amount} 
              onChange={e => setAmount(e.target.value)} 
              className="w-full p-3 border border-gray-300 rounded shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white transition-all"
              placeholder="e.g. 100000"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Currency</label>
            <div className="flex space-x-6 h-12 items-center">
              {Object.keys(CURRENCIES).map(c => (
                <label key={c} className="flex items-center space-x-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="currency" 
                    value={c} 
                    checked={currencyName === c} 
                    onChange={() => {
                      setCurrencyName(c);
                      setInventory({});
                      setOnlyFlags({});
                      setPriorityFlags({});
                    }}
                    className="w-5 h-5 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="font-medium">{c}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="flex flex-wrap gap-6 mb-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/30">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input 
              type="checkbox" 
              checked={balancedMode} 
              onChange={e => setBalancedMode(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="font-medium text-blue-900 dark:text-blue-100">Balanced Mode (Distribute Packs)</span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <input 
              type="checkbox" 
              checked={fullBlocksOnly} 
              onChange={e => setFullBlocksOnly(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="font-medium text-blue-900 dark:text-blue-100">Full Blocks Only (Multiples of 30)</span>
          </label>
        </div>

        {/* Denominations */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200 border-b pb-2 dark:border-gray-700">
            Denominations ({activeCurrency.name})
          </h2>
          <div className="overflow-x-auto shadow-sm rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left border-collapse bg-white dark:bg-gray-800">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wider">
                  <th className="p-4 border-b dark:border-gray-600">Denomination</th>
                  <th className="p-4 border-b dark:border-gray-600">Inventory (Max Packs)</th>
                  <th className="p-4 border-b dark:border-gray-600 text-center">Only</th>
                  <th className="p-4 border-b dark:border-gray-600 text-center">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {activeCurrency.denominations.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="p-4 font-bold text-lg text-gray-800 dark:text-gray-200">{d.label}</td>
                    <td className="p-4">
                      <input 
                        type="number" 
                        value={inventory[d.id] || ""} 
                        onChange={e => setInventory({...inventory, [d.id]: e.target.value})} 
                        className="w-32 p-2 border border-gray-300 rounded shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        placeholder="e.g. 50"
                      />
                    </td>
                    <td className="p-4 text-center">
                      <input 
                        type="checkbox" 
                        checked={onlyFlags[d.id] || false} 
                        onChange={e => setOnlyFlags({...onlyFlags, [d.id]: e.target.checked})}
                        className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="p-4 text-center">
                      <input 
                        type="checkbox" 
                        checked={priorityFlags[d.id] || false} 
                        onChange={e => setPriorityFlags({...priorityFlags, [d.id]: e.target.checked})}
                        className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Containers */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200 border-b pb-2 dark:border-gray-700">
            Select Container Type
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-gray-50 dark:bg-gray-800/50 p-6 rounded-lg border border-gray-100 dark:border-gray-700/50">
            {CONTAINERS.map(cat => (
              <div key={cat.name}>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{cat.name}</h3>
                <div className="flex flex-col gap-2">
                  {cat.items.map(item => (
                    <button
                      key={item.name}
                      onClick={() => setSelectedContainer(item.name)}
                      className={`px-4 py-3 text-sm font-medium rounded-lg border transition-all text-left flex justify-between items-center ${
                        selectedContainer === item.name 
                          ? "bg-green-600 text-white border-green-600 shadow-md transform scale-[1.02]" 
                          : "bg-white text-gray-700 border-gray-200 hover:border-green-400 hover:text-green-700 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-green-500"
                      }`}
                    >
                      <span>{item.name}</span>
                      <span className={`text-xs ${selectedContainer === item.name ? "text-green-100" : "text-gray-400 dark:text-gray-500"}`}>
                        vol: {item.capacity}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button 
          onClick={handleCalculate}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 text-lg"
        >
          Calculate Splits
        </button>

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">Results</h2>
            <div className="overflow-x-auto shadow-md rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-left border-collapse bg-white dark:bg-gray-800">
                <thead>
                  <tr className="bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200 text-sm uppercase tracking-wider">
                    <th className="p-4 border-b border-blue-100 dark:border-blue-900/50">Counts</th>
                    <th className="p-4 border-b border-blue-100 dark:border-blue-900/50 text-center">Packs</th>
                    <th className="p-4 border-b border-blue-100 dark:border-blue-900/50 text-center">Blocks</th>
                    <th className="p-4 border-b border-blue-100 dark:border-blue-900/50 text-center">Volume</th>
                    <th className="p-4 border-b border-blue-100 dark:border-blue-900/50">Containers Needed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-blue-50/50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="p-4 text-gray-800 dark:text-gray-200 font-medium">
                        {r.comboStr}
                        {r.balanceScore !== undefined && r.balanceScore < 50 && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" title="Very Balanced">
                            *VB
                          </span>
                        )}
                        {r.balanceScore !== undefined && r.balanceScore >= 50 && r.balanceScore < 100 && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" title="Good Balance">
                            *GB
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center text-gray-600 dark:text-gray-300">{r.packs}</td>
                      <td className="p-4 text-center text-gray-600 dark:text-gray-300">{r.blocks}</td>
                      <td className="p-4 text-center text-gray-600 dark:text-gray-300">{r.volume}</td>
                      <td className="p-4 font-medium text-gray-800 dark:text-gray-200">
                        {r.containersNeeded} x {selectedContainer}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
