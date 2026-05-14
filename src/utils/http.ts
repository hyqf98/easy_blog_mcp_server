import axios, { AxiosRequestConfig, AxiosResponse, ResponseType } from 'axios';

export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  responseType?: ResponseType;
}

export async function httpGet<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<{ status: number; data: T }> {
  const config: AxiosRequestConfig = {
    method: 'GET',
    url,
    headers: options.headers || {},
    timeout: options.timeout || 30000,
    responseType: options.responseType || 'json',
  };
  const response: AxiosResponse<T> = await axios(config);
  return { status: response.status, data: response.data };
}

export async function httpPost<T = any>(
  url: string,
  data: any,
  options: RequestOptions = {}
): Promise<{ status: number; data: T }> {
  const config: AxiosRequestConfig = {
    method: 'POST',
    url,
    data,
    headers: options.headers || {},
    timeout: options.timeout || 30000,
  };
  const response: AxiosResponse<T> = await axios(config);
  return { status: response.status, data: response.data };
}

export async function httpPut<T = any>(
  url: string,
  data: any,
  options: RequestOptions = {}
): Promise<{ status: number; data: T }> {
  const config: AxiosRequestConfig = {
    method: 'PUT',
    url,
    data,
    headers: options.headers || {},
    timeout: options.timeout || 30000,
  };
  const response: AxiosResponse<T> = await axios(config);
  return { status: response.status, data: response.data };
}

export async function httpPatch<T = any>(
  url: string,
  data: any,
  options: RequestOptions = {}
): Promise<{ status: number; data: T }> {
  const config: AxiosRequestConfig = {
    method: 'PATCH',
    url,
    data,
    headers: options.headers || {},
    timeout: options.timeout || 30000,
  };
  const response: AxiosResponse<T> = await axios(config);
  return { status: response.status, data: response.data };
}

export async function httpDelete<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<{ status: number; data: T }> {
  const config: AxiosRequestConfig = {
    method: 'DELETE',
    url,
    headers: options.headers || {},
    timeout: options.timeout || 30000,
  };
  const response: AxiosResponse<T> = await axios(config);
  return { status: response.status, data: response.data };
}
