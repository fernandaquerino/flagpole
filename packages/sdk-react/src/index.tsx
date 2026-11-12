'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  FlagpoleClient,
  type ClientOptions,
  type Snapshot,
} from '@flagpole/sdk-js';
import type { FlagValue } from '@flagpole/shared';
const empty: Snapshot = { flags: {}, loaded: false, error: null };
const State = createContext<Snapshot>(empty);
export function FlagpoleProvider({
  children,
  ...options
}: ClientOptions & { children: ReactNode }) {
  const {
    apiUrl,
    clientKey,
    pollInterval,
    requestTimeout,
    fetch: fetcher,
  } = options;
  const initialJson = JSON.stringify(options.initialFlags);
  const client = useMemo(
    () =>
      new FlagpoleClient({
        apiUrl,
        clientKey,
        pollInterval,
        requestTimeout,
        fetch: fetcher,
        context: options.context,
        initialFlags: initialJson ? JSON.parse(initialJson) : undefined,
      }),
    [apiUrl, clientKey, pollInterval, requestTimeout, fetcher, initialJson],
  );
  const contextJson = JSON.stringify(options.context);
  useEffect(() => {
    client.setContext(JSON.parse(contextJson));
  }, [client, contextJson]);
  useEffect(() => {
    client.start();
    return () => client.stop();
  }, [client]);
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getServerSnapshot,
  );
  return <State.Provider value={snapshot}>{children}</State.Provider>;
}
export function useFlags() {
  return useContext(State).flags;
}
export function useFlagpoleStatus() {
  const { loaded, error } = useContext(State);
  return { loaded, error };
}
export function useFlag(key: string, defaultValue: boolean): boolean;
export function useFlag(key: string, defaultValue: string): string;
export function useFlag(key: string, defaultValue: FlagValue): FlagValue {
  const value = useFlags()[key];
  return typeof value === typeof defaultValue ? value! : defaultValue;
}
