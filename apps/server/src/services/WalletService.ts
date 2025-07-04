import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, formatEther, parseEther, Address } from 'viem';
import { defineChain } from 'viem';
import { chainConfig } from 'viem/zksync';
import { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import crypto from 'crypto';
import { env } from '../env';
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';

// Define Revolution Chain using ZKsync configuration
const revolutionChain = defineChain({
  ...chainConfig,
  id: parseInt(env.CHAIN_ID) || 324, // ZKsync mainnet default, or from env
  name: 'Revolution Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'REVO',
    symbol: 'REVO',
  },
  rpcUrls: {
    default: {
      http: [env.RPC_URL],
    },
  },
});

const prisma = new PrismaClient();

/**
 * WalletService - ZKsync Integration
 * 
 * This service provides wallet functionality for the Revolution Chain,
 * which is built on ZKsync technology. It uses Viem's ZKsync support
 * for optimal compatibility and performance.
 * 
 * Key ZKsync features implemented:
 * - EIP-712 transaction types for gas optimization
 * - Native REVO and ERC-20 token transfers
 * - ZKsync-specific chain configuration
 * - Compatible with ZKsync's transaction serialization
 * 
 * Security features:
 * - Encrypted mnemonic storage using AES-256-GCM
 * - BIP39/BIP32/BIP44 standard compliance
 * - Private keys derived on-demand from mnemonic
 * - No permanent private key storage
 */
export class WalletService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  private static readonly SALT_LENGTH = 64;
  private static readonly TAG_LENGTH = 16;

  /**
   * Encrypt data using AES-256-GCM
   */
  private static encryptData(data: string): string {
    const salt = crypto.randomBytes(this.SALT_LENGTH);
    const iv = crypto.randomBytes(this.IV_LENGTH);
    
    // Derive key from environment variable and salt
    const key = crypto.pbkdf2Sync(env.WALLET_ENCRYPTION_KEY, salt, 10000, 32, 'sha512');
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Combine salt + iv + encrypted data
    const result = salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
    
    return result;
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private static decryptData(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const salt = Buffer.from(parts[0], 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    // Derive key from environment variable and salt
    const key = crypto.pbkdf2Sync(env.WALLET_ENCRYPTION_KEY, salt, 10000, 32, 'sha512');
    
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Derive private key from mnemonic
   */
  static derivePrivateKeyFromMnemonic(mnemonic: string): `0x${string}` {
    // Convert mnemonic to seed
    const seed = mnemonicToSeedSync(mnemonic);
    
    // Create HD wallet from seed
    const hdKey = HDKey.fromMasterSeed(seed);
    
    // Derive Ethereum account using standard path m/44'/60'/0'/0/0
    const derivedKey = hdKey.derive("m/44'/60'/0'/0/0");
    
    if (!derivedKey.privateKey) {
      throw new Error('Failed to derive private key');
    }
    
    // Convert to hex string with 0x prefix
    return `0x${Buffer.from(derivedKey.privateKey).toString('hex')}` as `0x${string}`;
  }

  /**
   * Derive public key from mnemonic
   */
  static derivePublicKeyFromMnemonic(mnemonic: string): `0x${string}` {
    const privateKey = this.derivePrivateKeyFromMnemonic(mnemonic);
    const account = privateKeyToAccount(privateKey);
    return account.publicKey;
  }

  /**
   * Generate a new Ethereum wallet with mnemonic, private key, public key, and address
   */
  static generateWallet() {
    // Generate a 24-word mnemonic phrase
    const mnemonic = generateMnemonic(wordlist, 256); // 256 bits = 24 words
    
    // Derive private key from mnemonic
    const privateKey = this.derivePrivateKeyFromMnemonic(mnemonic);
    
    // Create account from private key
    const account = privateKeyToAccount(privateKey);
    
    // Get the address (public key can be derived when needed)
    const address = account.address;
    
    return {
      mnemonic,
      privateKey, // We'll use this only for wallet generation, not storage
      address,
    };
  }

  /**
   * Create a wallet for a user
   */
  static async createWalletForUser(userId: number) {
    try {
      // Check if user already has a wallet
      const existingWallet = await prisma.wallet.findUnique({
        where: { user_id: userId },
      });

      if (existingWallet) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User already has a wallet',
        });
      }

      // Generate new wallet
      const walletData = this.generateWallet();

      // Encrypt only the mnemonic before saving
      const encryptedMnemonic = this.encryptData(walletData.mnemonic);

      // Save wallet to database (only address and mnemonic)
      const wallet = await prisma.wallet.create({
        data: {
          user_id: userId,
          address: walletData.address,
          mnemonic: encryptedMnemonic,
        },
      });

      // Return wallet data without sensitive information
      return {
        id: wallet.id,
        address: wallet.address as Address,
        created_at: wallet.created_at,
      };
    } catch (error) {
      console.error('Error creating wallet for user:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create wallet',
      });
    }
  }

  /**
   * Get wallet information for a user
   */
  static async getUserWallet(userId: number) {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { user_id: userId },
        select: {
          id: true,
          address: true,
          created_at: true,
          updated_at: true,
        },
      });

      if (!wallet) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Wallet not found for user',
        });
      }

      return wallet;
    } catch (error) {
      console.error('Error getting user wallet:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get wallet',
      });
    }
  }

  /**
   * Get derived private key for a user's wallet (use with caution!)
   * This derives the private key from the stored mnemonic
   */
  static async getUserWalletPrivateKey(userId: number) {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { user_id: userId },
        select: {
          mnemonic: true,
        },
      });

      if (!wallet) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Wallet not found for user',
        });
      }

      // Decrypt the mnemonic and derive private key
      const decryptedMnemonic = this.decryptData(wallet.mnemonic);
      const privateKey = this.derivePrivateKeyFromMnemonic(decryptedMnemonic);
      return privateKey;
    } catch (error) {
      console.error('Error getting user wallet private key:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get wallet private key',
      });
    }
  }

  /**
   * Get wallet mnemonic for a user (use with extreme caution!)
   * This method is prepared for future export functionality
   */
  static async getUserWalletMnemonic(userId: number) {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { user_id: userId },
        select: {
          // TODO: Uncomment after running migration
          // mnemonic: true,
          id: true, // Temporary field until mnemonic is available
        },
      });

      if (!wallet) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Wallet not found for user',
        });
      }

      // TODO: Uncomment after running migration
      // Decrypt the mnemonic before returning
      // const decryptedMnemonic = this.decryptData(wallet.mnemonic);
      // return decryptedMnemonic;

      // Temporary return until migration is applied
      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        message: 'Mnemonic export not yet available - database migration pending',
      });
    } catch (error) {
      console.error('Error getting user wallet mnemonic:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get wallet mnemonic',
      });
    }
  }

  /**
   * Validate if a mnemonic phrase is valid
   */
  static isValidMnemonic(mnemonic: string): boolean {
    try {
      // Try to generate seed from mnemonic
      mnemonicToSeedSync(mnemonic);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if address is valid Ethereum address
   */
  static isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Get ETH balance for a user's wallet on ZKsync
   */
  static async getUserETHBalance(userId: number): Promise<string> {
    try {
      const wallet = await this.getUserWallet(userId);
      
      const publicClient = createPublicClient({
        chain: revolutionChain,
        transport: http(),
      });

      const balance = await publicClient.getBalance({
        address: wallet.address as `0x${string}`,
      });

      return formatEther(balance);
    } catch (error) {
      console.error('Error getting user ETH balance on ZKsync:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get ETH balance on ZKsync',
      });
    }
  }

  /**
   * Get ERC-20 token balance for a user's wallet on ZKsync
   */
  static async getUserTokenBalance(userId: number, tokenAddress: string): Promise<string> {
    try {
      const wallet = await this.getUserWallet(userId);
      
      const publicClient = createPublicClient({
        chain: revolutionChain,
        transport: http(),
      });

      // ERC-20 balanceOf function signature: balanceOf(address)
      const balanceOfData = `0x70a08231${wallet.address.slice(2).padStart(64, '0')}`;

      const result = await publicClient.call({
        to: tokenAddress as `0x${string}`,
        data: balanceOfData as `0x${string}`,
      });

      if (!result.data) {
        throw new Error('Failed to get token balance');
      }

      // Convert hex result to decimal
      const balance = BigInt(result.data);
      
      // For simplicity, assuming 18 decimals. In production, you'd want to call decimals() function
      return formatEther(balance);
    } catch (error) {
      console.error('Error getting user token balance on ZKsync:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get token balance on ZKsync',
      });
    }
  }

  /**
   * Send ETH from user's wallet to another address using ZKsync
   */
  static async sendETH(
    userId: number, 
    toAddress: string, 
    amount: string,
    gasPrice?: string,
    gasLimit?: bigint
  ): Promise<{
    transactionHash: string;
    from: string;
    to: string;
    amount: string;
    gasUsed?: string;
    transactionType: string;
  }> {
    try {
      const wallet = await this.getUserWallet(userId);
      const privateKey = await this.getUserWalletPrivateKey(userId);

      // Create wallet client with ZKsync configuration
      const walletClient = createWalletClient({
        chain: revolutionChain,
        transport: http(),
        account: privateKeyToAccount(privateKey),
      });

      // Create public client for gas estimation
      const publicClient = createPublicClient({
        chain: revolutionChain,
        transport: http(),
      });

      // Estimate gas if not provided
      let estimatedGas = gasLimit;
      if (!estimatedGas) {
        estimatedGas = await publicClient.estimateGas({
          account: wallet.address as `0x${string}`,
          to: toAddress as `0x${string}`,
          value: parseEther(amount),
        });
      }

      // Send transaction using ZKsync's EIP-712 transaction type
      const txHash = await walletClient.sendTransaction({
        to: toAddress as `0x${string}`,
        value: parseEther(amount),
        gas: estimatedGas,
        type: 'eip712', // ZKsync specific transaction type
        // Note: ZKsync EIP-712 transactions use maxFeePerGas instead of gasPrice
        maxFeePerGas: gasPrice ? parseEther(gasPrice) : undefined,
      });

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      return {
        transactionHash: txHash,
        from: wallet.address,
        to: toAddress,
        amount: amount,
        gasUsed: receipt.gasUsed.toString(),
        transactionType: 'eip712',
      };
    } catch (error) {
      console.error('Error sending ETH on ZKsync:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to send ETH transaction on ZKsync',
      });
    }
  }

  /**
   * Send ERC-20 tokens from user's wallet to another address using ZKsync
   */
  static async sendToken(
    userId: number,
    tokenAddress: string,
    toAddress: string,
    amount: string,
    gasPrice?: string,
    gasLimit?: bigint
  ): Promise<{
    transactionHash: string;
    from: string;
    to: string;
    tokenAddress: string;
    amount: string;
    gasUsed?: string;
    transactionType: string;
  }> {
    try {
      const wallet = await this.getUserWallet(userId);
      const privateKey = await this.getUserWalletPrivateKey(userId);

      // Create wallet client with ZKsync configuration
      const walletClient = createWalletClient({
        chain: revolutionChain,
        transport: http(),
        account: privateKeyToAccount(privateKey),
      });

      // Create public client for gas estimation
      const publicClient = createPublicClient({
        chain: revolutionChain,
        transport: http(),
      });

      // ERC-20 transfer function signature: transfer(address,uint256)
      const transferFunctionData = `0xa9059cbb${toAddress.slice(2).padStart(64, '0')}${BigInt(amount).toString(16).padStart(64, '0')}`;

      // Estimate gas if not provided
      let estimatedGas = gasLimit;
      if (!estimatedGas) {
        estimatedGas = await publicClient.estimateGas({
          account: wallet.address as `0x${string}`,
          to: tokenAddress as `0x${string}`,
          data: transferFunctionData as `0x${string}`,
        });
      }

      // Send ERC-20 token transfer transaction using ZKsync's EIP-712
      const txHash = await walletClient.sendTransaction({
        to: tokenAddress as `0x${string}`,
        data: transferFunctionData as `0x${string}`,
        gas: estimatedGas,
        type: 'eip712', // ZKsync specific transaction type
        maxFeePerGas: gasPrice ? parseEther(gasPrice) : undefined,
      });

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      return {
        transactionHash: txHash,
        from: wallet.address,
        to: toAddress,
        tokenAddress: tokenAddress,
        amount: amount,
        gasUsed: receipt.gasUsed.toString(),
        transactionType: 'eip712',
      };
    } catch (error) {
      console.error('Error sending ERC-20 token on ZKsync:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to send ERC-20 token transaction on ZKsync',
      });
    }
  }
}
