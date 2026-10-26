import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const AUTH_STORAGE_KEY = 'elo_padel_auth_token';
export const AUTH_TOKEN_KEY = AUTH_STORAGE_KEY;

/**
 * Resolves the backend API base URL with developer-friendly defaults.
 * - Prioritizes EXPO_PUBLIC_API_URL if defined.
 * - Defaults to http://10.0.2.2:3000 on Android Emulator to route to host machine.
 * - Defaults to http://localhost:3000 on iOS Simulator and web.
 */
export function resolveApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.trim() !== '') {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }

  if (typeof Platform !== 'undefined' && Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }

  return 'http://localhost:3000';
}

export function getApiBaseUrl(): string {
  return resolveApiBaseUrl();
}

/**
 * Custom error class for API client failures.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly data: any;
  public readonly isNetworkError: boolean;

  constructor(message: string, status: number = 0, data: any = null, isNetworkError: boolean = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.isNetworkError = isNetworkError;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// In-memory token cache to avoid redundant SecureStore async operations
let inMemoryToken: string | null = null;

/**
 * Retrieves the stored authentication token.
 */
export async function getStoredToken(): Promise<string | null> {
  if (inMemoryToken !== null) {
    return inMemoryToken;
  }

  try {
    const token = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
    inMemoryToken = token;
    return token;
  } catch (error) {
    console.warn('[SecureStore] Failed to read token:', error);
    return null;
  }
}

/**
 * Persists the authentication token to SecureStore and in-memory cache.
 */
export async function setStoredToken(token: string): Promise<void> {
  inMemoryToken = token;
  try {
    await SecureStore.setItemAsync(AUTH_STORAGE_KEY, token);
  } catch (error) {
    console.warn('[SecureStore] Failed to persist token:', error);
  }
}

/**
 * Purges the authentication token from SecureStore and in-memory cache.
 */
export async function clearStoredToken(): Promise<void> {
  inMemoryToken = null;
  try {
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
  } catch (error) {
    console.warn('[SecureStore] Failed to delete token:', error);
  }
}

// Event dispatcher for 401 Unauthorized handling
export type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * Subscribes a listener to 401 Unauthorized events (used by AuthContext).
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

/**
 * Dispatches the 401 Unauthorized event to all registered subscribers.
 */
export function notifyUnauthorized(): void {
  unauthorizedListeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error('[ApiClient] Error in unauthorized listener callback:', err);
    }
  });
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: any;
  headers?: Record<string, string> | HeadersInit;
  params?: Record<string, string | number | boolean | undefined>;
  skipAuth?: boolean;
}

/**
 * Core HTTP request handler.
 */
export async function apiRequest<T = any>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers: customHeaders, params, skipAuth = false, ...restOptions } = options;
  const baseUrl = resolveApiBaseUrl();

  let url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  // Headers initialization supporting both Headers object and Record
  const headersRecord: Record<string, string> = {};

  if (customHeaders) {
    if (customHeaders instanceof Headers) {
      customHeaders.forEach((val: string, key: string) => {
        headersRecord[key] = val;
      });
    } else if (Array.isArray(customHeaders)) {
      customHeaders.forEach(([key, val]) => {
        headersRecord[key] = val;
      });
    } else {
      Object.assign(headersRecord, customHeaders);
    }
  }

  // Automatic Bearer token injection
  if (!skipAuth && !headersRecord['Authorization'] && !headersRecord['authorization']) {
    const token = await getStoredToken();
    if (token) {
      headersRecord['Authorization'] = `Bearer ${token}`;
    }
  }

  // Automatic Accept header
  if (!headersRecord['Accept'] && !headersRecord['accept']) {
    headersRecord['Accept'] = 'application/json';
  }

  // Handle body serialization and Content-Type
  let serializedBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (isFormData) {
      serializedBody = body;
    } else if (typeof body === 'object') {
      if (!headersRecord['Content-Type'] && !headersRecord['content-type']) {
        headersRecord['Content-Type'] = 'application/json';
      }
      serializedBody = JSON.stringify(body);
    } else {
      serializedBody = String(body);
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...restOptions,
      headers: headersRecord,
      body: serializedBody,
    });
  } catch (error: any) {
    throw new ApiError(
      'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.',
      0,
      null,
      true
    );
  }

  // Parse response body
  const contentType = response.headers?.get ? (response.headers.get('content-type') || '') : '';
  let responseData: any = null;
  if (contentType.includes('application/json')) {
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }
  } else {
    try {
      responseData = await response.text();
    } catch {
      responseData = null;
    }
  }

  // Centralized 401 handling
  if (response.status === 401) {
    await clearStoredToken();
    notifyUnauthorized();

    const errorMessage =
      (responseData && typeof responseData === 'object' && (responseData.error || responseData.message)) ||
      'Sessão expirada. Faça login novamente.';

    throw new ApiError(errorMessage, 401, responseData);
  }

  // General HTTP error handling
  if (!response.ok) {
    const errorMessage =
      (responseData && typeof responseData === 'object' && (responseData.error || responseData.message)) ||
      `Erro na requisição (${response.status})`;

    throw new ApiError(errorMessage, response.status, responseData);
  }

  return responseData as T;
}

/**
 * Convenience methods for RESTful actions.
 */
export const apiClient = {
  get: <T = any>(endpoint: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'POST', body }),

  put: <T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'PUT', body }),

  patch: <T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T = any>(endpoint: string, options?: Omit<ApiRequestOptions, 'method'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),
};
