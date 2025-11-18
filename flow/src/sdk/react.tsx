import React, { useState } from 'react';
import { FlowClient } from './client';

interface FlowPlaygroundProps {
  client: FlowClient;
  initialSource?: string;
}

export const FlowPlayground: React.FC<FlowPlaygroundProps> = ({ client, initialSource = 'FLOW "Example"\n\nSTEP hello =\n  OUTPUT "Hello" AS "greeting"\n\nEND FLOW' }) => {
  const [source, setSource] = useState(initialSource);
  const [ast, setAst] = useState<any>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [execution, setExecution] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    try {
      setError(null);
      const result = await client.parseFlow(source, { strict: true });
      setAst(result.ast);
      setWarnings(result.warnings || []);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handlePlan = async () => {
    try {
      setError(null);
      const result = await client.planFlow(source);
      setPlan(result);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleExecute = async () => {
    if (!plan?.id) return;
    try {
      setError(null);
      const result = await client.executeFlow(plan.id, {}, 'auto');
      setExecution(result);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 text-slate-100">
      <div className="space-y-4">
        <textarea
          className="w-full h-64 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm font-mono"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950" onClick={handleParse}>
            Parse
          </button>
          <button className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950" onClick={handlePlan}>
            Plan
          </button>
          <button className="px-4 py-2 rounded-xl bg-pink-500 text-slate-950" onClick={handleExecute} disabled={!plan?.id}>
            Execute
          </button>
        </div>
        {warnings.length > 0 && (
          <div className="text-sm text-amber-300">Warnings: {warnings.join(', ')}</div>
        )}
        {error && <div className="text-sm text-red-400">Error: {error}</div>}
      </div>
      <div className="space-y-4">
        {ast && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="text-lg font-semibold mb-2">AST</h3>
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(ast, null, 2)}</pre>
          </section>
        )}
        {plan && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="text-lg font-semibold mb-2">Plan</h3>
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(plan.graph, null, 2)}</pre>
          </section>
        )}
        {execution && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="text-lg font-semibold mb-2">Execution</h3>
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(execution, null, 2)}</pre>
          </section>
        )}
      </div>
    </div>
  );
};
