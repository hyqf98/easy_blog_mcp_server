import path from 'path';
import fs from 'fs';
import {
  PlatformConfig,
  ArticleRequest,
  ArticleResponse,
  ArticleListItem,
  ImageUploadResponse,
  StrategyMetadata,
  ProcessImagesResult,
  ImageReplaceResult,
} from '../types/index.js';
import { extractImagePaths, replaceImagePaths } from '../utils/markdown.js';

export abstract class BaseBlogStrategy {
  abstract name: string;
  protected config: PlatformConfig | undefined;
  protected runtimeConfig: PlatformConfig | undefined;

  setCredentials(config: PlatformConfig): void {
    this.config = config;
  }

  setRuntimeConfig(config: PlatformConfig | undefined): void {
    this.runtimeConfig = config;
  }

  protected ensureConfig(): PlatformConfig {
    const cfg = this.runtimeConfig || this.config;
    if (!cfg) {
      throw new Error(`${this.name} 未配置，请通过工具参数传入 cookie 或先使用 set_platform_config 设置`);
    }
    return cfg;
  }

  abstract getMetadata(): StrategyMetadata;
  abstract publishArticle(req: ArticleRequest): Promise<ArticleResponse>;
  abstract getArticleList(page?: number, pageSize?: number): Promise<ArticleListItem[]>;
  abstract getArticleDetail(articleId: string): Promise<ArticleRequest>;
  abstract updateArticle(articleId: string, req: ArticleRequest): Promise<ArticleResponse>;
  abstract deleteArticle(articleId: string): Promise<boolean>;
  abstract uploadImage(filePath: string): Promise<ImageUploadResponse>;
  abstract uploadImageFromUrl(url: string): Promise<ImageUploadResponse>;

  async processAndUploadImages(
    content: string,
    baseDir?: string,
  ): Promise<ProcessImagesResult> {
    const images = extractImagePaths(content);
    const localImages = images.filter((img) => img.isLocal);
    const uploadedImages: ImageReplaceResult[] = [];
    const mapping = new Map<string, string>();

    for (const img of localImages) {
      try {
        const resolvedPath = baseDir
          ? path.resolve(baseDir, img.original)
          : path.resolve(img.original);

        if (!fs.existsSync(resolvedPath)) {
          uploadedImages.push({
            original: img.original,
            uploadedUrl: '',
            success: false,
            message: `文件不存在: ${resolvedPath}`,
          });
          continue;
        }

        const result = await this.uploadImage(resolvedPath);
        if (result.success && result.url) {
          mapping.set(img.original, result.url);
          uploadedImages.push({
            original: img.original,
            uploadedUrl: result.url,
            success: true,
          });
        } else {
          uploadedImages.push({
            original: img.original,
            uploadedUrl: '',
            success: false,
            message: result.message || '上传失败',
          });
        }
      } catch (error: any) {
        uploadedImages.push({
          original: img.original,
          uploadedUrl: '',
          success: false,
          message: error.message,
        });
      }
    }

    const processedContent =
      mapping.size > 0 ? replaceImagePaths(content, mapping) : content;

    return { content: processedContent, uploadedImages };
  }
}
