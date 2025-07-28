/**
 * Service for handling Telegram gift operations
 */
class GiftService {
    /**
     * @param {import('./clientManager')} clientManager
     * @param {Object} config
     * @param {import('./logger').Logger} logger
     * @param {import('./telegramController')} [telegramController] - Optional Telegram controller for notifications
     */
    constructor(clientManager, config, logger, telegramController = null) {
        this.clientManager = clientManager;
        this.config = config;
        this.logger = logger;
        this.telegramController = telegramController;
        this.isCheckingGifts = false;
        this.lastCheckTime = 0;
        this.giftIdsCache = new Set();
        this.giftsMap = new Map(); // Store full gift objects by ID
        this.testGiftProcessed = false; // Flag to track if test gift has been processed
    }

    /**
     * Check available gifts and purchase if supply is below threshold
     * @returns {Promise<void>}
     */
    async checkAndPurchaseGifts() {
        if (this.isCheckingGifts) {
            return;
        }

        const now = Date.now();
        if (now - this.lastCheckTime < this.config.checkIntervalMs) {
            return;
        }

        this.lastCheckTime = now;
        this.isCheckingGifts = true;

        try {
            const checkerClient = this.clientManager.getCheckerClient();
            const userInfo = this.clientManager.getUserInfo(checkerClient);
            const account = this.clientManager.clientsMap.get(checkerClient);
            const userIdentifier = userInfo.username || userInfo.id;

            this.logger.info(`Checking available gifts from account ${userIdentifier} (${account.phoneNumber})...`);
            
            const startTime = Date.now();
            const availableGifts = await checkerClient.getStarGiftOptions();
            const endTime = Date.now();
            const requestTime = endTime - startTime;
            
            this.logger.info(`Gift list request completed in ${requestTime}ms for account ${userIdentifier} (${account.phoneNumber})`);

            const isFirstRun = this.giftIdsCache.size === 0;

            if (isFirstRun) {
                this.logger.info('First run: caching all gift IDs...');
                for (const gift of availableGifts) {
                    const giftId = gift.id.toString();
                    this.giftIdsCache.add(giftId);
                    this.giftsMap.set(giftId, gift);
                }
                this.logger.info(`Cached ${this.giftIdsCache.size} gift IDs.`);
            } else {
                const testGiftId = this.config.testGiftId;
                const newGifts = availableGifts.filter(
                    gift => !this.giftIdsCache.has(gift.id.toString()) ||
                        (testGiftId && gift.id.toString() === testGiftId && !this.testGiftProcessed)
                );

                if (testGiftId && newGifts.some(gift => gift.id.toString() === testGiftId)) {
                    this.testGiftProcessed = true;
                    this.logger.info(`Test gift with ID ${testGiftId} marked as processed`);
                }

                for (const gift of newGifts) {
                    const giftId = gift.id.toString();
                    this.giftIdsCache.add(giftId);
                    this.giftsMap.set(giftId, gift);

                    this.logger.warning(`Found new gift`, gift);
                    Promise.resolve().then(() => this.notifyNewGift(gift))
                        .catch(error => this.logger.error('Background notification error:', error));
                }

                if (this.config.autoBuyEnabled && newGifts.length > 0) {
                    const lowSupplyGifts = newGifts.filter(gift =>
                        gift.availability && 
                        this.config.maxGiftSupply >= (gift.availability.total || 10000000)
                    ).sort((a, b) =>
                        ((a.availability.total || 10000000) - (b.availability.total || 10000000) )
                    );

                    if (lowSupplyGifts.length > 0) {
                        await this.purchaseGiftsWithAllClients(lowSupplyGifts);
                    }
                }
            }
        } catch (error) {
            this.logger.error('Error checking gifts:', error);
        } finally {
            this.isCheckingGifts = false;
        }
    }

    /**
     * Purchase gifts using all available clients
     * @param {Array|string} giftsOrGiftId - Array of gift objects or a single gift ID
     * @param {number} [quantity=0] - Number of gifts to purchase (0 means all available)
     * @returns {Promise<void>}
     */
    async purchaseGiftsWithAllClients(giftsOrGiftId, quantity = 0) {
        const clients = this.clientManager.getAllClients();
        let gifts = [];

        // Handle both array of gifts and single gift ID
        if (Array.isArray(giftsOrGiftId)) {
            gifts = giftsOrGiftId;
        } else {
            const giftId = giftsOrGiftId.toString();
            const gift = this.giftsMap.get(giftId);
            
            if (!gift) {
                this.logger.error(`Gift with ID ${giftId} not found in cache`);
                return;
            }
            
            gifts = [gift];
        }

        if (gifts.length === 0) {
            this.logger.warning('No gifts to purchase');
            return;
        }

        for (const giftOption of gifts) {
            const purchasePromises = [];

            this.logger.warning(
                `Starting purchase attempts for gift: ${giftOption.title} (ID: ${giftOption.id})`,
                {
                    gift: giftOption,
                    quantity: quantity > 0 ? quantity : 'all available'
                }
            );

            const maxGiftsToBuy = quantity || this.config.maxGiftsToBuy || 1;

            for (const client of clients) {
                purchasePromises.push(this.purchaseGift(client, giftOption, maxGiftsToBuy));
            }

            await Promise.allSettled(purchasePromises);
        }
    }

    /**
     * Purchase gifts using the specified client
     * @param {import('@mtcute/node').TelegramClient} client
     * @param {Object} giftOption
     * @param {number} [quantity=1] - Number of gifts to purchase with this client
     * @returns {Promise<void>}
     */
    async purchaseGift(client, giftOption, quantity = 1) {
        try {
            const me = this.clientManager.getUserInfo(client);
            const targetPeerId = this.clientManager.getTargetPeerId(client);
            const userIdentifier = me.username || me.id;

            this.logger.warning(
                `Attempting to purchase ${quantity} gift(s) with account ${userIdentifier} for peer ${targetPeerId}...`,
                {
                    gift: giftOption.title,
                    giftId: giftOption.id,
                    quantity: quantity,
                    user: userIdentifier,
                    peerId: targetPeerId
                }
            );

            const maxAttempts = 50;
            const nonRetryableErrors = [
                'USAGE_LIMITED',
                'PREMIUM',
                'BALANCE_TOO_LOW',
                'is not found in local cache',
            ];

            let successCount = 0;
            let failureCount = 0;
            
            for (let i = 0; i < quantity; i++) {
                const result = await this._attemptGiftPurchase(
                    client,
                    giftOption,
                    targetPeerId,
                    userIdentifier,
                    maxAttempts,
                    nonRetryableErrors
                );
                
                if (result.success) {
                    successCount++;
                } else {
                    failureCount++;
                    
                    if (result.shouldStopRetrying) {
                        this.logger.warning(
                            `Stopping further gift purchases with account ${userIdentifier} due to non-retryable error`,
                            { error: result.lastError?.message }
                        );
                        break;
                    }
                }
            }
            
            this.logger.info(
                `Gift purchase summary for account ${userIdentifier}: ${successCount} successful, ${failureCount} failed`,
                {
                    gift: giftOption.title,
                    giftId: giftOption.id,
                    user: userIdentifier,
                    successCount,
                    failureCount
                }
            );
        } catch (error) {
            this.logger.error('Error in purchaseGift:', error);
        }
    }

    /**
     * Attempts to purchase a gift with retry logic
     * @private
     * @param {import('@mtcute/node').TelegramClient} client
     * @param {Object} giftOption
     * @param {number} targetPeerId
     * @param {string} userIdentifier
     * @param {number} maxAttempts
     * @param {string[]} nonRetryableErrors
     * @returns {Object} Result object containing success status, attempts, and error info
     */
    async _attemptGiftPurchase(client, giftOption, targetPeerId, userIdentifier, maxAttempts, nonRetryableErrors) {
        let attempt = 0;
        let success = false;
        let lastError = null;
        let shouldStopRetrying = false;

        while (attempt < maxAttempts && !success && !shouldStopRetrying) {
            attempt++;
            try {
                await client.sendStarGift({
                    peerId: Number(targetPeerId),
                    gift: giftOption,
                    anonymous: true,
                });

                success = true;
                this.logger.success(
                    `Gift purchase successful for user ${userIdentifier} on attempt ${attempt}`,
                    {
                        gift: giftOption,
                        giftId: giftOption.id,
                        attempt,
                        user: userIdentifier
                    }
                );
            } catch (err) {
                lastError = err;

                shouldStopRetrying = this._shouldStopRetrying(err, nonRetryableErrors);
                if (shouldStopRetrying) {
                    this.logger.error(
                        `Gift purchase failed: ${err.message} for user ${userIdentifier}. Stopping attempts.`,
                        {
                            gift: giftOption,
                            user: userIdentifier,
                            error: err.message
                        }
                    );
                    break;
                }

                this.logger.info(
                    `Gift purchase attempt ${attempt}/${maxAttempts} failed for ${userIdentifier}: ${err.message}`,
                    {
                        gift: giftOption.title,
                        giftId: giftOption.id,
                        attempt,
                        user: userIdentifier,
                        error: err.message
                    }
                );

                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }

        return {
            success,
            attempt,
            lastError,
            shouldStopRetrying
        };
    }

    /**
     * Determines if retry attempts should be stopped based on error message
     * @private
     * @param {Error} error
     * @param {string[]} nonRetryableErrors
     * @returns {boolean}
     */
    _shouldStopRetrying(error, nonRetryableErrors) {
        if (!error || !error.message) {
            return false;
        }

        return nonRetryableErrors.some(errorText =>
            error.message.includes(errorText)
        );
    }

    /**
     * Logs the result of gift purchase attempts
     * @private
     * @param {Object} result
     * @param {Object} giftOption
     * @param {string} userIdentifier
     */
    _logPurchaseResult(result, giftOption, userIdentifier) {
        const {success, attempt, lastError, shouldStopRetrying} = result;

        if (success) {
            this.logger.success(
                `Gift purchase completed for ${userIdentifier} after ${attempt} attempts`,
                {
                    gift: giftOption.title,
                    giftId: giftOption.id,
                    attempts: attempt,
                    user: userIdentifier
                },
            );
        } else if (!shouldStopRetrying) {
            this.logger.error(
                `All ${attempt} gift purchase attempts failed for user ${userIdentifier}`,
                {
                    gift: giftOption,
                    giftId: giftOption.id,
                    attempts: attempt,
                    user: userIdentifier,
                    error: lastError
                }
            );
        }
    }

    /**
     * Notify about a new gift via Telegram controller
     * Sends notifications asynchronously to both regular and public channels (if configured)
     * @param {Object} gift - Gift object
     * @returns {Promise<void>}
     */
    async notifyNewGift(gift) {
        if (!this.telegramController) {
            return;
        }

        try {
            this.logger.info(`Sending notification for new gift: ${gift.title} (ID: ${gift.id})`);
            
            const regularChannelPromise = this.telegramController.sendGiftSticker(gift)
                .then(result => {
                    if (!result.ok) {
                        this.logger.error(`Failed to send gift notification: ${result.error}`);
                    }
                    return result;
                })
                .catch(error => {
                    this.logger.error('Error sending gift notification to regular channel:', error);
                    return { ok: false, error: error.message };
                });
            
            const promises = [regularChannelPromise];
            
            if (this.telegramController.config.publicChannelId) {
                this.logger.info(`Sending notification to public channel for new gift: ${gift.title} (ID: ${gift.id})`);
                
                const publicChannelPromise = this.telegramController.sendGiftSticker(gift, true)
                    .then(publicResult => {
                        if (!publicResult.ok) {
                            this.logger.error(`Failed to send gift notification to public channel: ${publicResult.error}`);
                        }
                        return publicResult;
                    })
                    .catch(error => {
                        this.logger.error('Error sending gift notification to public channel:', error);
                        return { ok: false, error: error.message };
                    });
                
                promises.push(publicChannelPromise);
            }
            
            await Promise.all(promises);
            
        } catch (error) {
            this.logger.error('Error in notifyNewGift:', error);
        }
    }
}

module.exports = GiftService;