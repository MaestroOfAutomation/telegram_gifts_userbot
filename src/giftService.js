/**
 * Service for handling Telegram gift operations
 */
class GiftService {
    /**
     * @param {import('./clientManager')} clientManager
     * @param {Object} config
     * @param {import('./logger').Logger} logger
     */
    constructor(clientManager, config, logger) {
        this.clientManager = clientManager;
        this.config = config;
        this.logger = logger;
        this.isCheckingGifts = false;
        this.lastCheckTime = 0;
        this.giftIdsCache = new Set();
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

            this.logger.info('Checking available gifts...');
            const availableGifts = await checkerClient.getStarGiftOptions();

            const isFirstRun = this.giftIdsCache.size === 0;

            if (isFirstRun) {
                this.logger.info('First run: caching all gift IDs...');
                for (const gift of availableGifts) {
                    this.giftIdsCache.add(gift.id.toString());
                }
                this.logger.info(`Cached ${this.giftIdsCache.size} gift IDs.`);
            } else {
                const testGiftId = this.config.testGiftId;
                const newGifts = availableGifts.filter(
                    gift => !this.giftIdsCache.has(gift.id.toString()) ||
                        (testGiftId && gift.id.toString() === testGiftId)
                );

                for (const gift of newGifts) {
                    this.giftIdsCache.add(gift.id.toString());
                }

                if (newGifts.length > 0) {
                    for (const gift of newGifts) {
                        this.logger.warning(`Found new gift`, gift);
                    }

                    const lowSupplyGifts = newGifts.filter(gift =>
                        gift.availability && 
                        this.config.supplyThreshold >= (gift.availability.total || 10000000)
                    );

                    if (lowSupplyGifts.length > 0) {
                        await this.purchaseGiftsWithAllClients(lowSupplyGifts);
                    } else {
                        this.logger.info('No new gifts with low supply found.');
                    }
                } else {
                    this.logger.info('No new gifts found.');
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
     * @param {Array} lowSupplyGifts
     * @returns {Promise<void>}
     */
    async purchaseGiftsWithAllClients(lowSupplyGifts) {
        const clients = this.clientManager.getAllClients();
        const purchasePromises = [];

        for (const client of clients) {
            const giftOption = lowSupplyGifts[0];

            this.logger.warning(
                `Starting purchase attempts for gift: ${giftOption.title} (ID: ${giftOption.id})`,
                giftOption
            );

            purchasePromises.push(this.purchaseGift(client, giftOption));
        }

        await Promise.allSettled(purchasePromises);
    }

    /**
     * Purchase a gift using the specified client
     * @param {import('@mtcute/node').TelegramClient} client
     * @param {Object} giftOption
     * @returns {Promise<void>}
     */
    async purchaseGift(client, giftOption) {
        try {
            const me = this.clientManager.getUserInfo(client);
            const targetChannelId = this.clientManager.getTargetChannelId(client);
            const userIdentifier = me.username || me.firstName || me.id;

            this.logger.warning(
                `Attempting to purchase gift with account ${userIdentifier} for channel ${targetChannelId}...`,
                {
                    gift: giftOption.title,
                    giftId: giftOption.id,
                    user: userIdentifier,
                    channel: targetChannelId
                }
            );

            const maxAttempts = 50;
            const nonRetryableErrors = [
                'USAGE_LIMITED',
                'PREMIUM',
                'BALANCE_TOO_LOW'
            ];

            const result = await this._attemptGiftPurchase(
                client,
                giftOption,
                targetChannelId,
                userIdentifier,
                maxAttempts,
                nonRetryableErrors
            );

            this._logPurchaseResult(result, giftOption, userIdentifier);
        } catch (error) {
            this.logger.error('Error in purchaseGift:', error);
        }
    }

    /**
     * Attempts to purchase a gift with retry logic
     * @private
     * @param {import('@mtcute/node').TelegramClient} client
     * @param {Object} giftOption
     * @param {number} targetChannelId
     * @param {string} userIdentifier
     * @param {number} maxAttempts
     * @param {string[]} nonRetryableErrors
     * @returns {Object} Result object containing success status, attempts, and error info
     */
    async _attemptGiftPurchase(client, giftOption, targetChannelId, userIdentifier, maxAttempts, nonRetryableErrors) {
        let attempt = 0;
        let success = false;
        let lastError = null;
        let shouldStopRetrying = false;

        while (attempt < maxAttempts && !success && !shouldStopRetrying) {
            attempt++;
            try {
                await client.sendStarGift({
                    peerId: Number(targetChannelId),
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
}

module.exports = GiftService;