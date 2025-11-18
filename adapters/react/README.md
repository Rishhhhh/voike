# React Hook Adapter

`useVoikeClient` wraps `fetch` calls and automatically:

- Resolves the active VOIKE endpoint via VDNS/SNRL (falls back to local path if offline).
- Dual-writes user intents (e.g., chat message) to VOIKE `/chat` while still calling your legacy API.
- Exposes `shadowMode`, `failover`, and `dualWrite` toggles.

Usage:

```tsx
import { useVoikeClient } from './useVoikeClient';

export function ChatComposer() {
  const voike = useVoikeClient();
  const [text, setText] = useState('');

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await voike.sendChat(text);
      }}
    >
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
      <button type="submit">Send</button>
    </form>
  );
}
```
