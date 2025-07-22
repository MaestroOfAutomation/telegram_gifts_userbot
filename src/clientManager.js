const {TelegramClient} = require('@mtcute/node');
const fs = require('fs');
const path = require('path');

// Path to the sessions directory
const SESSIONS_DIR = path.join(process.cwd(), 'sessions');

/**
 * Manages multiple Telegram clients
 */
class ClientManager {
    /**
     * @param {Array<{phoneNumber: string, targetChannelId: BigInt}>} accounts
     * @param {number} apiId - Common API ID for all clients
     * @param {string} apiHash - Common API hash for all clients
     * @param {import('./logger').Logger} [logger] - Logger instance
     */
    constructor(accounts, apiId, apiHash, logger = console) {
        this.accounts = accounts;
        this.apiId = apiId;
        this.apiHash = apiHash;
        this.logger = logger;
        this.clients = [];
        this.clientsMap = new Map();
        this.clientUserMap = new Map();
        this.checkerClient = null;
    }

    /**
     * Initialize all clients
     */
    async initializeClients() {
        if (!fs.existsSync(SESSIONS_DIR)) {
            fs.mkdirSync(SESSIONS_DIR, { recursive: true });
            this.logger.info('Created sessions directory.');
        }

        for (const account of this.accounts) {
            console.log(`Logging into ${account.phoneNumber}...`);

            const sessionFile = path.join(SESSIONS_DIR, `${account.phoneNumber}.session`);

            const client = new TelegramClient({
                apiId: this.apiId,
                apiHash: this.apiHash,
                storage: sessionFile,
            });

            try {
                await client.start({
                    phone: async () => account.phoneNumber,
                    code: async () => client.input(
                        `Enter sent code for ${account.phoneNumber} > `
                    ),
                    password: async () => client.input(
                        `Enter 2fa password for ${account.phoneNumber} > `
                    ),
                });

                const me = await client.getMe();

                this.logger.warning(`Client for ${account.phoneNumber} initialized successfully`);
                this.clients.push(client);
                this.clientsMap.set(client, account);
                this.clientUserMap.set(client, me);
            } catch (error) {
                this.logger.error(
                    `Failed to initialize client for ${account.phoneNumber}:`,
                    error
                );
            }
        }

        if (this.clients.length === 0) {
            throw new Error('No clients could be initialized');
        }

        this.checkerClient = this.clients[0];
        this.logger.warning(`Using ${this.accounts[0].phoneNumber} as the checker client`);
    }

    /**
     * Get the client designated for checking gifts
     * @returns {TelegramClient}
     */
    getCheckerClient() {
        return this.checkerClient;
    }

    /**
     * Get all clients for sending gifts
     * @returns {Array<TelegramClient>}
     */
    getAllClients() {
        return this.clients;
    }

    /**
     * Get the target channel ID for a specific client
     * @param {TelegramClient} client
     * @returns {BigInt} The target channel ID for the client
     */
    getTargetChannelId(client) {
        const account = this.clientsMap.get(client);
        if (!account) {
            throw new Error('Client not found in client manager');
        }
        return account.targetChannelId;
    }

    /**
     * Get the user info for a specific client
     * @param {TelegramClient} client
     * @returns {Object} The user info for the client
     */
    getUserInfo(client) {
        const userInfo = this.clientUserMap.get(client);
        if (!userInfo) {
            throw new Error('User info not found for client');
        }
        return userInfo;
    }

    /**
     * Disconnect all clients
     */
    async disconnectAll() {
        for (const client of this.clients) {
            try {
                await client.disconnect();
            } catch (error) {
                this.logger.error(
                    'Error disconnecting client:',
                    error
                );
            }
        }
    }
}

module.exports = ClientManager;