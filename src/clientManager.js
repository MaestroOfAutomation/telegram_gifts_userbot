const {TelegramClient, HttpProxyTcpTransport} = require('@mtcute/node');
const fs = require('fs');
const path = require('path');

/**
 * Path to the directory where session files are stored
 * @type {string}
 */
const SESSIONS_DIR = path.join(process.cwd(), 'sessions');

/**
 * Manages multiple Telegram clients
 */
class ClientManager {
    /**
     * @param {Array<{phoneNumber: string, targetPeerId: BigInt, apiId: number, apiHash: string, proxy?: string}>} accounts - Array of account configurations
     * @param {import('./logger').Logger} [logger] - Logger instance
     */
    constructor(accounts, logger = console) {
        this.accounts = accounts;
        this.logger = logger;
        this.clients = [];
        this.clientsMap = new Map();
        this.clientUserMap = new Map();
        this.checkerClient = null;
    }

    /**
     * Configure proxy transport based on account settings
     * @param {Object} account - Account configuration object
     * @param {string} account.phoneNumber - Phone number of the account
     * @param {string} [account.proxy] - Proxy string in format "host:port:user:password" or "host:port"
     * @returns {Object} Proxy configuration object
     * @returns {Object} [return.transport] - HttpProxyTcpTransport instance if proxy is configured
     * @returns {string} [return.proxyHost] - Proxy host if proxy is configured
     * @returns {string} [return.proxyPort] - Proxy port if proxy is configured
     */
    configureProxy(account) {
        let transport = undefined;
        let proxyHost = null;
        let proxyPort = null;
        
        if (!account) {
            this.logger.error('Cannot configure proxy: account object is undefined');
            return { transport, proxyHost, proxyPort };
        }
        
        if (!account.proxy) {
            return { transport, proxyHost, proxyPort };
        }
        
        try {
            const proxyParts = account.proxy.split(':');
            
            if (proxyParts.length < 2) {
                this.logger.error(`Invalid proxy format for ${account.phoneNumber}: ${account.proxy}. Expected format: host:port[:user:password]`);
                return { transport, proxyHost, proxyPort };
            }
            
            const [host, port, user, password] = proxyParts;
            
            if (!host || !port) {
                this.logger.error(`Missing host or port in proxy for ${account.phoneNumber}: ${account.proxy}`);
                return { transport, proxyHost, proxyPort };
            }
            
            proxyHost = host;
            proxyPort = port;
            
            const portNumber = parseInt(port, 10);
            if (isNaN(portNumber)) {
                this.logger.error(`Invalid port number in proxy for ${account.phoneNumber}: ${port}`);
                return { transport, proxyHost, proxyPort: null };
            }
            
            const proxyConfig = {
                host,
                port: portNumber
            };
            
            if (user && password) {
                proxyConfig.user = user;
                proxyConfig.password = password;
            }
            
            transport = new HttpProxyTcpTransport(proxyConfig);
            this.logger.info(`Using HTTP proxy for ${account.phoneNumber}: ${host}:${port}`);
        } catch (error) {
            this.logger.error(`Failed to parse proxy for ${account.phoneNumber}: ${error.message}`);
        }
        
        return { transport, proxyHost, proxyPort };
    }
    
    /**
     * Initialize a single Telegram client
     * @param {Object} account - Account configuration object
     * @param {string} account.phoneNumber - Phone number of the account
     * @param {number} account.apiId - Telegram API ID
     * @param {string} account.apiHash - Telegram API hash
     * @param {string} sessionFile - Path to the session file for storing authentication data
     * @param {Object} proxyConfig - Proxy configuration object returned by configureProxy method
     * @param {Object} [proxyConfig.transport] - HttpProxyTcpTransport instance if proxy is configured
     * @param {string} [proxyConfig.proxyHost] - Proxy host if proxy is configured
     * @param {string} [proxyConfig.proxyPort] - Proxy port if proxy is configured
     * @returns {Promise<Object|null>} Result object or null if initialization failed
     * @returns {Object} [return.client] - Initialized TelegramClient instance
     * @returns {Object} [return.me] - User information for the authenticated account
     */
    async initializeClient(account, sessionFile, proxyConfig) {
        if (!account) {
            this.logger.error('Cannot initialize client: account object is undefined');
            return null;
        }
        
        if (!account.apiId || !account.apiHash) {
            this.logger.error(`Missing apiId or apiHash for account ${account.phoneNumber}`);
            return null;
        }
        
        if (!sessionFile) {
            this.logger.error(`Missing session file path for account ${account.phoneNumber}`);
            return null;
        }
        
        const { transport, proxyHost, proxyPort } = proxyConfig || {};
        
        try {
            const client = new TelegramClient({
                apiId: account.apiId,
                apiHash: account.apiHash,
                storage: sessionFile,
                ...(transport ? { transport } : {})
            });

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

            if (transport && proxyHost && proxyPort) {
                this.logger.warning(`Client for ${account.phoneNumber} initialized successfully using proxy ${proxyHost}:${proxyPort}`);
            } else {
                this.logger.warning(`Client for ${account.phoneNumber} initialized successfully without proxy`);
            }
            
            return { client, me };
        } catch (error) {
            this.logger.error(
                `Failed to initialize client for ${account.phoneNumber}: ${error.message}`
            );
            return null;
        }
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
            this.logger.info(`Logging into ${account.phoneNumber}...`);

            const sessionFile = path.join(SESSIONS_DIR, `${account.phoneNumber}.session`);
            const proxyConfig = this.configureProxy(account);
            
            const result = await this.initializeClient(account, sessionFile, proxyConfig);
            
            if (result) {
                const { client, me } = result;
                this.clients.push(client);
                this.clientsMap.set(client, account);
                this.clientUserMap.set(client, me);
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
     * Get the target peer ID for a specific client
     * @param {TelegramClient} client
     * @param {boolean} isManual
     * @returns {BigInt} The target peer ID for the client
     */
    getTargetPeerId(client, isManual = false) {
        const account = this.clientsMap.get(client);
        if (!account) {
            throw new Error('Client not found in client manager');
        }

        let targetPeerId;
        if (isManual && account.manualPeerId) {
            targetPeerId = account.manualPeerId;
        }
        else {
            targetPeerId = account.targetPeerId;
        }

        return targetPeerId;
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