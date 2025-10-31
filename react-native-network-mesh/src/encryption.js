/**
 * Encryption Module
 * ================================
 * AES encryption/decryption for network messages
 */

import CryptoJS from 'crypto-js';

// Default encryption settings
let encryptionConfig = {
  enabled: false,
  key: null,
  iv: null,
};

/**
 * Initialize encryption configuration
 * @param {Object} config - Encryption configuration
 */
export function initEncryption(config = {}) {
  encryptionConfig = {
    enabled: config.enabled !== undefined ? config.enabled : false,
    key: config.key || null,
    iv: config.iv || null,
  };
  
  if (encryptionConfig.enabled && (!encryptionConfig.key || !encryptionConfig.iv)) {
    console.warn('[Encryption] Encryption enabled but key or iv not provided. Generating defaults...');
    // Generate default key and IV if not provided
    if (!encryptionConfig.key) {
      encryptionConfig.key = CryptoJS.lib.WordArray.random(32).toString();
    }
    if (!encryptionConfig.iv) {
      encryptionConfig.iv = CryptoJS.lib.WordArray.random(16).toString();
    }
  }
}

/**
 * Encrypt a string
 * @param {string} plaintext - Plain text to encrypt
 * @param {string} customKey - Custom encryption key (optional)
 * @param {string} customIv - Custom IV (optional)
 * @returns {string} Base64 encoded ciphertext
 */
export function encrypt(plaintext, customKey = null, customIv = null) {
  try {
    if (!encryptionConfig.enabled && !customKey) {
      return plaintext; // Return plain text if encryption is disabled
    }

    const key = customKey || encryptionConfig.key;
    const iv = customIv || encryptionConfig.iv;

    if (!key || !iv) {
      throw new Error('Encryption key or IV not configured');
    }

    // Convert key and IV to WordArray
    const keyWordArray = CryptoJS.enc.Utf8.parse(key.substring(0, 32).padEnd(32, '0'));
    const ivWordArray = CryptoJS.enc.Utf8.parse(iv.substring(0, 16).padEnd(16, '0'));

    // Encrypt
    const encrypted = CryptoJS.AES.encrypt(plaintext, keyWordArray, {
      iv: ivWordArray,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    return encrypted.toString(); // Returns Base64 encoded string
  } catch (error) {
    console.error('[Encryption] Encrypt failed:', error);
    throw new Error('Encryption failed: ' + error.message);
  }
}

/**
 * Decrypt a string
 * @param {string} cipherBase64 - Base64 encoded ciphertext
 * @param {string} customKey - Custom encryption key (optional)
 * @param {string} customIv - Custom IV (optional)
 * @returns {string} Decrypted plain text
 */
export function decrypt(cipherBase64, customKey = null, customIv = null) {
  try {
    if (!encryptionConfig.enabled && !customKey) {
      return cipherBase64; // Return as-is if encryption is disabled
    }

    const key = customKey || encryptionConfig.key;
    const iv = customIv || encryptionConfig.iv;

    if (!key || !iv) {
      throw new Error('Encryption key or IV not configured');
    }

    // Convert key and IV to WordArray
    const keyWordArray = CryptoJS.enc.Utf8.parse(key.substring(0, 32).padEnd(32, '0'));
    const ivWordArray = CryptoJS.enc.Utf8.parse(iv.substring(0, 16).padEnd(16, '0'));

    // Decrypt
    const decrypted = CryptoJS.AES.decrypt(cipherBase64, keyWordArray, {
      iv: ivWordArray,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('[Encryption] Decrypt failed:', error);
    throw new Error('Decryption failed: ' + error.message);
  }
}

/**
 * Encrypt a JSON object
 * @param {Object} jsonObject - JSON object to encrypt
 * @param {string} customKey - Custom encryption key (optional)
 * @param {string} customIv - Custom IV (optional)
 * @returns {string} Base64 encoded ciphertext
 */
export function encryptJSON(jsonObject, customKey = null, customIv = null) {
  try {
    const jsonString = JSON.stringify(jsonObject);
    return encrypt(jsonString, customKey, customIv);
  } catch (error) {
    console.error('[Encryption] JSON encrypt failed:', error);
    throw new Error('JSON encryption failed: ' + error.message);
  }
}

/**
 * Decrypt to JSON object
 * @param {string} cipherBase64 - Base64 encoded ciphertext
 * @param {string} customKey - Custom encryption key (optional)
 * @param {string} customIv - Custom IV (optional)
 * @returns {Object} Decrypted JSON object
 */
export function decryptJSON(cipherBase64, customKey = null, customIv = null) {
  try {
    const plaintext = decrypt(cipherBase64, customKey, customIv);
    return JSON.parse(plaintext);
  } catch (error) {
    console.error('[Encryption] JSON decrypt failed:', error);
    throw new Error('JSON decryption failed: ' + error.message);
  }
}

/**
 * Get current encryption configuration
 * @returns {Object} Current encryption config
 */
export function getEncryptionConfig() {
  return { ...encryptionConfig };
}

/**
 * Check if encryption is enabled
 * @returns {boolean} True if encryption is enabled
 */
export function isEncryptionEnabled() {
  return encryptionConfig.enabled;
}

export default {
  initEncryption,
  encrypt,
  decrypt,
  encryptJSON,
  decryptJSON,
  getEncryptionConfig,
  isEncryptionEnabled,
};

