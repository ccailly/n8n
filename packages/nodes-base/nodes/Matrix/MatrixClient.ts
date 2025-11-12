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
 * Wrapper class for matrix-js-sdk that handles encryption and client lifecycle
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
				// Use memory crypto store for now - can be enhanced later to use persistent storage
				cryptoStore: undefined,
			};

			this.client = sdk.createClient(clientOpts);

			// Initialize crypto if available
			if (this.client.crypto) {
				await this.client.initCrypto();
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
	): Promise<IDataObject[]> {
		if (!this.client) {
			throw new OperationalError('Matrix client not initialized');
		}

		const room = this.client.getRoom(roomId);
		if (!room) {
			throw new OperationalError(`Room ${roomId} not found`);
		}

		try {
			// Get messages using the client's scrollback method
			const response = await this.client.createMessagesRequest(roomId, from || '', limit, 'b');

			// Process and decrypt messages if needed
			const messages: IDataObject[] = [];
			for (const event of response.chunk || []) {
				// Create a MatrixEvent from the event data
				const matrixEvent = new sdk.MatrixEvent(event as any);

				// Decrypt if encrypted
				if (matrixEvent.isEncrypted()) {
					try {
						await this.client.decryptEventIfNeeded(matrixEvent);
					} catch (decryptError) {
						// If decryption fails, include the encrypted event with an error marker
						messages.push({
							...event,
							decryption_error: (decryptError as Error).message,
						});
						continue;
					}
				}

				// Return the decrypted or plain content
				messages.push({
					...event,
					content: matrixEvent.getContent(),
					decrypted: matrixEvent.isEncrypted(),
				});
			}

			return messages;
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

		const room = this.client.getRoom(roomId);
		if (!room) {
			throw new OperationalError(`Room ${roomId} not found`);
		}

		try {
			// Send message - SDK will automatically encrypt if the room requires it
			const response = await this.client.sendMessage(roomId, content);
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
			const event = await this.client.fetchRoomEvent(roomId, eventId);
			const matrixEvent = new sdk.MatrixEvent(event as any);

			// Decrypt if encrypted
			if (matrixEvent.isEncrypted()) {
				try {
					await this.client.decryptEventIfNeeded(matrixEvent);
				} catch (decryptError) {
					return {
						...event,
						decryption_error: (decryptError as Error).message,
					};
				}
			}

			return {
				...event,
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
		return this.client?.crypto !== undefined;
	}
}
