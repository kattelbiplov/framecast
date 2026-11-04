import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { InvokeArgs, InvokeChannel, InvokeChannels } from '../../shared/ipc.js';
import { createLogger } from '../lib/logger.js';
import { rendererOrigins } from '../windows/load.js';

const log = createLogger('ipc');

type Handler<C extends InvokeChannel> = (
  event: IpcMainInvokeEvent,
  ...args: InvokeArgs<C>
) => Awaited<ReturnType<InvokeChannels[C]>> | Promise<Awaited<ReturnType<InvokeChannels[C]>>>;

export type HandlerMap = { [C in InvokeChannel]: Handler<C> };

/** Surface only the message to the renderer; stacks stay in the main-process log. */
class IpcError extends Error {}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!rendererOrigins().some((o) => url.startsWith(o))) {
    throw new IpcError(`Rejected IPC from untrusted origin: ${url}`);
  }
}

/** Register every channel of the contract; the HandlerMap type guarantees full coverage. */
export function registerIpc(handlers: HandlerMap): void {
  for (const channel of Object.keys(handlers) as InvokeChannel[]) {
    const handler = handlers[channel] as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown;
    ipcMain.handle(channel, async (event, ...args) => {
      assertTrustedSender(event);
      try {
        return await handler(event, ...args);
      } catch (e) {
        log.error(`${channel} failed`, e);
        throw new IpcError(e instanceof Error ? e.message : String(e));
      }
    });
  }
}
