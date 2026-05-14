export type Platform = 'csdn' | 'juejin' | 'cnblog';

export interface PlatformConfig {
  cookie: string;
  token?: string;
  [key: string]: any;
}

export interface CsdnConfig extends PlatformConfig {
  cookie: string;
  appKey?: string;
  appSecret?: string;
}

export interface ParamDefinition {
  key: string;
  label: string;
  required: boolean;
  type: 'string' | 'string[]' | 'number' | 'boolean';
  description: string;
  defaultValue?: any;
}

export interface StrategyMetadata {
  platform: Platform;
  platformLabel: string;
  publishParams: ParamDefinition[];
  updateParams: ParamDefinition[];
}

export interface ImageReference {
  original: string;
  isLocal: boolean;
}

export interface ImageReplaceResult {
  original: string;
  uploadedUrl: string;
  success: boolean;
  message?: string;
}

export interface ArticleRequest {
  title: string;
  content: string;
  description?: string;
  tags?: string[];
  categories?: string[];
  coverImage?: string;
  status?: 'draft' | 'publish';
  extraParams?: Record<string, any>;
}

export interface ArticleResponse {
  success: boolean;
  id?: string;
  url?: string;
  message?: string;
}

export interface ArticleListItem {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  viewCount?: number;
  status?: string;
}

export interface ImageUploadResponse {
  success: boolean;
  url?: string;
  message?: string;
}

export interface BatchPublishResult {
  platform: Platform;
  success: boolean;
  url?: string;
  message?: string;
}

export interface ProcessImagesResult {
  content: string;
  uploadedImages: ImageReplaceResult[];
}
