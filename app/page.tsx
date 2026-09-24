'use client';

import { useState } from 'react';

export default function Page() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const res = await fetch('/api/evaluate', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    setResult(await res.json());
    setLoading(false);
  }

  return (
    <main>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        style={{ width: '100%' }}
        placeholder="Paste a transcript…"
      />
      <button onClick={run} disabled={loading || !text}>
        {loading ? 'Evaluating…' : 'Evaluate'}
      </button>
      {result != null && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </main>
  );
}
