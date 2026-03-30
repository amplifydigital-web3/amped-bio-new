export interface SocketBase {
  emit: (event: string, data: any) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler?: (...args: any[]) => void) => void;
  disconnect: () => void;
  id: string | undefined;
}

export interface SignRequest {
  data: any;
  message?: string;
  website_socket_id: string;
}

export interface SignResponse {
  signature: string;
  walletAddress: string;
  signedData: any;
}

export interface QrCodeData {
  website_socket_id: string | undefined;
  website_url: string;
  website_title: string;
  request: string;
  action: string;
}
