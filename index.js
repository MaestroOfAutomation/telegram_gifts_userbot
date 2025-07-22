const config = require('./src/config');
const ClientManager = require('./src/clientManager');
const GiftService = require('./src/giftService');
const { logger } = require('./src/logger');
const TelegramNotifier = require('./src/telegramNotifier');

/**
 * Main application class
 */
class Application {
    constructor() {
        this.clientManager = new ClientManager(
            config.accounts, 
            config.apiId, 
            config.apiHash, 
            logger
        );
        this.giftService = null;
        this.notifier = null;
        this.checkInterval = null;
        this.isRunning = false;
    }

    /**
     * Initialize the application
     */
    async initialize() {
        logger.info('Initializing Telegram Gift Monitor...');
        logger.info(`API ID: ${config.apiId}`);
        logger.info(`Supply Threshold: ${config.supplyThreshold}`);
        logger.info(`Check Interval: ${config.checkIntervalMs}ms`);
        logger.info(`Number of accounts: ${config.accounts.length}`);
        
        if (config.notifications && config.notifications.enabled) {
            logger.info('Initializing notification system...');
            this.notifier = new TelegramNotifier({
                botToken: config.notifications.botToken,
                channelIds: config.notifications.channelIds
            });
            
            logger.addListener(this.notifier.createLogListener());
            
            logger.info('Notification system initialized');
            
            this.notifier.warning('Telegram Gift Monitor starting up');
            logger.warning('Test notification sent successfully');
        } else {
            logger.info('Notifications disabled');
        }

        try {
            await this.clientManager.initializeClients();
            
            this.giftService = new GiftService(
                this.clientManager, 
                config, 
                logger
            );
            
            logger.warning('Initialization complete!');
            return true;
        } catch (error) {
            logger.error('Failed to initialize application:', error);
            return false;
        }
    }

    /**
     * Start the gift monitoring process
     */
    start() {
        if (this.isRunning) {
            logger.info('Application is already running');
            return;
        }

        logger.info('Starting gift monitoring...');
        this.isRunning = true;

        this.giftService.checkAndPurchaseGifts()
            .catch(error => {
                logger.error('Error during initial gift check:', error);
            });

        this.checkInterval = setInterval(() => {
            if (!this.isRunning) return;

            this.giftService.checkAndPurchaseGifts()
                .catch(error => {
                    logger.error('Error during gift check:', error);
                });
        }, config.checkIntervalMs);

        logger.warning(`Gift monitoring started. Checking every ${config.checkIntervalMs}ms`);
        
        if (this.notifier) {
            this.notifier.warning(`Gift monitoring started. Checking every ${config.checkIntervalMs}ms`);
        }
    }

    /**
     * Stop the gift monitoring process
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        logger.info('Stopping gift monitoring...');
        this.isRunning = false;

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        if (this.notifier) {
            this.notifier.warning('Gift monitoring stopped');
        }

        await this.clientManager.disconnectAll();
        logger.info('All clients disconnected');
    }
}

/**
 * Main function
 */
async function main() {
    const app = new Application();
    
    process.on('SIGINT', async () => {
        logger.info('\nReceived SIGINT. Shutting down...');
        await app.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        logger.info('\nReceived SIGTERM. Shutting down...');
        await app.stop();
        process.exit(0);
    });

    process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception:', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error(
            'Unhandled promise rejection:',
            { reason }
        );
        process.exit(1);
    });

    const initialized = await app.initialize();
    if (initialized) {
        app.start();
    } else {
        logger.error('Failed to initialize application. Exiting...');
        process.exit(1);
    }
}

main().catch(error => {
    logger.error('Unhandled error in main process:', error);
    process.exit(1);
});