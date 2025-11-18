# Frontend + FLOW Integration

FLOW runs VOIKE's backend workloads, but the same semantics power full-stack UI/UX. This reference shows how to build Tailwind-based dashboards, React components, Lovable prompts, and plan-controlled VASM experiences. Need a zero-setup demo? Hit `/playground/flow-ui` on any VOIKE deployment—the built-in Tailwind UI lets you paste an API key and drive `/flow/parse`, `/flow/plan`, and `/flow/execute` live.

## 1. Tailwind Design System

Re-use the landing-page theme:
- `bg-slate-950`, `bg-slate-900`, `bg-slate-800`
- `text-slate-100/300`
- Accent colors: `text-emerald-300`, `text-sky-300`, `text-pink-400`
- Cards: `rounded-3xl border border-slate-800/70 bg-slate-900/70 shadow-[0_20px_80px_rgba(15,23,42,0.6)]`
- Buttons: `px-4 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold shadow-lg shadow-emerald-500/30`

##### Example section layout
```html
<section class="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-10 backdrop-blur space-y-6">
  <div class="flex justify-between flex-wrap gap-4">
    <div>
      <p class="text-xs uppercase tracking-[0.45em] text-emerald-300/80">Flow</p>
      <h2 class="text-3xl font-semibold text-white">Flow Playground</h2>
    </div>
    <div class="flex gap-2">
      <button class="px-4 py-2 bg-sky-500 text-slate-950 rounded-xl">Parse</button>
      <button class="px-4 py-2 bg-emerald-500 text-slate-950 rounded-xl">Plan</button>
      <button class="px-4 py-2 bg-pink-500 text-slate-950 rounded-xl">Execute</button>
    </div>
  </div>
  <!-- Content goes here -->
</section>
```

Tailwind config:
```js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        'voike-bg': '#020617',
      },
    },
  },
};
```

## 2. FlowClient + React

Use `flow/src/sdk/client.ts` and `flow/src/sdk/react.tsx`:

```tsx
import { FlowClient } from '@voike/flow-sdk/client';
import { FlowPlayground } from '@voike/flow-sdk/react';

const client = new FlowClient({ baseUrl: import.meta.env.VITE_VOIKE_BASE, apiKey: localStorage.getItem('VOIKE_API_KEY')! });

export function FlowPage() {
  return (
    <main className="min-h-screen bg-voike-bg text-slate-100">
      <FlowPlayground client={client} />
    </main>
  );
}
```

`FlowPlayground` handles parse/plan/execute and renders AST/plan/outputs.

## 3. Lovable / GPT Master Prompt

```
You are VOIKE FLOW copilot. Use flow/README.md, flow/api.md, flow/docs/*.md as specs.
When asked for features:
1. Generate FLOW script.
2. Validate via /flow/parse.
3. Plan via /flow/plan.
4. Optionally /flow/execute.
5. Produce React + Tailwind code using FlowClient/FlowPlayground.
6. If low-level logic needed, emit VASM per spec.
Always keep contracts stable.
```

## 4. Full-stack Patterns

- **FLOW Dashboard**: Flow list, editor, execution log, chat panel using `/flow/*` + `/chat` + `/metrics`.
- **FLOW + Chat Portal**: FlowPlayground on left, Chat and AI suggestions on right.
- **Capsule Gallery**: Show capsules with FLOW plans and outputs.

## 5. VASM in Frontend

Compile VASM to WASM/JS and run micro interactions or deterministic simulations; stub `VOIKE_*` syscalls for offline demos.

## 6. DX Tips

- Debounce parse/plan calls.
- Cache `/flow/plans` with SWR/React Query.
- Provide CLI scaffolds (future `npm init voike-flow-app`).

With FlowClient, FlowPlayground, and these UI patterns, devs can build full-stack VOIKE apps + dashboards quickly, while letting LLMs generate .flow + UI templates via Lovable or GPT codegen.
