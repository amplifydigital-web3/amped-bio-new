import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import type { SocketBase } from "../types/socketTypes";

const SOCKET_URL = import.meta.env.VITE_NDAU_SOCKET_URL || import.meta.env.VITE_NDAU_API_URL || "";

interface NdauWalletContextType {
  walletAddress: string;
  validationKey: string;
  socket: SocketBase | null;
  isConnecting: boolean;
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
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    setIsConnecting(true);

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

    newSocket.on("connect_error", error => {
      setIsConnecting(false);
    });

    newSocket.on("disconnect", reason => {
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
