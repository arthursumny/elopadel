import { vi } from 'vitest';

(globalThis as any).__DEV__ = true;

const mockStorage = new Map<string, string>();

vi.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: vi.fn(),
  openAuthSessionAsync: vi.fn().mockResolvedValue({ type: 'dismiss' }),
}));

vi.mock('expo-linking', () => ({
  createURL: vi.fn((path: string) => `exp://192.168.1.11:8081/--/${path}`),
  parse: vi.fn((url: string) => {
    const [baseUrl, queryStr] = url.split('?');
    const queryParams: Record<string, string> = {};
    if (queryStr) {
      new URLSearchParams(queryStr).forEach((val, key) => {
        queryParams[key] = val;
      });
    }
    return {
      path: 'auth-callback',
      queryParams,
    };
  }),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  getInitialURL: vi.fn().mockImplementation(() => Promise.resolve(null)),
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockStorage.get(key) || null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockStorage.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mockStorage.delete(key);
  }),
}));

vi.mock('expo-constants', () => ({
  default: {
    deviceName: 'Test Phone',
    expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'test-project-id' } } },
  },
}));

vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn().mockResolvedValue({}),
  getPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: vi.fn().mockResolvedValue({ data: 'ExponentPushToken[mock-token]' }),
  getLastNotificationResponseAsync: vi.fn().mockResolvedValue(null),
  addNotificationReceivedListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  addNotificationResponseReceivedListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  AndroidImportance: {
    MAX: 5,
    HIGH: 4,
    DEFAULT: 3,
  },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    navigate: vi.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => ['(tabs)'],
  usePathname: () => '/lobby',
}));
