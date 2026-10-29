export type MoneyKind = "bills" | "coins";

export type ContainerItem = {
  name: string;
  capacity: number;
  image?: string;
  // Alternative names used in quest texts and by older versions of this app
  aliases?: string[];
  coinsOnly?: boolean;
};

export type ContainerCategory = {
  name: string;
  items: ContainerItem[];
};

const containerImage = (slug: string) => `/images/containers/${slug}.webp`;

// Capacities match the in-game storage capacity (1 loose bill or coin = 1 volume)
export const CONTAINERS: ContainerCategory[] = [
  {
    name: "Small Containers",
    items: [
      { name: "Piggy Bank", capacity: 50, image: containerImage("piggy-bank"), aliases: ["Piggybank", "unbroken piggy bank"], coinsOnly: true },
      { name: "Case", capacity: 150, image: containerImage("case") },
      { name: "Cubic Gift Box", capacity: 180, image: containerImage("cubic-gift-box"), aliases: ["Gift Box"] },
      { name: "Cardboard Box S", capacity: 200, image: containerImage("cardboard-box-s"), aliases: ["Small Box", "box"] },
      { name: "Aluminum Case", capacity: 200, image: containerImage("aluminum-case"), aliases: ["Aluminium Case"] },
      { name: "Luxury Genuine Leather Premium Bag", capacity: 200, image: containerImage("luxury-bag") },
      { name: "Standing Punching Bag", capacity: 225, image: containerImage("punching-bag") },
      { name: "Backpack", capacity: 300, image: containerImage("backpack") },
      { name: "Flat Gift Box", capacity: 340, image: containerImage("flat-gift-box"), aliases: ["Flat Box"] },
      { name: "Bitter Run Travelbag", capacity: 350, image: containerImage("bitter-run-travelbag"), aliases: ["Small Travelbag", "travelbag"] },
    ],
  },
  {
    name: "Medium Containers",
    items: [
      { name: "Cardboard Box M", capacity: 400, image: containerImage("cardboard-box-l"), aliases: ["Medium Box"] },
      { name: "Classic Sports Bag", capacity: 500, image: containerImage("classic-sports-bag"), aliases: ["Sportsbag", "sport bag", "black sport bag"] },
      { name: "Teddy Bear Backpack", capacity: 500, image: containerImage("teddy-bear-backpack") },
      { name: "Wooden Shipping Crate", capacity: 500, image: containerImage("wooden-shipping-crate") },
      { name: "Cardboard Box L", capacity: 600, image: containerImage("cardboard-box-l"), aliases: ["Large Box"] },
      { name: "Mocha Haul Travelbag", capacity: 600, image: containerImage("mocha-haul-travelbag"), aliases: ["Large Travelbag"] },
      { name: "Food Delivery Backpack", capacity: 600, image: containerImage("food-delivery-backpack") },
      { name: "Bank Bag", capacity: 650, image: containerImage("bank-bag") },
      { name: "Vintage Leather Case", capacity: 650, image: containerImage("vintage-leather-case") },
      { name: "Suitcase", capacity: 700, image: containerImage("suitcase") },
    ],
  },
  {
    name: "Large Containers",
    items: [
      { name: "Barrel L", capacity: 1000, image: containerImage("barrel-l"), aliases: ["barrel"] },
      { name: "Shopping Cart", capacity: 1600, image: containerImage("shopping-cart") },
      { name: "Spring Mattress", capacity: 2200, image: containerImage("spring-mattress"), aliases: ["Mattress"] },
      { name: "T-Rex Piñata", capacity: 2200, image: containerImage("t-rex-pinata"), aliases: ["T-Rex Pinata", "Pinata"] },
      { name: "Wooden Pallet", capacity: 2900, image: containerImage("wooden-pallet"), aliases: ["Pallet"] },
      { name: "Plastic Pallet", capacity: 2900, image: containerImage("plastic-pallet"), aliases: ["Pallet"] },
      { name: "Cardboard Box XXL", capacity: 3650, image: containerImage("cardboard-box-xxl"), aliases: ["XXL Box"] },
      { name: "Barrel XXL", capacity: 3650, image: containerImage("barrel-xxl"), aliases: ["barrel"] },
    ],
  },
];

// Container names used by earlier versions of this app, mapped to the in-game names
export const LEGACY_CONTAINER_NAMES: Record<string, string> = {
  "Piggybank": "Piggy Bank",
  "Gift Box": "Cubic Gift Box",
  "Small Box": "Cardboard Box S",
  "Flat Box": "Flat Gift Box",
  "Small Travelbag": "Bitter Run Travelbag",
  "Medium Box": "Cardboard Box M",
  "Sportsbag": "Classic Sports Bag",
  "Large Box": "Cardboard Box L",
  "Large Travelbag": "Mocha Haul Travelbag",
  "Mattress": "Spring Mattress",
  "Pallet": "Wooden Pallet",
  "XXL Box": "Cardboard Box XXL",
};

export const containerMatches = (item: ContainerItem, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, ...(item.aliases || [])].some(n => n.toLowerCase().includes(q));
};

// Helper to easily get capacity by container name
export const getContainerCapacity = (name: string): number => {
  for (const category of CONTAINERS) {
    for (const item of category.items) {
      if (item.name === name) return item.capacity;
    }
  }
  return 1;
};

export type MoneyForm = {
  perUnit: number;       // bills per pack / coins per roll
  unitVolume: number;    // container volume of one full pack / roll
  blockSize: number;     // packs / rolls per block
  unitName: string;
  unitNamePlural: string;
  looseName: string;
  image: string;
  blockImage: string;
};

export const MONEY_FORMS: Record<MoneyKind, MoneyForm> = {
  bills: {
    perUnit: 100,
    unitVolume: 5,
    blockSize: 30,
    unitName: "pack",
    unitNamePlural: "packs",
    looseName: "bills",
    image: "/images/money/pack.webp",
    blockImage: "/images/money/wrapped-block.webp",
  },
  coins: {
    perUnit: 20,
    unitVolume: 20,
    blockSize: 10,
    unitName: "roll",
    unitNamePlural: "rolls",
    looseName: "coins",
    image: "/images/coins/roll.webp",
    blockImage: "/images/coins/block.webp",
  },
};

// Bills and coins share one inventory map; coin ids end in "_coin"
export const moneyKindOf = (denominationId: string): MoneyKind =>
  denominationId.endsWith("_coin") ? "coins" : "bills";

export type Denomination = {
  value: number; // value of one full pack / roll, in the currency's base units for this money kind
  label: string;
  id: string;
  image?: string;
};

export type Currency = {
  name: string;
  denominations: Denomination[];
  coins?: Denomination[];
  // Coin values are stored in minor units (e.g. cents) so fractional coins stay integers
  coinScale?: number;
};

const bill = (cur: string, face: number, label: string): Denomination => ({
  value: face * MONEY_FORMS.bills.perUnit,
  label,
  id: `${face * MONEY_FORMS.bills.perUnit}_${cur}`,
  image: `/images/bills/${cur}-${face}.webp`,
});

// faceMinor is the coin's face value in minor units (cents, or yen for JPY)
const coin = (cur: string, faceMinor: number, label: string, slug: string | null): Denomination => ({
  value: faceMinor * MONEY_FORMS.coins.perUnit,
  label,
  id: `${faceMinor * MONEY_FORMS.coins.perUnit}_${cur}_coin`,
  image: slug ? `/images/coins/${cur}-${slug}.webp` : undefined,
});

export const CURRENCIES: Record<string, Currency> = {
  USD: {
    name: "USD",
    denominations: [
      bill("usd", 100, "$100"),
      bill("usd", 50, "$50"),
      bill("usd", 20, "$20"),
      bill("usd", 10, "$10"),
    ],
    coinScale: 100,
    coins: [
      coin("usd", 100, "$1", "1"),
      coin("usd", 50, "$0.50", "0.50"),
      coin("usd", 25, "$0.25", "0.25"),
      coin("usd", 10, "$0.10", "0.10"),
    ],
  },
  EUR: {
    name: "EUR",
    denominations: [
      bill("eur", 100, "€100"),
      bill("eur", 50, "€50"),
      bill("eur", 20, "€20"),
    ],
    coinScale: 100,
    coins: [
      coin("eur", 200, "€2", "2"),
      coin("eur", 100, "€1", "1"),
      coin("eur", 50, "€0.50", "0.50"),
      coin("eur", 20, "€0.20", "0.20"),
    ],
  },
  JPY: {
    name: "JPY",
    denominations: [
      bill("jpy", 10000, "¥10,000"),
      bill("jpy", 5000, "¥5,000"),
      bill("jpy", 1000, "¥1,000"),
    ],
    coinScale: 1,
    coins: [
      coin("jpy", 500, "¥500", "500"),
      coin("jpy", 100, "¥100", "100"),
      coin("jpy", 50, "¥50", "50"),
      coin("jpy", 10, "¥10", "10"),
    ],
  },
  GBP: {
    name: "GBP",
    denominations: [
      bill("gbp", 50, "£50"),
      bill("gbp", 20, "£20"),
      bill("gbp", 10, "£10"),
      bill("gbp", 5, "£5"),
    ],
    // The game ships no shop icons for pound coins
    coinScale: 100,
    coins: [
      coin("gbp", 200, "£2", null),
      coin("gbp", 100, "£1", null),
      coin("gbp", 50, "£0.50", null),
      coin("gbp", 20, "£0.20", null),
    ],
  },
};
