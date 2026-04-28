import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import type { SocketBase } from "../types/socketTypes";

const SOCKET_URL = import.meta.env.VITE_NDAU_SOCKET_URL || import.meta.env.VITE_NDAU_API_URL || "";

interface NdauWalletContextType {
  walletAddress: string;
  validationKey: string;
  socket: SocketBase | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  updateWalletAddress: (address: string) => void;
  updateValidationKey: (key: string) => void;
}

const NdauWalletContext = createContext<NdauWalletContextType>({
  walletAddress: "",
  validationKey: "",
  socket: null,
  isConnecting: false,
  error: null,
  connect: () => {},
  disconnect: () => {},
  updateWalletAddress: () => {},
  updateValidationKey: () => {},
});

export function NdauWalletProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddress] = useState("");
  const [validationKey, setValidationKey] = useState("");
  const [socket, setSocket] = useState<SocketBase | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    setIsConnecting(true);
    setError(null);

    const newSocket = io(SOCKET_URL, {
      transports: ["polling", "websocket"],
      reconnection: true,
      forceNew: true,
    });
    socketRef.current = newSocket;

    newSocket.on("connect", () => {
      const socketBase: SocketBase = {
        emit: (event: string, data: any) => newSocket.emit(event, data),
        on: (event: string, handler: (...args: any[]) => void) => newSocket.on(event, handler),
        off: (event: string, handler?: (...args: any[]) => void) =>
          handler ? newSocket.off(event, handler) : newSocket.off(event),
        disconnect: () => newSocket.disconnect(),
        id: newSocket.id,
      };

      setSocket(socketBase);

      newSocket.emit("website-ndau_connection-established-server", {
        is_login_successful: true,
        website_socket_id: newSocket.id,
      });
    });

    newSocket.on(
      "server-ndau_connection-established-website",
      (data: { walletAddress: string; validationKey?: string }) => {
        setWalletAddress(data.walletAddress);
        if (data.validationKey) {
          setValidationKey(data.validationKey);
        }
        setIsConnecting(false);
      }
    );

    newSocket.on("connect_error", err => {
      setIsConnecting(false);
      setError(err.message);
    });

    newSocket.on("disconnect", () => {
      setSocket(null);
      setWalletAddress("");
      setValidationKey("");
      setIsConnecting(false);
    });
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setSocket(null);
    setWalletAddress("");
    setValidationKey("");
    setIsConnecting(false);
    setError(null);
  }, []);

  const updateWalletAddress = useCallback((address: string) => {
    setWalletAddress(address);
  }, []);

  const updateValidationKey = useCallback((key: string) => {
    setValidationKey(key);
  }, []);

  return (
    <NdauWalletContext.Provider
      value={{
        walletAddress,
        validationKey,
        socket,
        isConnecting,
        error,
        connect,
        disconnect,
        updateWalletAddress,
        updateValidationKey,
      }}
    >
      {children}
    </NdauWalletContext.Provider>
  );
}

export function useNdauWallet() {
  const context = useContext(NdauWalletContext);
  if (!context) {
    throw new Error("useNdauWallet must be used within a NdauWalletProvider");
  }
  return context;
}
