export type ContainerItem = {
  name: string;
  capacity: number;
};

export type ContainerCategory = {
  name: string;
  items: ContainerItem[];
};

export const CONTAINERS: ContainerCategory[] = [
  {
    name: "Small Containers",
    items: [
      { name: "Piggybank", capacity: 50 },
      { name: "Case", capacity: 150 },
      { name: "Gift Box", capacity: 180 },
      { name: "Small Box", capacity: 200 },
      { name: "Backpack", capacity: 300 },
      { name: "Flat Box", capacity: 340 },
      { name: "Small Travelbag", capacity: 350 },
    ],
  },
  {
    name: "Medium Containers",
    items: [
      { name: "Medium Box", capacity: 400 },
      { name: "Sportsbag", capacity: 500 },
      { name: "Large Box", capacity: 600 },
      { name: "Large Travelbag", capacity: 600 },
      { name: "Bank Bag", capacity: 650 },
      { name: "Suitcase", capacity: 700 },
    ],
  },
  {
    name: "Large Containers",
    items: [
      { name: "Shopping Cart", capacity: 1600 },
      { name: "Mattress", capacity: 2200 },
      { name: "Pallet", capacity: 2900 },
      { name: "XXL Box", capacity: 3650 },
    ],
  },
];

// Helper to easily get capacity by container name
export const getContainerCapacity = (name: string): number => {
  for (const category of CONTAINERS) {
    for (const item of category.items) {
      if (item.name === name) return item.capacity;
    }
  }
  return 1;
};

export type Denomination = {
  value: number;
  label: string;
  id: string;
};

export type Currency = {
  name: string;
  denominations: Denomination[];
};

export const CURRENCIES: Record<string, Currency> = {
  Dollars: {
    name: "Dollars",
    denominations: [
      { value: 10000, label: "$100", id: "10000" },
      { value: 5000, label: "$50", id: "5000" },
      { value: 2000, label: "$20", id: "2000" },
      { value: 1000, label: "$10", id: "1000" },
    ],
  },
  Euros: {
    name: "Euros",
    denominations: [
      { value: 10000, label: "€100", id: "10000e" },
      { value: 5000, label: "€50", id: "5000e" },
      { value: 2000, label: "€20", id: "2000e" },
    ],
  },
  Yen: {
    name: "Yen",
    denominations: [
      { value: 1000000, label: "¥10,000", id: "1000000" },
      { value: 500000, label: "¥5,000", id: "500000" },
      { value: 100000, label: "¥1,000", id: "100000" },
    ],
  },
};
