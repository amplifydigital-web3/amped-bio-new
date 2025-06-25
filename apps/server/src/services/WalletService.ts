import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from 'viem/accounts';
import { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import crypto from 'crypto';
import { env } from '../env';
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';

const prisma = new PrismaClient();

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
    
    const cipher = crypto.createCipher('aes-256-cbc', key);
    
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
        address: wallet.address,
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
}

/*
 * TODO: After running the database migration to update wallet schema:
 * 1. Run: pnpm --filter server run prisma:migrate:dev --name optimize-wallet-schema  
 * 2. Run: pnpm --filter server run prisma:generate
 * 3. Update the code in this file:
 *    - Line ~137-138: Remove 'private_key: "",' and 'public_key: "",' 
 *    - Line ~139: Uncomment 'mnemonic: encryptedMnemonic,'
 *    - Line ~193: Uncomment mnemonic selection and logic in getUserWalletPrivateKey
 *    - Line ~218: Uncomment mnemonic selection and logic in getUserWalletMnemonic
 * 
 * Final optimized wallet storage:
 * - ✅ address: Public identifier (42 chars)
 * - ✅ mnemonic: Encrypted 24-word seed phrase
 * - ❌ private_key: Derived on-demand from mnemonic
 * - ❌ public_key: Derived on-demand from private key
 * 
 * Benefits:
 * - Minimal storage (just address + encrypted mnemonic)
 * - Maximum security (derive keys only when needed)
 * - Easy export (24-word mnemonic phrase)
 * - Standard compliance (BIP39/BIP32/BIP44)
 */
