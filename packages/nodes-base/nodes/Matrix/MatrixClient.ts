import type { IDataObject } from 'n8n-workflow';
import { OperationalError } from 'n8n-workflow';
import type {
	ClientEvent,
	MatrixClient as SDKMatrixClient,
	Room,
	MatrixEvent,
	ICreateClientOpts,
} from 'matrix-js-sdk';
import * as sdk from 'matrix-js-sdk';

interface MatrixCredentials {
	accessToken: string;
	homeserverUrl: string;
	userId?: string;
	deviceId?: string;
}

/**
 * Wrapper class for matrix-js-sdk that handles encryption and client lifecycle.
 * Provides transparent encryption/decryption for Matrix rooms with E2EE enabled.
 */
export class MatrixClientWrapper {
	private client: SDKMatrixClient | null = null;
	private isInitialized = false;
	private syncPromise: Promise<void> | null = null;

	/**
	 * Initialize the Matrix client with credentials
	 */
	async initialize(credentials: MatrixCredentials): Promise<void> {
		if (this.isInitialized && this.client) {
			return;
		}

		try {
			const clientOpts: ICreateClientOpts = {
				baseUrl: credentials.homeserverUrl,
				accessToken: credentials.accessToken,
				userId: credentials.userId,
				deviceId: credentials.deviceId || undefined,
			};

			this.client = sdk.createClient(clientOpts);

			// Initialize Rust crypto for E2EE support (modern matrix-js-sdk approach)
			// Uses in-memory store since we're not in a browser environment
			if (this.client.initRustCrypto && typeof this.client.initRustCrypto === 'function') {
				try {
					await this.client.initRustCrypto({
						useIndexedDB: false, // Use in-memory store for Node.js environment
					});
				} catch (cryptoError) {
					// Crypto initialization might fail if not properly configured, continue anyway
					console.warn('Failed to initialize Rust crypto:', cryptoError);
				}
			}

			// Start sync to get room keys and decrypt messages
			await this.startSync();

			this.isInitialized = true;
		} catch (error) {
			throw new OperationalError(
				`Failed to initialize Matrix client: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Start client sync and wait for initial sync to complete
	 */
	private async startSync(): Promise<void> {
		if (!this.client) {
			throw new OperationalError('Matrix client not initialized');
		}

		if (this.syncPromise) {
			return this.syncPromise;
		}

		this.syncPromise = new Promise((resolve, reject) => {
			if (!this.client) {
				reject(new OperationalError('Matrix client not initialized'));
				return;
			}

			const timeout = setTimeout(() => {
				reject(new OperationalError('Matrix client sync timeout after 30 seconds'));
			}, 30000);

			this.client.once(ClientEvent.Sync, (state: string) => {
				clearTimeout(timeout);
				if (state === 'PREPARED' || state === 'SYNCING') {
					resolve();
				} else {
					reject(new OperationalError(`Matrix sync failed with state: ${state}`));
				}
			});

			// Start the client
			this.client.startClient({ initialSyncLimit: 1 });
		});

		await this.syncPromise;
	}

	/**
	 * Get a room by ID
	 */
	getRoom(roomId: string): Room | null {
		if (!this.client) {
			throw new OperationalError('Matrix client not initialized');
		}
		return this.client.getRoom(roomId);
	}

	/**
	 * Get messages from a room with automatic decryption
	 */
	async getRoomMessages(
		roomId: string,
		limit: number = 100,
		from?: string,
	): Promise<{ messages: IDataObject[]; end?: string; start?: string }> {
		if (!this.client) {
			throw new OperationalError('Matrix client not initialized');
		}

		try {
			// Use the low-level HTTP API through the client to get messages
			// This is more reliable than using higher-level methods that might not be consistent across versions
			const queryParams: any = {
				dir: 'b',
				limit,
			};
			
			if (from) {
				queryParams.from = from;
			}

			// @ts-ignore - Using internal HTTP client for reliability
			const response = await this.client.http.authedRequest(
				undefined,
				'GET',
				`/rooms/${encodeURIComponent(roomId)}/messages`,
				queryParams,
			);

			// Process and decrypt messages if needed
			const messages: IDataObject[] = [];
			
			const events = response?.chunk || [];
			
			for (const event of events) {
				// Create a MatrixEvent from the event data
				const matrixEvent = new sdk.MatrixEvent(event as any);

				// Check if event is encrypted and try to decrypt
				if (matrixEvent.isEncrypted()) {
					try {
						// Try to decrypt using the Rust crypto module via getCrypto()
						const crypto = this.client.getCrypto && this.client.getCrypto();
						if (crypto && typeof (crypto as any).decryptEvent === 'function') {
							await (crypto as any).decryptEvent(matrixEvent);
						}
					} catch (decryptError) {
						// If decryption fails, include the encrypted event with an error marker
						messages.push({
							...(event as any),
							decryption_error: (decryptError as Error).message,
						});
						continue;
					}
				}

				// Return the decrypted or plain content
				messages.push({
					...(event as any),
					content: matrixEvent.getContent(),
					decrypted: matrixEvent.isEncrypted(),
				});
			}

			return {
				messages,
				end: response?.end,
				start: response?.start,
			};
		} catch (error) {
			throw new OperationalError(
				`Failed to get room messages: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Send a message to a room with automatic encryption if needed
	 */
	async sendMessage(roomId: string, content: IDataObject): Promise<IDataObject> {
		if (!this.client) {
			throw new OperationalError('Matrix client not initialized');
		}

		try {
			// Check if room exists
			const room = this.client.getRoom(roomId);
			if (!room) {
				// Room might not be in the client's cache yet, try to send anyway
				console.warn(`Room ${roomId} not found in cache, attempting to send message anyway`);
			}

			// Send message using sendEvent - SDK will automatically encrypt if the room requires it
			// Use m.room.message event type
			const response = await this.client.sendEvent(
				roomId,
				'm.room.message' as any,
				content,
			);
			
			return response as unknown as IDataObject;
		} catch (error) {
			throw new OperationalError(`Failed to send message: ${(error as Error).message}`);
		}
	}

	/**
	 * Get a specific event from a room with automatic decryption
	 */
	async getEvent(roomId: string, eventId: string): Promise<IDataObject> {
		if (!this.client) {
			throw new OperationalError('Matrix client not initialized');
		}

		try {
			// Use the low-level HTTP API through the client
			// @ts-ignore - Using internal HTTP client for reliability
			const event = await this.client.http.authedRequest(
				undefined,
				'GET',
				`/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}`,
			);

			const matrixEvent = new sdk.MatrixEvent(event as any);

			// Check if event is encrypted and try to decrypt
			if (matrixEvent.isEncrypted()) {
				try {
					// Try to decrypt using the Rust crypto module via getCrypto()
					const crypto = this.client.getCrypto && this.client.getCrypto();
					if (crypto && typeof (crypto as any).decryptEvent === 'function') {
						await (crypto as any).decryptEvent(matrixEvent);
					}
				} catch (decryptError) {
					return {
						...(event as any),
						decryption_error: (decryptError as Error).message,
					};
				}
			}

			return {
				...(event as any),
				content: matrixEvent.getContent(),
				decrypted: matrixEvent.isEncrypted(),
			};
		} catch (error) {
			throw new OperationalError(`Failed to get event: ${(error as Error).message}`);
		}
	}

	/**
	 * Stop the client and cleanup
	 */
	async stop(): Promise<void> {
		if (this.client) {
			try {
				this.client.stopClient();
				await this.client.clearStores();
			} catch (error) {
				// Ignore cleanup errors
			}
			this.client = null;
			this.isInitialized = false;
			this.syncPromise = null;
		}
	}

	/**
	 * Check if encryption is supported/enabled
	 */
	isEncryptionEnabled(): boolean {
		return this.client?.getCrypto !== undefined && this.client.getCrypto() !== undefined;
	}
}
