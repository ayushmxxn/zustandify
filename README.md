# Convert States to Zustand Stores With a Single Click

A extension that helps you convert your states made with `useState` hook in your React/Next.js projects into Zustand stores with a single click.

## ⚙️ How It Works

1. **Detect**: The extension scans the current file for all `useState` hooks.
2. **Create**: For each `useState` hook, it creates a Zustand store file in the appropriate directory (`src/store` or `app/store`).
3. **Consume**: It replaces `useState` hooks in your code with Zustand store usage.

## Usage

1. Open a file containing your states with `useState` hook.

```javascript
import React, { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>{count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}
```

2. Look for the "Convert States to Stores" status bar item at the bottom-right of your VS Code window and click on it.

3. The extension will Create Zustand store for the `count state` under stores folder as (`./store/useCountStore.ts`).

```javascript
import { create } from "zustand";

// Types
interface CountStoreState {
  count: any;
  setCount: (newCount: any) => void;
}

const useCountStore =
  create <
  CountStoreState >
  ((set) => ({
    count: null, // Initial state
    setCount: (newCount) => set({ count: newCount }), // Updater
  }));

export default useCountStore;
```

4. The extension will update the component automatically to use the generated Zustand store

```javascript
"use client";
import countStore from "./store/useCountStore";

function Home() {
  const { count, setCount } = countStore();
  return (
    <div>
      <div>Count: {count}</div>
      <button
        onClick={() => setCount(count + 1)}
        className="bg-neutral-800 text-white px-4 py-2 rounded"
      >
        Increment
      </button>
    </div>
  );
}
export default Home;
```

## Creator

This extension is created and maintained by the following person.

<img src="https://i.ibb.co/SBH4G8V/Avatar.jpg" alt="Ayushmaan Singh" width="100" height="100" style="border-radius: 50%;">

Ayushmaan Singh

## Connect With Me

- [Twitter](https://twitter.com/ayushmxxn)
- [GitHub](https://github.com/ayushmxxn)
- [Discord](https://discord.com/invite/kzk6uWey3g)

## Support

If you found this extension useful, you can buy me a coffee ☕️

<a href="https://ko-fi.com/ayushmxxn" target="_blank">
    <a href='https://ko-fi.com/H2H6WCASE' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi1.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
</a>
