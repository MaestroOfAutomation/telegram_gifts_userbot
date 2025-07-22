/**
 * Telegram Controller for sending stickers and handling inline buttons
 * Uses the grammy library for Telegram Bot API
 * Uses mtcute for downloading stickers directly in memory
 */
const { Bot, InlineKeyboard, InputFile } = require('grammy');
const { TelegramClient } = require("@mtcute/node");
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class TelegramController {
    /**
     * Create a new Telegram controller
     * @param {Object} config - Configuration object
     * @param {boolean} config.enabled - Whether the controller is enabled
     * @param {string} config.botToken - Telegram bot token
     * @param {string} config.channelId - Channel ID where stickers and messages will be sent
     * @param {import('./giftService')} giftService - Gift service instance
     * @param {import('./logger').Logger} logger - Logger instance
     * @param {import('./clientManager')} [clientManager] - Client manager instance for downloading stickers
     */
    constructor(config, giftService, logger, clientManager = null) {
        this.config = config;
        this.giftService = giftService;
        this.logger = logger;
        this.clientManager = clientManager;
        this.bot = null;
        this.isRunning = false;

        if (!this.config.enabled) {
            this.logger.warning('TelegramController: Controller is disabled. Set TELEGRAM_CONTROLLER_BOT_TOKEN and TELEGRAM_CONTROLLER_CHANNEL_ID in .env file to enable it.');
            return;
        }

        if (!this.config.botToken) {
            this.logger.warning('TelegramController: No bot token provided, controller will be disabled');
            return;
        }

        if (!this.config.channelId) {
            this.logger.warning('TelegramController: No channel ID provided, controller will be disabled');
            return;
        }

        // Initialize the bot
        this.bot = new Bot(this.config.botToken);
        
        // Set up command handlers
        this.setupCommandHandlers();
        
        // Set up callback query handlers for inline buttons
        this.setupCallbackQueryHandlers();
    }

    /**
     * Set up command handlers
     * @private
     */
    setupCommandHandlers() {
        // Handle /start command
        this.bot.command('start', (ctx) => {
            ctx.reply('Bot is running. It will send stickers and information about new gifts.');
        });

        // Handle /help command
        this.bot.command('help', (ctx) => {
            ctx.reply('This bot sends stickers and information about new Telegram gifts. You can use the inline buttons to purchase gifts.');
        });
    }

    /**
     * Set up callback query handlers for inline buttons
     * @private
     */
    setupCallbackQueryHandlers() {
        // Handle callback queries from inline buttons
        this.bot.on('callback_query:data', async (ctx) => {
            try {
                const data = ctx.callbackQuery.data;
                const [action, giftId, quantity] = data.split(':');

                if (action === 'purchase') {
                    // await ctx.answerCallbackQuery({
                    //     text: `Purchasing ${quantity} of gift ${giftId}...`,
                    //     show_alert: true
                    // });

                    const quantityNum = quantity === 'all' ? 0 : parseInt(quantity, 10);
                    await this.giftService.purchaseGiftsWithAllClients(giftId, quantityNum);
                    
                    await ctx.reply(`Started purchase of ${quantity === 'all' ? 'all available' : quantity} units of gift ${giftId}`);
                }
            } catch (error) {
                this.logger.error('Error handling callback query:', error);
                await ctx.answerCallbackQuery({
                    text: 'An error occurred while processing your request.',
                    show_alert: true
                });
            }
        });
    }

    /**
     * Start the bot in polling mode (non-blocking)
     * @returns {Promise<void>}
     */
    async start() {
        if (!this.bot || this.isRunning || !this.config.enabled) {
            return;
        }

        try {
            this.isRunning = true;
            this.logger.info('Starting Telegram controller bot in polling mode...');
            
            // Start the bot in non-blocking mode (don't await)
            this.bot.start({
                drop_pending_updates: true,
                onStart: () => {
                    this.logger.info('Telegram controller bot started successfully');
                }
            });
            
            // Return immediately without waiting for bot.start() to complete
            return Promise.resolve();
        } catch (error) {
            this.isRunning = false;
            this.logger.error('Failed to start Telegram controller bot:', error);
        }
    }

    /**
     * Stop the bot
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.bot || !this.isRunning) {
            return;
        }

        try {
            await this.bot.stop();
            this.isRunning = false;
            this.logger.info('Telegram controller bot stopped');
        } catch (error) {
            this.logger.error('Error stopping Telegram controller bot:', error);
        }
    }

    /**
     * Send a sticker for a new gift
     * @param {Object} gift - Gift object
     * @returns {Promise<Object>} - Message object from Telegram
     */
    async sendGiftSticker(gift) {
        if (!this.bot || !this.config.enabled) {
            return { ok: false, error: 'Bot is not initialized or disabled' };
        }
    
        // Check if bot is running and log a warning if not
        if (!this.isRunning) {
            this.logger.warning('Attempting to send sticker while bot is not running. Will try anyway.');
        }

        try {
            if (!gift || !gift.sticker || !gift.sticker.fileId) {
                return { ok: false, error: 'Invalid gift or missing sticker' };
            }

            let stickerMessage;
        
            // Try the new approach with mtcute if clientManager is available
            if (this.clientManager) {
                let tempFilename = null;
                
                try {
                    this.logger.info('Using mtcute to download and send sticker in-memory');
                
                    // Get a client from the clientManager
                    const client = this.clientManager.getCheckerClient();
                    if (!client) {
                        throw new Error('No mtcute client available');
                    }
                
                    this.logger.info(`Downloading sticker with fileId: ${gift.sticker.fileId}`);
                    
                    // Generate a temporary file with UUID4 filename
                    tempFilename = `${uuidv4()}.tgs`;
                    this.logger.info(`Using temporary file: ${tempFilename}`);
                    
                    // Download the sticker to the temporary file
                    await client.downloadToFile(
                        tempFilename,
                        gift.sticker.fileId,
                    );
                    
                    if (!fs.existsSync(tempFilename)) {
                        throw new Error('Failed to download sticker file');
                    }
                    
                    const stickerBuffer = fs.readFileSync(tempFilename);
                    
                    this.logger.info(`Sticker downloaded successfully, size: ${stickerBuffer.length} bytes`);
                    
                    const inputFile = new InputFile(stickerBuffer, `sticker_${Date.now()}.tgs`);


                    stickerMessage = await this.bot.api.sendSticker(
                        this.config.channelId,
                        inputFile
                    );
                    
                    this.logger.info('Sticker sent successfully using in-memory approach');
                    
                    try {
                        fs.unlinkSync(tempFilename);
                        this.logger.info(`Temporary file ${tempFilename} deleted successfully`);
                    } catch (deleteError) {
                        this.logger.warning(`Failed to delete temporary file ${tempFilename}: ${deleteError.message}`);
                    }
                    
                } catch (mtcuteError) {
                    this.logger.error('Error using mtcute in-memory approach:', mtcuteError);
                    this.logger.warning('Falling back to direct fileId approach');
                    
                    // Clean up the temporary file if it exists
                    if (tempFilename && fs.existsSync(tempFilename)) {
                        try {
                            fs.unlinkSync(tempFilename);
                            this.logger.info(`Temporary file ${tempFilename} deleted after error`);
                        } catch (deleteError) {
                            this.logger.warning(`Failed to delete temporary file ${tempFilename} after error: ${deleteError.message}`);
                        }
                    }
                
                    // Fall back to the original approach
                    stickerMessage = await this.bot.api.sendSticker(
                        this.config.channelId,
                        gift.sticker.fileId
                    );
                }
            } else {
                // Use the original approach if clientManager is not available
                this.logger.info('ClientManager not available, using direct fileId approach');
                stickerMessage = await this.bot.api.sendSticker(
                    this.config.channelId,
                    gift.sticker.fileId
                );
            }

            await this.sendGiftInfo(gift, stickerMessage.message_id);

            return { ok: true, message: stickerMessage };
        } catch (error) {
            this.logger.error('Error sending gift sticker:', error);
            return { ok: false, error: error.message };
        }
    }

    /**
     * Send gift information as a reply to a sticker
     * @param {Object} gift - Gift object
     * @param {number} replyToMessageId - Message ID to reply to
     * @returns {Promise<Object>} - Message object from Telegram
     * @private
     */
    async sendGiftInfo(gift, replyToMessageId) {
        if (!this.bot || !this.config.enabled) {
            return { ok: false, error: 'Bot is not initialized or disabled' };
        }
        
        // Check if bot is running and log a warning if not
        if (!this.isRunning) {
            this.logger.warning('Attempting to send gift info while bot is not running. Will try anyway.');
        }

        try {
            // Create message text with gift information
            const messageText = this.formatGiftInfo(gift);

            // Create inline keyboard with purchase buttons
            const keyboard = this.createPurchaseKeyboard(gift.id);

            // Send the message as a reply to the sticker
            const infoMessage = await this.bot.api.sendMessage(
                this.config.channelId,
                messageText,
                {
                    reply_to_message_id: replyToMessageId,
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                }
            );

            return { ok: true, message: infoMessage };
        } catch (error) {
            this.logger.error('Error sending gift info:', error);
            return { ok: false, error: error.message };
        }
    }

    /**
     * Format gift information as a message
     * @param {Object} gift - Gift object
     * @returns {string} - Formatted message
     * @private
     */
    formatGiftInfo(gift) {
        let message = `<b>Gift Information:</b>\n\n`;
        message += `ID: ${gift.id}\n`;
        message += `Title: ${gift.title || 'Unknown'}\n`;
        message += `Purchase Stars: ${gift.purchaseStars || 'N/A'}\n`;
        
        if (gift.availability) {
            message += `Availability: ${gift.availability.remains || 0}/${gift.availability.total || 0}\n`;
        }
        
        if (gift.releasedBy) {
            message += `Released By: ${gift.releasedBy}\n`;
        }

        return message;
    }

    /**
     * Create an inline keyboard with purchase buttons
     * @param {string} giftId - Gift ID
     * @returns {InlineKeyboard} - Inline keyboard
     * @private
     */
    createPurchaseKeyboard(giftId) {
        const keyboard = new InlineKeyboard();

        // Add buttons for different quantities
        keyboard
            .text("Buy 10", `purchase:${giftId}:10`).text("Buy 25", `purchase:${giftId}:25`).row()
            .text("Buy 50", `purchase:${giftId}:50`).text("Buy 100", `purchase:${giftId}:100`).row()
            .text("Buy All", `purchase:${giftId}:all`);

        return keyboard;
    }
}

module.exports = TelegramController;