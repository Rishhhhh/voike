import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';

type InfoResponse = {
  name?: string;
  description?: string;
  endpoints?: Record<string, string[]>;
};

type FlowParseResult = {
  warnings?: string[];
  ast?: unknown;
  errors?: string[];
};

type TaskSummary = {
  taskId: string;
  projectId: string;
  kind: string;
  priority: string;
  status: string;
  steps: Array<{ name: string; status: string }>;
};

export const Route = createFileRoute('/peacock')({
  component: PeacockRoute,
});

function PeacockRoute() {
  const [info, setInfo] = useState<InfoResponse | null>(null);
  const [taskData, setTaskData] = useState<TaskSummary[]>([]);
  const [flowSource, setFlowSource] = useState(exampleFlow);
  const [parseResult, setParseResult] = useState<FlowParseResult | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/info', { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setInfo(data))
      .catch((err) => setFlowError(err.message));
    fetch('/orchestrator/tasks')
      .then((res) => res.json())
      .then((data: TaskSummary[]) => setTaskData(data.slice(0, 5)))
      .catch((err) => setTaskError(err.message));
    return () => controller.abort();
  }, []);

  const handleParse = async () => {
    setFlowError(null);
    setParseResult(null);
    try {
      const response = await fetch('/flow/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: flowSource, options: { strict: true } }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const data = (await response.json()) as FlowParseResult;
      setParseResult(data);
    } catch (err) {
      setFlowError((err as Error).message);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-16">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-emerald-300/80">Peacock AIX</p>
          <h1 className="text-4xl font-semibold text-white">Build worlds on VOIKE</h1>
          <p className="text-sm text-slate-300">
            This route showcases Peacock&apos;s builder shell wired to VOIKE&apos;s APIs. Paste your FLOW plan, talk to AskAI, and let VOIKE ship the app.
          </p>
        </header>
        <div className="grid gap-6 md:grid-cols-2">
          <Card title="VOIKE Instance" description="Reads /info so the UI can surface live endpoints.">
            {flowError && <p className="text-sm text-rose-300">Failed to load info: {flowError}</p>}
            {info ? (
              <ul className="space-y-1 text-sm text-slate-200">
                <li className="font-semibold">{info.name || 'VOIKE Core'}</li>
                <li>{info.description || 'Kernel-aware backend'}</li>
              </ul>
            ) : (
              <p className="text-sm text-slate-400">Loading VOIKE metadata…</p>
            )}
          </Card>
          <Card title="Orchestrator Tasks" description="Live view of /orchestrator/tasks (latest 5).">
            {taskError && <p className="text-sm text-rose-300">Failed to load tasks: {taskError}</p>}
            {taskData.length ? (
              <ul className="space-y-1 text-sm text-slate-200">
                {taskData.map((task) => (
                  <li key={task.taskId} className="rounded-xl border border-slate-800/60 p-2">
                    <p className="text-emerald-300 text-xs uppercase">{task.kind}</p>
                    <p className="text-sm">
                      {task.status} · {task.priority}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No tasks yet.</p>
            )}
          </Card>
        </div>
        <section className="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">FLOW Playground</h2>
              <p className="text-sm text-slate-300">Calls `/flow/parse` with your FLOW text.</p>
            </div>
            <button
              className="rounded-2xl bg-emerald-400/90 px-4 py-2 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-500/20"
              onClick={handleParse}
            >
              Parse via VOIKE
            </button>
          </div>
          <textarea
            className="h-64 w-full rounded-3xl border border-slate-800 bg-slate-950 p-4 font-mono text-sm text-slate-100"
            value={flowSource}
            onChange={(event) => setFlowSource(event.target.value)}
          />
          {flowError && <p className="text-sm text-rose-300">{flowError}</p>}
          {parseResult && (
            <pre className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-200">
              {JSON.stringify(parseResult, null, 2)}
            </pre>
          )}
        </section>
      </section>
    </main>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-5 shadow-[0_20px_80px_rgba(15,23,42,0.35)]">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm text-slate-400">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

const exampleFlow = `FLOW "Peacock Build Website"

INPUTS
  text projectId
  text prompt
END INPUTS

STEP planner =
  RUN AGENT "planner" WITH projectId = projectId, brief = prompt

STEP codegen =
  RUN AGENT "codegen" WITH projectId = projectId, plan = planner, prompt = prompt

STEP bundle =
  RUN JOB "peacock-codegen-job"
    WITH prompt = prompt,
         context = { plan: planner, agentOutput: codegen }

STEP output =
  OUTPUT bundle AS "codegen bundle"

END FLOW`;
