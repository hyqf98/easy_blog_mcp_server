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
import { httpGet, httpPost } from '../utils/http.js';
import { readImageFile, downloadImageToBuffer, getFileExtension, getMimeType } from '../utils/image.js';

const JUEJIN_API = {
  CREATE_DRAFT: 'https://api.juejin.cn/content_api/v1/article_draft/create',
  PUBLISH: 'https://api.juejin.cn/content_api/v1/article/publish',
  ARTICLE_LIST: 'https://api.juejin.cn/content_api/v1/article/query_list',
  ARTICLE_DETAIL: 'https://api.juejin.cn/content_api/v1/article/detail',
  UPDATE: 'https://api.juejin.cn/content_api/v1/article/update',
  DELETE: 'https://api.juejin.cn/content_api/v1/article/delete',
  UPLOAD_IMAGE: 'https://api.juejin.cn/upload_api/v1/image/upload',
};

export class JuejinStrategy extends BaseBlogStrategy {
  name = 'juejin';

  getMetadata(): StrategyMetadata {
    return {
      platform: 'juejin',
      platformLabel: '掘金',
      publishParams: [
        {
          key: 'tag_ids',
          label: '标签ID列表',
          required: true,
          type: 'string[]',
          description: '掘金标签ID数组，如 ["6809640408797167623"]。'
            + '前端: 6809640408797167623, 后端: 6809637769959178254, Android: 6809635626879549448, iOS: 6809635626879563271, '
            + '人工智能: 6809637771511044104, 开发工具: 6809635627016548359, 代码人生: 6809637773939011591, 阅读: 6809635626879571975',
        },
        {
          key: 'category_id',
          label: '分类ID',
          required: false,
          type: 'string',
          description: '掘金分类ID。后端: 6809637769959178254, 前端: 6809635626879571975',
          defaultValue: '6809637769959178254',
        },
        {
          key: 'column_ids',
          label: '专栏ID列表',
          required: false,
          type: 'string[]',
          description: '关联的掘金专栏ID数组',
        },
        {
          key: 'theme_ids',
          label: '主题ID列表',
          required: false,
          type: 'string[]',
          description: '关联的掘金主题ID数组',
        },
      ],
      updateParams: [
        {
          key: 'tag_ids',
          label: '标签ID列表',
          required: false,
          type: 'string[]',
          description: '掘金标签ID数组（更新时可不传，保留原标签）',
        },
        {
          key: 'category_id',
          label: '分类ID',
          required: false,
          type: 'string',
          description: '掘金分类ID',
        },
      ],
    };
  }

  private getHeaders(): Record<string, string> {
    const config = this.ensureConfig();
    return {
      'Cookie': config.cookie,
      'content-type': 'application/json',
      'accept': '*/*',
    };
  }

  async publishArticle(req: ArticleRequest): Promise<ArticleResponse> {
    try {
      const extra = req.extraParams || {};
      const draftBody = {
        title: req.title,
        brief_content: req.description || req.content.substring(0, 100),
        mark_content: req.content,
        edit_type: 10,
        html_content: 'deprecated',
        tag_ids: extra.tag_ids || req.tags || ['6809640408797167623'],
        category_id: extra.category_id || '6809637769959178254',
      };

      const { status: draftStatus, data: draftData } = await httpPost(
        JUEJIN_API.CREATE_DRAFT,
        draftBody,
        { headers: this.getHeaders() }
      );

      if (draftStatus !== 200 || draftData.err_no !== 0) {
        return {
          success: false,
          message: draftData.err_msg || '创建草稿失败',
        };
      }

      const draftId = draftData.data?.id;

      const publishBody = {
        draft_id: draftId,
        sync_to_org: false,
        column_ids: extra.column_ids || [],
        theme_ids: extra.theme_ids || [],
      };

      const { status: pubStatus, data: pubData } = await httpPost(
        JUEJIN_API.PUBLISH,
        publishBody,
        { headers: this.getHeaders() }
      );

      if (pubStatus !== 200 || pubData.err_no !== 0) {
        return {
          success: false,
          message: pubData.err_msg || '发布失败',
        };
      }

      const articleId = pubData.data?.article_id;
      return {
        success: true,
        id: articleId,
        url: `https://juejin.cn/post/${articleId}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async getArticleList(page: number = 1, pageSize: number = 20): Promise<ArticleListItem[]> {
    const body = {
      sort_type: 2,
      cursor: ((page - 1) * pageSize).toString(),
      count: pageSize,
    };

    const { status, data } = await httpPost(JUEJIN_API.ARTICLE_LIST, body, {
      headers: this.getHeaders(),
    });

    if (status !== 200 || data.err_no !== 0) {
      throw new Error(data.err_msg || '获取文章列表失败');
    }

    return (data.data || []).map((item: any) => ({
      id: item.article_id,
      title: item.article_info?.title || '',
      url: `https://juejin.cn/post/${item.article_id}`,
      createdAt: new Date(parseInt(item.article_info?.ctime) * 1000).toISOString(),
      viewCount: item.article_info?.view_count,
      status: 'published',
    }));
  }

  async getArticleDetail(articleId: string): Promise<ArticleRequest> {
    const { status, data } = await httpPost(
      JUEJIN_API.ARTICLE_DETAIL,
      { article_id: articleId },
      { headers: this.getHeaders() }
    );

    if (status !== 200 || data.err_no !== 0) {
      throw new Error(data.err_msg || '获取文章详情失败');
    }

    const articleInfo = data.data?.article_info;
    return {
      title: articleInfo?.title || '',
      content: articleInfo?.mark_content || articleInfo?.mark_content_v2 || '',
      description: articleInfo?.brief_content,
    };
  }

  async updateArticle(articleId: string, req: ArticleRequest): Promise<ArticleResponse> {
    try {
      const extra = req.extraParams || {};
      const body: any = {
        article_id: articleId,
        title: req.title,
        brief_content: req.description || req.content.substring(0, 100),
        mark_content: req.content,
        edit_type: 10,
        html_content: 'deprecated',
        tag_ids: extra.tag_ids || req.tags || ['6809640408797167623'],
        category_id: extra.category_id || '6809637769959178254',
      };

      const { status, data } = await httpPost(JUEJIN_API.UPDATE, body, {
        headers: this.getHeaders(),
      });

      if (status !== 200 || data.err_no !== 0) {
        return {
          success: false,
          message: data.err_msg || '更新失败',
        };
      }

      return {
        success: true,
        id: articleId,
        url: `https://juejin.cn/post/${articleId}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async deleteArticle(articleId: string): Promise<boolean> {
    const { status, data } = await httpPost(
      JUEJIN_API.DELETE,
      { article_id: articleId },
      { headers: this.getHeaders() }
    );

    return status === 200 && data.err_no === 0;
  }

  async uploadImage(filePath: string): Promise<ImageUploadResponse> {
    try {
      const buffer = readImageFile(filePath);
      const ext = getFileExtension(filePath);
      const mimeType = getMimeType(ext);

      const form = new FormData();
      form.append('file', buffer, {
        filename: `image${ext}`,
        contentType: mimeType,
      });

      const config = this.ensureConfig();
      const { status, data } = await httpPost(JUEJIN_API.UPLOAD_IMAGE, form, {
        headers: {
          'Cookie': config.cookie,
          ...form.getHeaders(),
        },
      });

      if (status === 200 && data.err_no === 0) {
        return {
          success: true,
          url: data.data?.url || data.data?.image_url,
        };
      }

      return {
        success: false,
        message: data.err_msg || '上传失败',
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
      const mimeType = getMimeType(ext);

      const form = new FormData();
      form.append('file', buffer, {
        filename: `image${ext}`,
        contentType: mimeType,
      });

      const config = this.ensureConfig();
      const { status, data } = await httpPost(JUEJIN_API.UPLOAD_IMAGE, form, {
        headers: {
          'Cookie': config.cookie,
          ...form.getHeaders(),
        },
      });

      if (status === 200 && data.err_no === 0) {
        return {
          success: true,
          url: data.data?.url || data.data?.image_url,
        };
      }

      return {
        success: false,
        message: data.err_msg || '上传失败',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
