import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from 'viem/accounts';
import { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import crypto from 'crypto';
import { env } from '../env';

const prisma = new PrismaClient();

export class WalletService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  private static readonly SALT_LENGTH = 64;
  private static readonly TAG_LENGTH = 16;

  /**
   * Encrypt a private key using AES-256-GCM
   */
  private static encryptPrivateKey(privateKey: string): string {
    const salt = crypto.randomBytes(this.SALT_LENGTH);
    const iv = crypto.randomBytes(this.IV_LENGTH);
    
    // Derive key from environment variable and salt
    const key = crypto.pbkdf2Sync(env.WALLET_ENCRYPTION_KEY, salt, 10000, 32, 'sha512');
    
    const cipher = crypto.createCipher('aes-256-cbc', key);
    
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Combine salt + iv + encrypted data
    const result = salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
    
    return result;
  }

  /**
   * Decrypt a private key using AES-256-GCM
   */
  private static decryptPrivateKey(encryptedData: string): string {
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
   * Generate a new Ethereum wallet with private key, public key, and address
   */
  static generateWallet() {
    // Generate a random private key
    const privateKey = generatePrivateKey();
    
    // Create account from private key
    const account = privateKeyToAccount(privateKey);
    
    // Get the public key and address
    const address = account.address;
    const publicKey = account.publicKey;
    
    return {
      privateKey,
      publicKey,
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

      // Encrypt the private key before saving
      const encryptedPrivateKey = this.encryptPrivateKey(walletData.privateKey);

      // Save wallet to database
      const wallet = await prisma.wallet.create({
        data: {
          user_id: userId,
          address: walletData.address,
          public_key: walletData.publicKey,
          private_key: encryptedPrivateKey,
        },
      });

      // Return wallet data without private key for security
      return {
        id: wallet.id,
        address: wallet.address,
        public_key: wallet.public_key,
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
          public_key: true,
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
   * Get wallet private key for a user (use with caution!)
   */
  static async getUserWalletPrivateKey(userId: number) {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { user_id: userId },
        select: {
          private_key: true,
        },
      });

      if (!wallet) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Wallet not found for user',
        });
      }

      // Decrypt the private key before returning
      const decryptedPrivateKey = this.decryptPrivateKey(wallet.private_key);

      return decryptedPrivateKey;
    } catch (error) {
      console.error('Error getting user wallet private key:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get wallet private key',
      });
    }
  }

  /**
   * Check if address is valid Ethereum address
   */
  static isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
}
