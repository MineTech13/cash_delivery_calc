# Cash Delivery Calculator

A modern web application designed to help logistics and vault teams plan, calculate, and optimize physical cash packing operations. 

This project is a web-based conversion of a legacy Python/Tkinter desktop application, rebuilt from the ground up using modern web technologies to improve accessibility, responsiveness, and user experience.

## Features

- **Smart Packing Algorithms**: Automatically calculates the best way to break down a target cash amount into available denominations using standard or "Smart Balance" (inventory-aware) distributions.
- **Inventory Management**: Keep track of your available packs of cash across multiple global currencies (USD, EUR, JPY, GBP).
- **Container Logistics**: Select from various container types (backpacks, duffle bags, pallets, etc.) to determine exactly how many containers are needed for a job based on standard pack volumes.
- **Customizable Data**: Add custom containers, create new currencies, and tailor the workflow rules to fit your exact operational needs.
- **Emergency Splits**: Automatically calculates loose bills when breaking a full pack is required for exact change.
- **Persistent State**: Saves your inventory and settings locally in the browser so you don't lose your work between sessions.

## Tech Stack

- Next.js (App Router)
- React
- Tailwind CSS v4
- TypeScript

## Getting Started

First, install the dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open http://localhost:3000 with your browser to see the application in action.

## Background

This project originated as a Python script (`old_examples/Cash_Delivery_Calculator.py`). It was ported to this modern web technology stack to remove the need for local desktop environment setup and make it instantly usable on any device.
