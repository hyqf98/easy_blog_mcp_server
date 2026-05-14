import fs from 'fs';
import path from 'path';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { ImageReference } from '../types/index.js';

export function readMarkdownFile(filePath: string): string {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`文件不存在: ${resolvedPath}`);
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  if (ext !== '.md' && ext !== '.markdown') {
    throw new Error(`不是Markdown文件: ${resolvedPath}`);
  }

  return fs.readFileSync(resolvedPath, 'utf-8');
}

export function extractTitle(content: string, filePath?: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }
  if (filePath) {
    return path.basename(filePath, path.extname(filePath));
  }
  return 'Untitled';
}

export function extractDescription(content: string, maxLength: number = 200): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('!') && !trimmed.startsWith('[')) {
      if (trimmed.length > maxLength) {
        return trimmed.substring(0, maxLength) + '...';
      }
      return trimmed;
    }
  }
  return '';
}

export function extractImagePaths(content: string): ImageReference[] {
  const images: ImageReference[] = [];
  const seen = new Set<string>();

  const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdImageRegex.exec(content)) !== null) {
    const imagePath = match[2].trim();
    if (!seen.has(imagePath)) {
      seen.add(imagePath);
      images.push({
        original: imagePath,
        isLocal: isLocalPath(imagePath),
      });
    }
  }

  const htmlImgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlImgRegex.exec(content)) !== null) {
    const imagePath = match[1].trim();
    if (!seen.has(imagePath)) {
      seen.add(imagePath);
      images.push({
        original: imagePath,
        isLocal: isLocalPath(imagePath),
      });
    }
  }

  return images;
}

export function replaceImagePaths(
  content: string,
  mapping: Map<string, string>
): string {
  let result = content;

  for (const [original, replacement] of mapping) {
    const escapedOriginal = escapeRegExp(original);
    const mdRegex = new RegExp(`(\\!\\[[^\\]]*\\]\\()${escapedOriginal}(\\))`, 'g');
    result = result.replace(mdRegex, `$1${replacement}$2`);

    const htmlRegex = new RegExp(`(<img[^>]+src=["'])${escapedOriginal}(["'][^>]*>)`, 'gi');
    result = result.replace(htmlRegex, `$1${replacement}$2`);
  }

  return result;
}

function isLocalPath(imagePath: string): boolean {
  if (
    imagePath.startsWith('http://') ||
    imagePath.startsWith('https://') ||
    imagePath.startsWith('//') ||
    imagePath.startsWith('data:')
  ) {
    return false;
  }
  return true;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
