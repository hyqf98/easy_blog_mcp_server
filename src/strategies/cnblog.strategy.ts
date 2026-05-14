import FormData from 'form-data';
import { BaseBlogStrategy } from './base.strategy.js';
import {
  PlatformConfig,
  ArticleRequest,
  ArticleResponse,
  ArticleListItem,
  ImageUploadResponse,
  StrategyMetadata,
} from '../types/index.js';
import { httpGet, httpPost, httpPatch, httpDelete } from '../utils/http.js';
import { readImageFile, downloadImageToBuffer, getFileExtension, getMimeType } from '../utils/image.js';

const CNBLOG_API = {
  POSTS: 'https://i.cnblogs.com/api/posts',
  UPLOAD_IMAGE: 'https://upload.cnblogs.com/imageuploader/processupload',
};

export class CnblogStrategy extends BaseBlogStrategy {
  name = 'cnblog';

  getMetadata(): StrategyMetadata {
    return {
      platform: 'cnblog',
      platformLabel: '博客园',
      publishParams: [
        {
          key: 'accessPermission',
          label: '访问权限',
          required: false,
          type: 'number',
          description: '0=公开, 1=仅登录用户可见, 2=仅自己可见',
          defaultValue: 0,
        },
        {
          key: 'inSiteCandidate',
          label: '候选首页',
          required: false,
          type: 'boolean',
          description: '是否入选博客园首页候选',
          defaultValue: false,
        },
        {
          key: 'inSiteHome',
          label: '发布到首页',
          required: false,
          type: 'boolean',
          description: '是否发布到博客园首页',
          defaultValue: false,
        },
        {
          key: 'isAllowComments',
          label: '允许评论',
          required: false,
          type: 'boolean',
          description: '是否允许评论',
          defaultValue: true,
        },
        {
          key: 'displayOnHomePage',
          label: '显示在个人首页',
          required: false,
          type: 'boolean',
          description: '是否显示在个人博客首页',
          defaultValue: true,
        },
      ],
      updateParams: [
        {
          key: 'accessPermission',
          label: '访问权限',
          required: false,
          type: 'number',
          description: '0=公开, 1=仅登录用户可见, 2=仅自己可见',
        },
        {
          key: 'isAllowComments',
          label: '允许评论',
          required: false,
          type: 'boolean',
          description: '是否允许评论',
        },
      ],
    };
  }

  private getHeaders(): Record<string, string> {
    const config = this.ensureConfig();
    const headers: Record<string, string> = {
      'Cookie': config.cookie,
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json',
    };
    if (config.token) {
      headers['x-xsrf-token'] = config.token;
    }
    return headers;
  }

  async publishArticle(req: ArticleRequest): Promise<ArticleResponse> {
    const extra = req.extraParams || {};
    const body = {
      title: req.title,
      postBody: req.content,
      postType: 2,
      accessPermission: extra.accessPermission ?? 0,
      inSiteCandidate: extra.inSiteCandidate ?? false,
      inSiteHome: extra.inSiteHome ?? false,
      isPublished: req.status !== 'draft',
      displayOnHomePage: extra.displayOnHomePage ?? true,
      isAllowComments: extra.isAllowComments ?? true,
      includeInMainSyndication: true,
      isPinned: false,
      showBodyWhenPinned: false,
      isOnlyForRegisterUser: false,
      isUpdateDateAdded: true,
      isMarkdown: true,
      isDraft: req.status === 'draft',
      changePostType: false,
      removeScript: false,
      changeCreatedTime: false,
      canChangeCreatedTime: false,
      isContributeToImpressiveBugActivity: false,
      usingEditorId: 5,
      tags: req.tags || [],
    };

    const { status, data } = await httpPost(CNBLOG_API.POSTS, body, {
      headers: this.getHeaders(),
    });

    if (status !== 201 && status !== 200) {
      return {
        success: false,
        message: data.errors?.join(', ') || '发布失败',
      };
    }

    if (data.errors && data.errors.length > 0) {
      return {
        success: false,
        message: data.errors.join(', '),
      };
    }

    return {
      success: true,
      id: data.id?.toString(),
      url: data.url || `https://www.cnblogs.com/p/${data.id}`,
    };
  }

  async getArticleList(page: number = 1, pageSize: number = 20): Promise<ArticleListItem[]> {
    const { status, data } = await httpGet(
      `${CNBLOG_API.POSTS}?pageIndex=${page}&pageSize=${pageSize}`,
      { headers: this.getHeaders() }
    );

    if (status !== 200) {
      throw new Error('获取文章列表失败');
    }

    return (data || []).map((item: any) => ({
      id: item.id?.toString(),
      title: item.title || '',
      url: item.url || `https://www.cnblogs.com/p/${item.id}`,
      createdAt: item.datePublished || item.createdAt,
      viewCount: item.viewCount,
      status: item.isPublished ? 'published' : 'draft',
    }));
  }

  async getArticleDetail(articleId: string): Promise<ArticleRequest> {
    const { status, data } = await httpGet(
      `${CNBLOG_API.POSTS}/${articleId}`,
      { headers: this.getHeaders() }
    );

    if (status !== 200) {
      throw new Error('获取文章详情失败');
    }

    return {
      title: data.title || '',
      content: data.postBody || data.body || '',
      description: data.description,
      tags: data.tags || [],
    };
  }

  async updateArticle(articleId: string, req: ArticleRequest): Promise<ArticleResponse> {
    const extra = req.extraParams || {};
    const body: any = {
      title: req.title,
      postBody: req.content,
      isMarkdown: true,
    };

    if (req.tags) {
      body.tags = req.tags;
    }
    if (req.status) {
      body.isDraft = req.status === 'draft';
      body.isPublished = req.status !== 'draft';
    }
    if (extra.accessPermission !== undefined) {
      body.accessPermission = extra.accessPermission;
    }
    if (extra.isAllowComments !== undefined) {
      body.isAllowComments = extra.isAllowComments;
    }

    const { status, data } = await httpPatch(
      `${CNBLOG_API.POSTS}/${articleId}`,
      body,
      { headers: this.getHeaders() }
    );

    if (status !== 200) {
      return {
        success: false,
        message: data.errors?.join(', ') || '更新失败',
      };
    }

    return {
      success: true,
      id: articleId,
      url: data.url || `https://www.cnblogs.com/p/${articleId}`,
    };
  }

  async deleteArticle(articleId: string): Promise<boolean> {
    const { status } = await httpDelete(
      `${CNBLOG_API.POSTS}/${articleId}`,
      { headers: this.getHeaders() }
    );

    return status === 200 || status === 204;
  }

  async uploadImage(filePath: string): Promise<ImageUploadResponse> {
    try {
      const buffer = readImageFile(filePath);
      const ext = getFileExtension(filePath);

      const form = new FormData();
      form.append('image', buffer, {
        filename: `image${ext}`,
        contentType: getMimeType(ext),
      });

      const config = this.ensureConfig();
      const headers: Record<string, string> = {
        'Cookie': config.cookie,
        ...form.getHeaders(),
      };
      if (config.token) {
        headers['x-xsrf-token'] = config.token;
      }

      const { status, data } = await httpPost(CNBLOG_API.UPLOAD_IMAGE, form, {
        headers,
      });

      if (status === 200 && data.success) {
        return {
          success: true,
          url: data.url || data.imageUrl,
        };
      }

      return {
        success: false,
        message: data.message || '上传失败',
      };
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
      const ext = getFileExtension(url) || '.png';

      const form = new FormData();
      form.append('image', buffer, {
        filename: `image${ext}`,
        contentType: getMimeType(ext),
      });

      const config = this.ensureConfig();
      const headers: Record<string, string> = {
        'Cookie': config.cookie,
        ...form.getHeaders(),
      };
      if (config.token) {
        headers['x-xsrf-token'] = config.token;
      }

      const { status, data } = await httpPost(CNBLOG_API.UPLOAD_IMAGE, form, {
        headers,
      });

      if (status === 200 && data.success) {
        return {
          success: true,
          url: data.url || data.imageUrl,
        };
      }

      return {
        success: false,
        message: data.message || '上传失败',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
