import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import type { SocketBase } from "../types/socketTypes";

const SOCKET_URL = import.meta.env.VITE_NDAU_SOCKET_URL || "";

interface NdauWalletContextType {
  walletAddress: string;
  socket: SocketBase | null;
  isConnecting: boolean;
  connect: () => void;
  disconnect: () => void;
  updateWalletAddress: (address: string) => void;
}

const NdauWalletContext = createContext<NdauWalletContextType>({
  walletAddress: "",
  socket: null,
  isConnecting: false,
  connect: () => {},
  disconnect: () => {},
  updateWalletAddress: () => {},
});

export function NdauWalletProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddress] = useState("");
  const [socket, setSocket] = useState<SocketBase | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    setIsConnecting(true);

    const newSocket = io(SOCKET_URL);
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
      ({ walletAddress: _walletAddress }: { walletAddress: string }) => {
        setWalletAddress(_walletAddress);
        setIsConnecting(false);
      }
    );

    newSocket.on("connect_error", () => {
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
    setIsConnecting(false);
  }, []);

  const updateWalletAddress = useCallback((address: string) => {
    setWalletAddress(address);
  }, []);

  return (
    <NdauWalletContext.Provider
      value={{
        walletAddress,
        socket,
        isConnecting,
        connect,
        disconnect,
        updateWalletAddress,
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
