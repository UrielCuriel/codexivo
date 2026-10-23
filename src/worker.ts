/**
 * Worker del sandbox: `new Worker(new URL('codexivo/worker', import.meta.url), { type: 'module' })`. Recibe los
 * mensajes de `SandboxRequest` y responde con `SandboxResponse`; `createSandbox()` lo envuelve con promesas.
 */
import { SandboxHost } from './sandbox-host';
import type { SandboxRequest, SandboxResponse } from './sandbox-host';

declare const self: {
  postMessage(message: SandboxResponse): void;
  addEventListener(type: 'message', listener: (event: { data: SandboxRequest }) => void): void;
};

const host = new SandboxHost(message => self.postMessage(message));

// Los mensajes se atienden en orden, pero `pausar` tiene que poder llegar mientras una ejecución cede el control.
self.addEventListener('message', event => {
  void host.handle(event.data);
});
