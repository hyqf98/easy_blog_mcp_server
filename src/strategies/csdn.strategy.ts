import FormData from 'form-data';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { BaseBlogStrategy } from './base.strategy.js';
import {
  PlatformConfig,
  ArticleRequest,
  ArticleResponse,
  ArticleListItem,
  ImageUploadResponse,
  StrategyMetadata,
} from '../types/index.js';
import { httpGet, httpPost } from '../utils/http.js';
import { readImageFile, downloadImageToBuffer, getFileExtension, getMimeType } from '../utils/image.js';

const CSDN_API = {
  SAVE_ARTICLE: 'https://bizapi.csdn.net/blog-console-api/v3/mdeditor/saveArticle',
  GET_ARTICLE: 'https://bizapi.csdn.net/blog-console-api/v3/mdeditor/getArticle',
  DELETE_ARTICLE: 'https://bizapi.csdn.net/blog/phoenix/console/v1/article/del',
  GET_UPLOAD_SIGNATURE: 'https://bizapi.csdn.net/resource-api/v1/image/direct/upload/signature',
  OSS_HOST: 'https://csdn-img-blog.obs.cn-north-4.myhuaweicloud.com',
};

const CSDN_DEFAULT_APP_KEY = '260196572';
const CSDN_DEFAULT_APP_SECRET = 't5PaqxVQpWoHgLGt7XPIvd5ipJcwJTU7';

export class CsdnStrategy extends BaseBlogStrategy {
  name = 'csdn';

  getMetadata(): StrategyMetadata {
    return {
      platform: 'csdn',
      platformLabel: 'CSDN',
      publishParams: [
        {
          key: 'readType',
          label: '阅读类型',
          required: false,
          type: 'string',
          description: 'public=公开, private=私有, read_need_pay=付费阅读, read_need_vip=VIP可见',
          defaultValue: 'public',
        },
        {
          key: 'type',
          label: '文章类型',
          required: false,
          type: 'string',
          description: 'original=原创, reproduced=转载, translated=翻译',
          defaultValue: 'original',
        },
        {
          key: 'categories',
          label: '分类列表',
          required: false,
          type: 'string[]',
          description: '文章分类名称列表，如 ["后端", "Java"]',
        },
        {
          key: 'original_link',
          label: '转载原文链接',
          required: false,
          type: 'string',
          description: '当文章类型为转载(reproduced)时需要填写原文链接',
        },
      ],
      updateParams: [
        {
          key: 'readType',
          label: '阅读类型',
          required: false,
          type: 'string',
          description: 'public=公开, private=私有',
          defaultValue: 'public',
        },
        {
          key: 'type',
          label: '文章类型',
          required: false,
          type: 'string',
          description: 'original=原创, reproduced=转载, translated=翻译',
          defaultValue: 'original',
        },
        {
          key: 'categories',
          label: '分类列表',
          required: false,
          type: 'string[]',
          description: '文章分类名称列表',
        },
      ],
    };
  }

  private getAppKey(): string {
    return this.config?.appKey || CSDN_DEFAULT_APP_KEY;
  }

  private getAppSecret(): string {
    return this.config?.appSecret || CSDN_DEFAULT_APP_SECRET;
  }

  private generateSign(method: string, url: string, contentType: string = 'application/json;charset=UTF-8'): { nonce: string; timestamp: string; signature: string } {
    const nonce = this.createUuid();
    const timestamp = Date.now().toString();
    
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const query = urlObj.search ? urlObj.search.substring(1) : '';
    
    let stringToSign = '';
    stringToSign += method + '\n';
    stringToSign += 'application/json, text/plain, */*\n';
    stringToSign += '\n';
    stringToSign += contentType + '\n';
    stringToSign += '\n';
    stringToSign += 'x-ca-key:' + this.getAppKey() + '\n';
    stringToSign += 'x-ca-nonce:' + nonce + '\n';
    stringToSign += 'x-ca-timestamp:' + timestamp + '\n';
    stringToSign += path;
    if (query) {
      stringToSign += '?' + query;
    }
    
    const hmac = crypto.createHmac('sha256', this.getAppSecret());
    hmac.update(stringToSign);
    const signature = hmac.digest('base64');
    
    return { nonce, timestamp, signature };
  }

  private createUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private getHeaders(method: string = 'GET', url: string = '', contentType: string = 'application/json;charset=UTF-8'): Record<string, string> {
    const config = this.ensureConfig();
    const { nonce, timestamp, signature } = this.generateSign(method, url, contentType);
    
    return {
      'Cookie': config.cookie,
      'content-type': contentType,
      'accept': 'application/json, text/plain, */*',
      'Referer': 'https://editor.csdn.net/',
      'Origin': 'https://editor.csdn.net',
      'x-ca-key': this.getAppKey(),
      'x-ca-nonce': nonce,
      'x-ca-timestamp': timestamp,
      'x-ca-signature': signature,
      'x-ca-signature-headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
    };
  }

  async publishArticle(req: ArticleRequest): Promise<ArticleResponse> {
    const extra = req.extraParams || {};
    const body = {
      title: req.title,
      description: req.description || req.content.substring(0, 100),
      markdowncontent: req.content,
      content: req.content,
      tags: req.tags?.join(',') || '后端',
      readType: extra.readType || 'public',
      type: extra.type || 'original',
      source: 'pc_mdeditor',
      notAutoSaved: '1',
      coverType: 1,
      isNew: 1,
      status: req.status === 'draft' ? 0 : 0,
      level: 0,
      categories: req.categories?.join(',') || extra.categories?.join(',') || '',
      original_link: extra.original_link || '',
      resourceId: '',
      voteId: 0,
      syncGitCode: 0,
      coverImages: req.coverImage ? [req.coverImage] : [],
      authorizedStatus: false,
    };

    const { status, data } = await httpPost(CSDN_API.SAVE_ARTICLE, body, {
      headers: this.getHeaders('POST', CSDN_API.SAVE_ARTICLE),
    });

    if (status !== 200 || data.code !== 200) {
      return {
        success: false,
        message: data.msg || data.message || '发布失败',
      };
    }

    return {
      success: true,
      id: data.data?.id?.toString(),
      url: data.data?.url,
    };
  }

  async getArticleList(page: number = 1, pageSize: number = 20): Promise<ArticleListItem[]> {
    const config = this.ensureConfig();
    const username = this.extractUsername(config.cookie);
    
    if (!username) {
      throw new Error('无法从Cookie中获取用户名，请确保Cookie包含UserName字段');
    }

    const pageUrl = page === 1 
      ? `https://blog.csdn.net/${username}`
      : `https://blog.csdn.net/${username}/article/list/${page}`;

    const { status, data: html } = await httpGet(pageUrl, {
      headers: {
        'Cookie': config.cookie,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      responseType: 'text',
    });

    if (status !== 200) {
      throw new Error('获取文章列表页面失败');
    }

    const $ = cheerio.load(html as string);
    const articles: ArticleListItem[] = [];

    $('article').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a').first();
      const title = $el.find('h4').first().text().trim();
      const url = link.attr('href') || '';
      
      if (title && url) {
        const articleId = url.match(/\/article\/details\/(\d+)/)?.[1] || '';
        articles.push({
          id: articleId,
          title,
          url,
          createdAt: '',
          status: 'published',
        });
      }
    });

    return articles.slice(0, pageSize);
  }

  private extractUsername(cookie: string): string | null {
    const match = cookie.match(/UserName=([^;]+)/);
    return match ? match[1] : null;
  }

  async getArticleDetail(articleId: string): Promise<ArticleRequest> {
    const { status, data } = await httpGet(
      `${CSDN_API.GET_ARTICLE}?articleId=${articleId}`,
      { headers: this.getHeaders('GET', `${CSDN_API.GET_ARTICLE}?articleId=${articleId}`) }
    );

    if (status !== 200 || data.code !== 200) {
      throw new Error(data.msg || '获取文章详情失败');
    }

    return {
      title: data.data?.title || '',
      content: data.data?.markdowncontent || data.data?.content || '',
      description: data.data?.description,
      tags: data.data?.tags?.split(','),
      categories: data.data?.categories?.split(','),
    };
  }

  async updateArticle(articleId: string, req: ArticleRequest): Promise<ArticleResponse> {
    const extra = req.extraParams || {};
    const body: any = {
      id: articleId,
      title: req.title,
      markdowncontent: req.content,
      content: req.content,
      description: req.description || req.content.substring(0, 100),
      tags: req.tags?.join(',') || '后端',
      categories: req.categories?.join(',') || extra.categories?.join(',') || '',
      status: req.status === 'draft' ? 0 : 0,
      readType: extra.readType || 'public',
      type: extra.type || 'original',
      source: 'pc_mdeditor',
    };

    if (req.coverImage) {
      body.coverImages = [req.coverImage];
    }

    const { status, data } = await httpPost(CSDN_API.SAVE_ARTICLE, body, {
      headers: this.getHeaders('POST', CSDN_API.SAVE_ARTICLE),
    });

    if (status !== 200 || data.code !== 200) {
      return {
        success: false,
        message: data.msg || data.message || '更新失败',
      };
    }

    return {
      success: true,
      id: articleId,
      url: data.data?.url,
    };
  }

  async deleteArticle(articleId: string, deep: boolean = false): Promise<boolean> {
    const { status, data } = await httpPost(
      CSDN_API.DELETE_ARTICLE,
      { articleId, deep },
      { headers: this.getHeaders('POST', CSDN_API.DELETE_ARTICLE) }
    );

    return status === 200 && data.code === 200;
  }

  async uploadImage(filePath: string): Promise<ImageUploadResponse> {
    try {
      const buffer = readImageFile(filePath);
      const ext = getFileExtension(filePath).replace('.', '');
      return await this.doUploadImage(buffer, ext);
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async uploadImageFromUrl(url: string): Promise<ImageUploadResponse> {
    try {
      const buffer = await downloadImageToBuffer(url);
      const ext = (getFileExtension(url) || '.png').replace('.', '');
      return await this.doUploadImage(buffer, ext);
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  private async doUploadImage(buffer: Buffer, ext: string): Promise<ImageUploadResponse> {
    const signUrl = CSDN_API.GET_UPLOAD_SIGNATURE;
    const signBody = {
      imageTemplate: 'standard',
      appName: 'direct_blog_markdown',
      imageSuffix: ext,
    };

    const { status: signStatus, data: signData } = await httpPost(
      signUrl,
      signBody,
      { headers: this.getHeaders('POST', signUrl) }
    );

    if (signStatus !== 200 || signData.code !== 200) {
      return {
        success: false,
        message: signData.msg || '获取上传签名失败',
      };
    }

    const {
      accessId, policy, signature: ossSignature,
      host, filePath, callbackUrl, callbackBody, callbackBodyType, customParam,
    } = signData.data;

    const form = new FormData();
    form.append('key', filePath);
    form.append('policy', policy);
    form.append('signature', ossSignature);
    form.append('callbackBody', callbackBody);
    form.append('callbackBodyType', callbackBodyType);
    form.append('callbackUrl', callbackUrl);
    form.append('AccessKeyId', accessId);

    if (customParam) {
      for (const [k, v] of Object.entries(customParam)) {
        form.append(`x:${k}`, String(v));
      }
    }

    form.append('file', buffer, {
      filename: `image.${ext}`,
      contentType: getMimeType(`.${ext}`),
    });

    const ossUrl = host || CSDN_API.OSS_HOST;
    try {
      const { status: ossStatus, data: ossData } = await httpPost<any>(ossUrl, form, {
        headers: {
          ...form.getHeaders(),
          'Referer': 'https://editor.csdn.net/',
        },
        responseType: 'text',
      });

      const result = typeof ossData === 'string' ? JSON.parse(ossData) : ossData;

      if (ossStatus === 200 && result.code === 200) {
        return {
          success: true,
          url: result.data?.imageUrl,
        };
      }

      return {
        success: false,
        message: result.msg || '上传到OSS失败',
      };
    } catch (error: any) {
      const resp = error.response;
      if (resp) {
        const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
        return {
          success: false,
          message: `OSS上传失败(${resp.status}): ${body.substring(0, 200)}`,
        };
      }
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
