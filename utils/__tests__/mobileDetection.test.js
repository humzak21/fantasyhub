import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isMobileDevice, getMobileDeviceInfo } from '../mobileDetection.js';

// Mock window and navigator objects
const mockWindow = {
  innerWidth: 1024,
  innerHeight: 768,
  devicePixelRatio: 1,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
};

const mockNavigator = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  maxTouchPoints: 0,
  platform: 'Win32'
};

describe('Mobile Detection Utilities', () => {
  beforeEach(() => {
    // Reset mocks
    global.window = mockWindow;
    global.navigator = mockNavigator;
    
    // Reset window properties
    mockWindow.innerWidth = 1024;
    mockWindow.innerHeight = 768;
    mockWindow.devicePixelRatio = 1;
    
    // Reset navigator properties
    mockNavigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    mockNavigator.maxTouchPoints = 0;
    mockNavigator.platform = 'Win32';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isMobileDevice', () => {
    it('should return false for desktop user agent and large screen', () => {
      expect(isMobileDevice()).toBe(false);
    });

    it('should return true for mobile user agent', () => {
      mockNavigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)';
      expect(isMobileDevice()).toBe(true);
    });

    it('should return true for Android user agent', () => {
      mockNavigator.userAgent = 'Mozilla/5.0 (Linux; Android 10; SM-G975F)';
      expect(isMobileDevice()).toBe(true);
    });

    it('should return true for small screen with touch support', () => {
      mockWindow.innerWidth = 375;
      mockNavigator.maxTouchPoints = 5;
      expect(isMobileDevice()).toBe(true);
    });

    it('should return false for small screen without touch support', () => {
      mockWindow.innerWidth = 375;
      mockNavigator.maxTouchPoints = 0;
      expect(isMobileDevice()).toBe(false);
    });
  });

  describe('getMobileDeviceInfo', () => {
    it('should return correct device info for desktop', () => {
      const deviceInfo = getMobileDeviceInfo();
      
      expect(deviceInfo).toEqual({
        isMobile: false,
        isTouch: false,
        userAgent: mockNavigator.userAgent,
        screenWidth: 1024,
        screenHeight: 768,
        devicePixelRatio: 1,
        orientation: 'landscape',
        platform: 'Win32',
        isIOS: false,
        isAndroid: false,
        isSafari: false,
        isChrome: false,
        isFirefox: false
      });
    });

    it('should detect iOS device correctly', () => {
      mockNavigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1';
      mockNavigator.maxTouchPoints = 5;
      mockWindow.innerWidth = 375;
      mockWindow.innerHeight = 812;
      
      const deviceInfo = getMobileDeviceInfo();
      
      expect(deviceInfo.isMobile).toBe(true);
      expect(deviceInfo.isIOS).toBe(true);
      expect(deviceInfo.isAndroid).toBe(false);
      expect(deviceInfo.isSafari).toBe(true);
      expect(deviceInfo.orientation).toBe('portrait');
    });

    it('should detect Android device correctly', () => {
      mockNavigator.userAgent = 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36';
      mockNavigator.maxTouchPoints = 5;
      mockWindow.innerWidth = 360;
      mockWindow.innerHeight = 740;
      
      const deviceInfo = getMobileDeviceInfo();
      
      expect(deviceInfo.isMobile).toBe(true);
      expect(deviceInfo.isIOS).toBe(false);
      expect(deviceInfo.isAndroid).toBe(true);
      expect(deviceInfo.isChrome).toBe(true);
      expect(deviceInfo.orientation).toBe('portrait');
    });
  });
});
