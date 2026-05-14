import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { ImageUploadResponse } from '../types/index.js';
import { httpPost } from './http.js';

/**
 * 读取本地图片文件
 */
export function readImageFile(filePath: string): Buffer {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`文件不存在: ${resolvedPath}`);
  }
  return fs.readFileSync(resolvedPath);
}

/**
 * 从URL下载图片到Buffer
 */
export async function downloadImageToBuffer(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
  });
  return Buffer.from(response.data);
}

/**
 * 下载图片到本地文件
 */
export async function downloadImageToFile(
  url: string,
  savePath: string
): Promise<string> {
  const resolvedPath = path.resolve(savePath);
  const dir = path.dirname(resolvedPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  fs.writeFileSync(resolvedPath, Buffer.from(response.data));
  return resolvedPath;
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

/**
 * 从URL获取文件扩展名
 */
export function getExtensionFromUrl(url: string): string {
  const urlPath = new URL(url).pathname;
  return path.extname(urlPath).toLowerCase() || '.png';
}

/**
 * 获取MIME类型
 */
export function getMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  };
  return mimeMap[ext] || 'image/png';
}
