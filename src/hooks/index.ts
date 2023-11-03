import { EventEmitter } from 'events';

import {
  getHookInContext,
  getTransactionalContext,
  getTransactionalOptions,
  setHookInContext,
} from '../common';
import { StorageDriver } from '../storage/driver/interface';
import { Fail } from '../utils/result';

export const getTransactionalContextHook = () => {
  const context = getTransactionalContext();

  const emitter = getHookInContext(context);
  if (!emitter) {
    throw new Error('No hook manager found in context. Are you using @Transactional()?');
  }

  return emitter;
};

export const runAndTriggerHooks = async (hook: EventEmitter, cb: () => unknown) => {
  try {
    const result = await Promise.resolve(cb());
    if (result instanceof Fail) {
      throw result;
    }

    setImmediate(() => {
      hook.emit('commit');
      hook.emit('end', undefined);
      hook.removeAllListeners();
    });

    return result;
  } catch (err) {
    setImmediate(() => {
      hook.emit('rollback', err);
      hook.emit('end', err);
      hook.removeAllListeners();
    });

    if (err instanceof Fail) {
      return err;
    }

    throw err;
  }
};

export const createEventEmitterInNewContext = (context: StorageDriver) => {
  const options = getTransactionalOptions();

  const emitter = new EventEmitter();
  emitter.setMaxListeners(options.maxHookHandlers);
  return emitter;
};

export const runInNewHookContext = async (context: StorageDriver, cb: () => unknown) => {
  const hook = createEventEmitterInNewContext(context);

  return await context.run(() => {
    setHookInContext(context, hook);

    return runAndTriggerHooks(hook, cb);
  });
};

export const runOnTransactionCommit = (cb: () => void) => {
  getTransactionalContextHook().once('commit', cb);
};

export const runOnTransactionRollback = (cb: (e: Error) => void) => {
  getTransactionalContextHook().once('rollback', cb);
};

export const runOnTransactionComplete = (cb: (e: Error | undefined) => void) => {
  getTransactionalContextHook().once('end', cb);
};
