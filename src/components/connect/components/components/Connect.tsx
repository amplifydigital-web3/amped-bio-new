import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { ModalContext } from '../AppKitProvider';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useChainId, useConfig } from 'wagmi';
import { getWalletClient } from '@wagmi/core';
import useMemoizeValue from '../../../../hooks/useMemoizeValue';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

enum MessageType {
  RPC = 'rpc_request',
  RPC_RESPONSE = 'rpc_response',
  UPDATE = 'update',
}

type RpcRequestMessage = {
  id: number;
  type: MessageType.RPC;
  data: {
    method: string;
    params?: any[];
  }
}

type UpdateMessage = {
  id: number;
  type: MessageType.UPDATE;
  data: {
    event: 'accountsChanged' | 'chainChanged' | 'disconnect';
    data: any;
  }
}

export default function Web3ConnectButton() {
  const ctx = useContext(ModalContext);
  const wallet = useAppKit()
  const account = useAppKitAccount();
  const chain = useChainId();
  const config = useConfig();

  const rewardRef = useRef<HTMLIFrameElement | null>(null);

  const memoizedAccount = useMemoizeValue(account.address);
  const memoizedAccountConnected = useMemoizeValue(account.isConnected);
  const memoizedChain = useMemoizeValue(chain);

  if (!ctx) {
    throw new Error('AppKitContext is null');
  }
  const { setOpen } = ctx;

  useEffect(() => {
    if (memoizedAccountConnected[0] === true && memoizedAccountConnected[1] === false) {
      console.log('[onelink] disconnect');
      rewardRef.current?.contentWindow?.postMessage({
        id: 0, type: MessageType.UPDATE, data: {
          event: 'disconnect',
          data: null
        }
      } as UpdateMessage, '*');
    } else if (memoizedChain[0] !== undefined && memoizedChain[0] !== memoizedChain[1]) {
      console.log('[onelink] chainChanged');
      rewardRef.current?.contentWindow?.postMessage({
        id: 0, type: MessageType.UPDATE, data: {
          event: 'chainChanged',
          data: memoizedChain[1]
        }
      } as UpdateMessage, '*');
    } else if (memoizedAccount[0] !== memoizedAccount[1]) {
      console.log('[onelink] accountsChanged');
      rewardRef.current?.contentWindow?.postMessage({
        id: 0, type: MessageType.UPDATE, data: {
          event: 'accountsChanged',
          data: [memoizedAccount[1]]
        }
      } as UpdateMessage, '*');
    }
  }, [memoizedAccount, memoizedAccountConnected, memoizedChain]);

  const [rewardLastPong, setRewardLastPong] = useState<Date | null>(null);

  const isRewardConnected = useMemo((() => {
    return rewardLastPong ? new Date().getTime() - rewardLastPong.getTime() < 5000 : false;
  }), [rewardLastPong]);

  const handleClick = useCallback(() => {
    if (account.address) {
      wallet.open();
    } else {
      setOpen(true);
    }
  }, [account.address, wallet, setOpen]);

  useEffect(() => {
    console.log('[onelink] isRewardConnected', isRewardConnected);
  }, [isRewardConnected]);

  useEffect(() => {
    rewardRef.current = document.getElementById('iframe-npayme-reward') as HTMLIFrameElement | null;

    const sendPing = () => {
      if (rewardRef.current && rewardRef.current.contentWindow) {
        rewardRef.current.contentWindow.postMessage({ type: 'ping_onelink', address: account.address }, '*');
      }
    };

    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === 'pong_reward') {
        setRewardLastPong(new Date());
      } else if (event.data.type === 'open_modal') {
        handleClick();
      } else if (event.data.type === MessageType.RPC) {
        const data = event.data as RpcRequestMessage;

        const client = await getWalletClient(config);

        const res = await client?.request({
          method: event.data.data.method,
          params: event.data.data.params,
        });

        console.log('[onelink] RPC_RESPONSE', res);

        rewardRef.current?.contentWindow?.postMessage({
          id: data.id,
          type: MessageType.RPC_RESPONSE,
          data: res,
        }, '*');
      }
    };

    window.addEventListener('message', handleMessage);

    const intervalId = setInterval(sendPing, 1000);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('message', handleMessage);
    };
  }, [account.address, config, handleClick]);

  return (
    <DropdownMenuItem
      onClick={
        handleClick
      }
    >
      <span> {account.address
        ? `${account.address.substring(0, 4)}...${account.address.substring(
          account.address.length - 4
        )}`
        : 'Connect Web3 Wallet'}</span>
    </DropdownMenuItem>
  );
}
