export function calculateVolume(denominations: number[], combo: number[]): number {
  let volume = 0;
  for (let i = 0; i < denominations.length; i++) {
    const count = combo[i];
    const totalBills = count * 100;
    volume += totalBills * 0.1 * 0.5;
  }
  return volume;
}

export function calculateBalanceScore(
  denominations: number[],
  maxCounts: number[],
  combo: number[]
): number {
  let score = 0;
  let totalUsageRatio = 0;

  for (let i = 0; i < denominations.length; i++) {
    const count = combo[i];
    const maxCount = maxCounts[i];
    if (count > 0 && maxCount > 0) {
      const usageRatio = count / maxCount;
      totalUsageRatio += usageRatio;
      score += usageRatio * 100;

      if (maxCount >= 10) {
        const abundanceBonus = maxCount / 100;
        score -= abundanceBonus;
      }
    }
  }

  if (combo.length > 1) {
    const usedDenoms = combo.filter((count) => count > 0);
    if (usedDenoms.length > 0) {
      const avgUsage =
        usedDenoms.reduce((sum, val) => sum + val, 0) / usedDenoms.length;
      let variance = 0;
      for (const count of usedDenoms) {
        variance += Math.pow(count - avgUsage, 2);
      }
      variance /= usedDenoms.length;
      score += variance * 0.1;
    }
  }

  return score;
}

export type SearchResult = {
  combo: number[];
  packs: number;
  total: number;
  balanceScore?: number;
  looseStr?: string;
};

export function greedySearch(
  denominations: number[],
  maxCounts: number[],
  desiredAmount: number,
  fullBlocksOnly: boolean,
  maxResults: number = 30,
  labels: string[] = [],
  emergencySplit: boolean = false
): SearchResult[] {
  const results: SearchResult[] = [];
  const startTime = Date.now();
  let iters = 0;

  function recurse(
    index: number,
    currentCombo: number[],
    currentTotal: number,
    totalPacks: number
  ) {
    if (results.length >= maxResults) return;
    if (currentTotal > desiredAmount) return;

    // Prevent UI freeze on exhaustive/impossible search spaces
    if (++iters % 1000 === 0 && Date.now() - startTime > 500) return;

    if (index === denominations.length) {
      if (currentTotal === desiredAmount) {
        if (!fullBlocksOnly || totalPacks % 30 === 0) {
          results.push({
            combo: [...currentCombo],
            packs: totalPacks,
            total: currentTotal,
          });
        }
      }
      else if (emergencySplit && currentTotal < desiredAmount) {
        const remainder = desiredAmount - currentTotal;
        for (let i = 0; i < denominations.length; i++) {
          const packValue = denominations[i];
          const faceValue = packValue / 100;
          if (currentCombo[i] < maxCounts[i] && packValue > remainder && remainder % faceValue === 0) {
            const looseBills = remainder / faceValue;
            const combo = [...currentCombo];
            combo[i] += 1;
            const totalPacksNew = totalPacks + 1;
            if (!fullBlocksOnly || totalPacksNew % 30 === 0) {
              results.push({ combo, packs: totalPacksNew, total: desiredAmount, looseStr: `Break 1x ${labels[i]} pack for ${looseBills} loose bills` });
            }
            break; // Just need one valid split
          }
        }
      }
      return;
    }

    const denom = denominations[index];
    const maxPossible = Math.min(
      maxCounts[index],
      Math.floor((desiredAmount - currentTotal) / denom)
    );

    for (let count = maxPossible; count >= 0; count--) {
      recurse(
        index + 1,
        [...currentCombo, count],
        currentTotal + denom * count,
        totalPacks + count
      );
    }
  }

  recurse(0, [], 0, 0);
  return results;
}

export function balancedSearch(
  denominations: number[],
  maxCounts: number[],
  desiredAmount: number,
  fullBlocksOnly: boolean,
  maxResults: number = 50,
  labels: string[] = [],
  emergencySplit: boolean = false
): SearchResult[] {
  const results: SearchResult[] = [];
  const startTime = Date.now();
  let iters = 0;

  function recurse(
    index: number,
    currentCombo: number[],
    currentTotal: number,
    totalPacks: number
  ) {
    if (results.length >= maxResults * 2) return;
    if (currentTotal > desiredAmount) return;

    // Prevent UI freeze on exhaustive/impossible search spaces
    if (++iters % 1000 === 0 && Date.now() - startTime > 500) return;

    if (index === denominations.length) {
      if (currentTotal === desiredAmount) {
        if (!fullBlocksOnly || totalPacks % 30 === 0) {
          results.push({
            combo: [...currentCombo],
            packs: totalPacks,
            total: currentTotal,
          });
        }
      }
      else if (emergencySplit && currentTotal < desiredAmount) {
        const remainder = desiredAmount - currentTotal;
        for (let i = 0; i < denominations.length; i++) {
          const packValue = denominations[i];
          const faceValue = packValue / 100;
          if (currentCombo[i] < maxCounts[i] && packValue > remainder && remainder % faceValue === 0) {
            const looseBills = remainder / faceValue;
            const combo = [...currentCombo];
            combo[i] += 1;
            const totalPacksNew = totalPacks + 1;
            if (!fullBlocksOnly || totalPacksNew % 30 === 0) {
              results.push({ combo, packs: totalPacksNew, total: desiredAmount, looseStr: `Break 1x ${labels[i]} pack for ${looseBills} loose bills` });
            }
            break; // Just need one valid split
          }
        }
      }
      return;
    }

    const denom = denominations[index];
    const maxPossible = Math.min(
      maxCounts[index],
      Math.floor((desiredAmount - currentTotal) / denom)
    );

    const rangesToTry: number[][] = [];

    if (maxCounts[index] >= 5) {
      const preferredUsage = Math.min(
        Math.floor(maxCounts[index] / 2),
        maxPossible
      );
      const start = Math.max(0, preferredUsage - 2);
      const end = Math.min(preferredUsage + 3, maxPossible + 1);
      const range: number[] = [];
      for (let i = start; i < end; i++) range.push(i);
      rangesToTry.push(range);
    }

    const fullRange: number[] = [];
    for (let i = 0; i <= maxPossible; i++) fullRange.push(i);
    
    const middle = Math.floor(fullRange.length / 2);
    const sortedRange: number[] = [];
    for (let i = 0; i < fullRange.length; i++) {
      const idx =
        i % 2 === 0
          ? middle + Math.floor(i / 2)
          : middle - Math.floor((i + 1) / 2);
      if (idx >= 0 && idx < fullRange.length) {
        sortedRange.push(fullRange[idx]);
      }
    }
    rangesToTry.push(sortedRange);

    const triedCounts = new Set<number>();
    for (const rangeStrategy of rangesToTry) {
      for (const count of rangeStrategy) {
        if (!triedCounts.has(count)) {
          triedCounts.add(count);
          recurse(
            index + 1,
            [...currentCombo, count],
            currentTotal + denom * count,
            totalPacks + count
          );
        }
      }
    }
  }

  recurse(0, [], 0, 0);

  if (results.length > 0) {
    const scoredResults = results.map((r) => {
      const score = calculateBalanceScore(denominations, maxCounts, r.combo);
      return { ...r, balanceScore: score };
    });

    scoredResults.sort((a, b) => {
      const aLoose = !!a.looseStr;
      const bLoose = !!b.looseStr;
      if (aLoose !== bLoose) return aLoose ? 1 : -1;

      if (a.balanceScore! !== b.balanceScore!) {
        return a.balanceScore! - b.balanceScore!;
      }
      return a.packs - b.packs;
    });

    return scoredResults.slice(0, maxResults);
  }

  return results;
}
