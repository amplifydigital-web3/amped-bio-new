import {
  ANALYTICS_INTEGRATION_TYPE,
  type CONNECTED_EVENT_DATA,
  CONNECTOR_EVENTS,
  CONNECTOR_STATUS,
  type CONNECTOR_STATUS_TYPE,
  type IProvider,
  WalletInitializationError,
} from "@web3auth/no-modal";
import {
  createContext,
  createElement,
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Web3Auth } from "../../modalManager";
import { IWeb3AuthInnerContext, Web3AuthProviderProps } from "../interfaces";

export const Web3AuthInnerContext = createContext<IWeb3AuthInnerContext>(null);

export function Web3AuthInnerProvider(params: PropsWithChildren<Web3AuthProviderProps>) {
  const { children, config, initialState } = params;
  const { web3AuthOptions } = config;

  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [initError, setInitError] = useState<Error | null>(null);
  const [provider, setProvider] = useState<IProvider | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isMFAEnabled, setIsMFAEnabled] = useState<boolean>(false);

  const web3Auth = useMemo(() => {
    setProvider(null);

    return new Web3Auth(web3AuthOptions, initialState);
  }, [web3AuthOptions, initialState]);

  const [isConnected, setIsConnected] = useState<boolean>(
    web3Auth.status === CONNECTOR_STATUS.CONNECTED
  );
  const [status, setStatus] = useState<CONNECTOR_STATUS_TYPE | null>(web3Auth.status);

  const getPlugin = useCallback(
    (name: string) => {
      if (!web3Auth) throw WalletInitializationError.notReady();
      return web3Auth.getPlugin(name);
    },
    [web3Auth]
  );

  useEffect(() => {
    const controller = new AbortController();
    async function init() {
      try {
        setInitError(null);
        setIsInitializing(true);
        web3Auth.setAnalyticsProperties({
          integration_type: ANALYTICS_INTEGRATION_TYPE.REACT_HOOKS,
        });
        await web3Auth.init({ signal: controller.signal });
      } catch (error) {
        setInitError(error as Error);
      } finally {
        setIsInitializing(false);
      }
    }

    if (web3Auth) {
      console.info("Initializing Web3Auth with options:", web3AuthOptions);
      init()
        .then(() => {
          console.info("Web3Auth initialized successfully");
        })
        .catch(error => {
          console.error("Web3Auth initialization failed:", error);
        });
    }

    return () => {
      controller.abort();
    };
  }, [web3Auth, config]);

  useEffect(() => {
    const notReadyListener = () => setStatus(web3Auth.status);
    const readyListener = () => {
      setStatus(web3Auth.status);
      setIsInitialized(true);
    };
    const connectedListener = (data: CONNECTED_EVENT_DATA) => {
      setStatus(web3Auth.status);
      // we do this because of rehydration issues. status connected is fired first but web3auth sdk is not ready yet.
      if (web3Auth.status === CONNECTOR_STATUS.CONNECTED) {
        setIsInitialized(true);
        setIsConnected(true);
        setProvider(data.provider);
      }
    };
    const disconnectedListener = () => {
      setStatus(web3Auth.status);
      setIsConnected(false);
      setProvider(null);
    };
    const connectingListener = () => {
      setStatus(web3Auth.status);
    };
    const errorListener = () => {
      setStatus(web3Auth.status);
    };

    const rehydrationErrorListener = () => {
      setStatus(web3Auth.status);
      setIsConnected(false);
      setProvider(null);
    };

    const mfaEnabledListener = (isMFAEnabled: boolean) => {
      if (typeof isMFAEnabled === "boolean") setIsMFAEnabled(isMFAEnabled);
    };

    if (web3Auth) {
      // web3Auth is initialized here.
      setStatus(web3Auth.status);
      web3Auth.on(CONNECTOR_EVENTS.NOT_READY, notReadyListener);
      web3Auth.on(CONNECTOR_EVENTS.READY, readyListener);
      web3Auth.on(CONNECTOR_EVENTS.CONNECTED, connectedListener);
      web3Auth.on(CONNECTOR_EVENTS.DISCONNECTED, disconnectedListener);
      web3Auth.on(CONNECTOR_EVENTS.CONNECTING, connectingListener);
      web3Auth.on(CONNECTOR_EVENTS.ERRORED, errorListener);
      web3Auth.on(CONNECTOR_EVENTS.REHYDRATION_ERROR, rehydrationErrorListener);
      web3Auth.on(CONNECTOR_EVENTS.MFA_ENABLED, mfaEnabledListener);
    }

    return () => {
      if (web3Auth) {
        web3Auth.off(CONNECTOR_EVENTS.NOT_READY, notReadyListener);
        web3Auth.off(CONNECTOR_EVENTS.READY, readyListener);
        web3Auth.off(CONNECTOR_EVENTS.CONNECTED, connectedListener);
        web3Auth.off(CONNECTOR_EVENTS.DISCONNECTED, disconnectedListener);
        web3Auth.off(CONNECTOR_EVENTS.CONNECTING, connectingListener);
        web3Auth.off(CONNECTOR_EVENTS.ERRORED, errorListener);
        web3Auth.off(CONNECTOR_EVENTS.REHYDRATION_ERROR, rehydrationErrorListener);
        web3Auth.off(CONNECTOR_EVENTS.MFA_ENABLED, mfaEnabledListener);

        web3Auth.cleanup();
      }
    };
  }, [web3Auth]);

  const value = useMemo(() => {
    return {
      web3Auth,
      isConnected,
      isInitialized,
      provider,
      status,
      isInitializing,
      initError,
      isMFAEnabled,
      getPlugin,
      setIsMFAEnabled,
    };
  }, [
    web3Auth,
    isConnected,
    isMFAEnabled,
    setIsMFAEnabled,
    isInitialized,
    provider,
    status,
    getPlugin,
    isInitializing,
    initError,
  ]);

  return createElement(Web3AuthInnerContext.Provider, { value }, children);
}
