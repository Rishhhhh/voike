# VOIKE FLOW UI Starter

This folder hosts optional frontend code (React + Tailwind) for the FLOW playground. To bootstrap a UI:

1. `npm create vite@latest flow-playground -- --template react-ts`
2. Copy `flow/src/sdk/client.ts` and `flow/src/sdk/react.tsx` into your project (or publish later).
3. Use the snippet below for App shell.

### App.tsx
```tsx
import React from 'react';
import { FlowClient } from './flow/client';
import { FlowPlayground } from './flow/react';

const client = new FlowClient({ baseUrl: import.meta.env.VITE_VOIKE_BASE, apiKey: import.meta.env.VITE_VOIKE_API_KEY });

function App() {
  return (
    <div className="min-h-screen bg-voike-bg text-slate-100">
      <header className="p-6 border-b border-slate-800/70">
        <h1 className="text-3xl font-semibold">VOIKE FLOW Playground</h1>
      </header>
      <main className="p-6">
        <FlowPlayground client={client} />
      </main>
    </div>
  );
}

export default App;
```
