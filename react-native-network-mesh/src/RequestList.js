/**
 * RequestList - Request Tracking Manager
 * ================================
 * Manages all requests sent through WebSocket
 * Tracks request status, timeout handling, retry mechanism
 */

export default class RequestList {
  constructor(config = {}) {
    // Request list Map<requestUUID, RequestItem>
    this.requests = new Map();

    // Configuration
    this.timeout = config.timeout || 30000; // Default 30 seconds timeout
    this.maxRetry = config.maxRetry || 3;   // Default max 3 retries
    this.retryDelay = config.retryDelay || 1000; // Default 1 second retry delay

    // Cleanup timer
    this.cleanupInterval = null;
    this.startCleanupTimer();
  }

  /**
   * Add request to tracking list
   * @param {string} requestUUID - Request unique identifier
   * @param {Object} request - Request object
   * @param {Function} onResponse - Response callback
   * @param {Function} onTimeout - Timeout callback
   * @param {Function} onError - Error callback
   * @param {string} targetIP - Target IP address (for batch error handling)
   */
  addRequest(requestUUID, request, onResponse, onTimeout, onError, targetIP = null) {
    const requestItem = {
      requestUUID,
      request,
      requestDateTime: request.requestDateTime || new Date().toISOString(),
      targetIP,
      onResponse,
      onTimeout,
      onError,
      retryCount: 0,
      maxRetry: request.maxRetry || this.maxRetry,
      timeout: request.timeout || this.timeout,
      createdAt: Date.now(),
      status: 'pending', // pending, resolved, timeout, failed
      timer: null,
    };

    // Set timeout timer
    requestItem.timer = setTimeout(() => {
      this.handleTimeout(requestUUID);
    }, requestItem.timeout);

    this.requests.set(requestUUID, requestItem);

    console.log(`[RequestList] Added request: ${requestUUID}, target: ${targetIP}, timeout: ${requestItem.timeout}ms`);
    return requestItem;
  }

  /**
   * Handle received response
   * @param {string} requestUUID - Request unique identifier
   * @param {Object} response - Response object
   */
  handleResponse(requestUUID, response) {
    const requestItem = this.requests.get(requestUUID);
    
    if (!requestItem) {
      console.warn(`[RequestList] Received response for unknown request: ${requestUUID}`);
      return false;
    }

    // Check if request has already timed out or failed
    if (requestItem.status !== 'pending') {
      console.warn(`[RequestList] Request ${requestUUID} status is not pending: ${requestItem.status}`);
      return false;
    }

    // Clear timeout timer
    if (requestItem.timer) {
      clearTimeout(requestItem.timer);
      requestItem.timer = null;
    }

    // Update status
    requestItem.status = 'resolved';

    // Call response callback
    if (requestItem.onResponse) {
      try {
        requestItem.onResponse(response);
      } catch (error) {
        console.error(`[RequestList] Response callback failed ${requestUUID}:`, error);
      }
    }

    // Remove from list
    this.requests.delete(requestUUID);
    console.log(`[RequestList] Request completed and removed: ${requestUUID}`);

    return true;
  }

  /**
   * Handle request timeout
   * @param {string} requestUUID - Request unique identifier
   */
  handleTimeout(requestUUID) {
    const requestItem = this.requests.get(requestUUID);
    
    if (!requestItem) {
      return;
    }

    console.warn(`[RequestList] Request timeout: ${requestUUID}, retry: ${requestItem.retryCount}/${requestItem.maxRetry}`);

    // Check if retry is needed
    if (requestItem.retryCount < requestItem.maxRetry) {
      // Retry
      requestItem.retryCount++;
      
      // Set new timeout timer
      requestItem.timer = setTimeout(() => {
        this.handleTimeout(requestUUID);
      }, requestItem.timeout);

      console.log(`[RequestList] Preparing to retry request: ${requestUUID}, attempt ${requestItem.retryCount}`);

      // Call timeout callback to let external retry
      if (requestItem.onTimeout) {
        try {
          setTimeout(() => {
            requestItem.onTimeout(requestItem.request, requestItem.retryCount);
          }, this.retryDelay * requestItem.retryCount); // Incremental delay
        } catch (error) {
          console.error(`[RequestList] Timeout callback failed ${requestUUID}:`, error);
        }
      }
    } else {
      // Exceeded max retries, mark as timeout failed
      requestItem.status = 'timeout';

      // Clear timer
      if (requestItem.timer) {
        clearTimeout(requestItem.timer);
        requestItem.timer = null;
      }

      // Call error callback
      if (requestItem.onError) {
        try {
          requestItem.onError(new Error('Request timeout after max retries'), requestItem.request);
        } catch (error) {
          console.error(`[RequestList] Error callback failed ${requestUUID}:`, error);
        }
      }

      // Remove from list
      this.requests.delete(requestUUID);
      console.log(`[RequestList] Request timeout and removed: ${requestUUID}`);
    }
  }

  /**
   * Handle request error
   * @param {string} requestUUID - Request unique identifier
   * @param {Error} error - Error object
   */
  handleError(requestUUID, error) {
    const requestItem = this.requests.get(requestUUID);
    
    if (!requestItem) {
      return;
    }

    // Clear timeout timer
    if (requestItem.timer) {
      clearTimeout(requestItem.timer);
      requestItem.timer = null;
    }

    // Update status
    requestItem.status = 'failed';

    // Call error callback
    if (requestItem.onError) {
      try {
        requestItem.onError(error, requestItem.request);
      } catch (err) {
        console.error(`[RequestList] Error callback failed ${requestUUID}:`, err);
      }
    }

    // Remove from list
    this.requests.delete(requestUUID);
    console.log(`[RequestList] Request failed and removed: ${requestUUID}`, error);
  }

  /**
   * Batch handle errors for specified target IP
   * @param {string} targetIP - Target IP address
   * @param {Error} error - Error object
   * @returns {number} Number of requests handled
   */
  handleErrorByTargetIP(targetIP, error) {
    if (!targetIP) {
      console.warn('[RequestList] handleErrorByTargetIP: targetIP is empty');
      return 0;
    }

    let count = 0;
    const requestsToFail = [];

    // Find all pending requests for this targetIP
    for (const [requestUUID, requestItem] of this.requests.entries()) {
      if (requestItem.targetIP === targetIP && requestItem.status === 'pending') {
        requestsToFail.push(requestUUID);
      }
    }

    // Batch handle errors
    requestsToFail.forEach(requestUUID => {
      this.handleError(requestUUID, error);
      count++;
    });

    if (count > 0) {
      console.log(`[RequestList] Batch handled ${count} failed requests for ${targetIP}`);
    }

    return count;
  }

  /**
   * Cancel request
   * @param {string} requestUUID - Request unique identifier
   */
  cancelRequest(requestUUID) {
    const requestItem = this.requests.get(requestUUID);
    
    if (!requestItem) {
      return false;
    }

    // Clear timeout timer
    if (requestItem.timer) {
      clearTimeout(requestItem.timer);
      requestItem.timer = null;
    }

    // Remove from list
    this.requests.delete(requestUUID);
    console.log(`[RequestList] Request cancelled: ${requestUUID}`);

    return true;
  }

  /**
   * Get request status
   * @param {string} requestUUID - Request unique identifier
   * @returns {Object|null} Request item or null
   */
  getRequest(requestUUID) {
    return this.requests.get(requestUUID) || null;
  }

  /**
   * Get all pending requests
   * @returns {Array} Request array
   */
  getPendingRequests() {
    return Array.from(this.requests.values()).filter(
      item => item.status === 'pending'
    );
  }

  /**
   * Cleanup expired requests (scheduled task)
   */
  cleanup() {
    const now = Date.now();
    const expiredRequests = [];

    for (const [requestUUID, requestItem] of this.requests.entries()) {
      const age = now - requestItem.createdAt;
      const maxAge = requestItem.timeout * (requestItem.maxRetry + 1) + 10000; // Extra 10 seconds buffer

      if (age > maxAge) {
        expiredRequests.push(requestUUID);
      }
    }

    // Remove expired requests
    expiredRequests.forEach(requestUUID => {
      const requestItem = this.requests.get(requestUUID);
      if (requestItem && requestItem.timer) {
        clearTimeout(requestItem.timer);
      }
      this.requests.delete(requestUUID);
    });

    if (expiredRequests.length > 0) {
      console.log(`[RequestList] Cleaned up ${expiredRequests.length} expired requests`);
    }
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    if (this.cleanupInterval) {
      return;
    }

    // Cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const stats = {
      total: this.requests.size,
      pending: 0,
      resolved: 0,
      timeout: 0,
      failed: 0,
    };

    for (const requestItem of this.requests.values()) {
      stats[requestItem.status]++;
    }

    return stats;
  }

  /**
   * Clear all requests
   */
  clear() {
    // Clear all timers
    for (const requestItem of this.requests.values()) {
      if (requestItem.timer) {
        clearTimeout(requestItem.timer);
      }
    }

    // Clear list
    this.requests.clear();
    console.log('[RequestList] Cleared all requests');
  }

  /**
   * Destroy instance
   */
  destroy() {
    this.stopCleanupTimer();
    this.clear();
  }
}

