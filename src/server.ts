import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { configManager } from './config/index.js';
import { BaseBlogStrategy } from './strategies/base.strategy.js';
import { CsdnStrategy } from './strategies/csdn.strategy.js';
import { JuejinStrategy } from './strategies/juejin.strategy.js';
import { CnblogStrategy } from './strategies/cnblog.strategy.js';
import { Platform, PlatformConfig, ArticleRequest, BatchPublishResult } from './types/index.js';
import { readMarkdownFile, extractTitle, extractDescription } from './utils/markdown.js';
import { downloadImageToFile } from './utils/image.js';

const strategies: Map<string, BaseBlogStrategy> = new Map();

function initStrategies() {
  const csdn = new CsdnStrategy();
  const juejin = new JuejinStrategy();
  const cnblog = new CnblogStrategy();

  const csdnConfig = configManager.getConfig('csdn');
  if (csdnConfig) csdn.setCredentials(csdnConfig);

  const juejinConfig = configManager.getConfig('juejin');
  if (juejinConfig) juejin.setCredentials(juejinConfig);

  const cnblogConfig = configManager.getConfig('cnblog');
  if (cnblogConfig) cnblog.setCredentials(cnblogConfig);

  strategies.set('csdn', csdn);
  strategies.set('juejin', juejin);
  strategies.set('cnblog', cnblog);
}

function getStrategy(platform: string): BaseBlogStrategy {
  const strategy = strategies.get(platform);
  if (!strategy) {
    throw new Error(`不支持的平台: ${platform}，支持的平台: csdn, juejin, cnblog`);
  }
  return strategy;
}

function ensurePlatformConfigured(platform: string): void {
  if (!configManager.isConfigured(platform)) {
    throw new Error(`平台 ${platform} 未配置，请先使用 set_platform_config 设置 cookie`);
  }
}

const PlatformEnum = z.enum(['csdn', 'juejin', 'cnblog']);

const authSchema = z.object({
  cookie: z.string().optional().describe('平台 Cookie（优先于已配置的和环境变量）'),
  token: z.string().optional().describe('Token（博客园需要 X-XSRF-TOKEN）'),
  appKey: z.string().optional().describe('CSDN 签名 AppKey（不传则使用默认值）'),
  appSecret: z.string().optional().describe('CSDN 签名 AppSecret（不传则使用默认值）'),
}).optional().describe('平台认证凭据（优先级: 此参数 > set_platform_config > 环境变量）');

function applyRuntimeAuth(platform: string, auth?: { cookie?: string; token?: string; appKey?: string; appSecret?: string }): void {
  const strategy = strategies.get(platform);
  if (!strategy) return;
  if (auth?.cookie) {
    const cfg: PlatformConfig = { cookie: auth.cookie, token: auth.token };
    if (platform === 'csdn') {
      if (auth.appKey) (cfg as any).appKey = auth.appKey;
      if (auth.appSecret) (cfg as any).appSecret = auth.appSecret;
    }
    strategy.setRuntimeConfig(cfg);
  } else {
    strategy.setRuntimeConfig(undefined);
  }
}

function clearRuntimeAuth(platform: string): void {
  const strategy = strategies.get(platform);
  if (strategy) strategy.setRuntimeConfig(undefined);
}

const csdnExtraSchema = z.object({
  readType: z.enum(['public', 'private', 'read_need_pay', 'read_need_vip']).optional()
    .describe('阅读类型: public=公开, private=私有, read_need_pay=付费阅读, read_need_vip=VIP可见 (默认public)'),
  type: z.enum(['original', 'reproduced', 'translated']).optional()
    .describe('文章类型: original=原创, reproduced=转载, translated=翻译 (默认original)'),
  original_link: z.string().optional()
    .describe('转载原文链接（当type为reproduced时需要填写）'),
}).optional().describe('CSDN平台专属参数');

const juejinExtraSchema = z.object({
  tag_ids: z.array(z.string()).optional()
    .describe('掘金标签ID数组。前端: 6809640408797167623, 后端: 6809637769959178254, Android: 6809635626879549448, iOS: 6809635626879563271, 人工智能: 6809637771511044104, 开发工具: 6809635627016548359, 代码人生: 6809637773939011591, 阅读: 6809635626879571975'),
  category_id: z.string().optional()
    .describe('掘金分类ID。后端: 6809637769959178254, 前端: 6809635626879571975 (默认6809637769959178254)'),
  column_ids: z.array(z.string()).optional()
    .describe('关联的掘金专栏ID数组'),
  theme_ids: z.array(z.string()).optional()
    .describe('关联的掘金主题ID数组'),
}).optional().describe('掘金平台专属参数');

const cnblogExtraSchema = z.object({
  accessPermission: z.number().optional()
    .describe('访问权限: 0=公开, 1=仅登录用户可见, 2=仅自己可见 (默认0)'),
  inSiteCandidate: z.boolean().optional()
    .describe('是否入选博客园首页候选 (默认false)'),
  inSiteHome: z.boolean().optional()
    .describe('是否发布到博客园首页 (默认false)'),
  isAllowComments: z.boolean().optional()
    .describe('是否允许评论 (默认true)'),
  displayOnHomePage: z.boolean().optional()
    .describe('是否显示在个人博客首页 (默认true)'),
}).optional().describe('博客园平台专属参数');

function getExtraSchema(platform: string) {
  switch (platform) {
    case 'csdn': return csdnExtraSchema;
    case 'juejin': return juejinExtraSchema;
    case 'cnblog': return cnblogExtraSchema;
    default: return z.undefined();
  }
}

function getPlatformParamsDescription(): string {
  const parts: string[] = [];
  for (const [name, strategy] of strategies) {
    const meta = strategy.getMetadata();
    const lines = meta.publishParams.map(p => {
      const req = p.required ? '必填' : '可选';
      const def = p.defaultValue !== undefined ? `, 默认: ${JSON.stringify(p.defaultValue)}` : '';
      return `  - ${p.key} (${p.type}, ${req}${def}): ${p.description}`;
    });
    parts.push(`[${meta.platformLabel}]:\n${lines.join('\n')}`);
  }
  return parts.join('\n');
}

async function processContentImages(
  strategy: BaseBlogStrategy,
  content: string,
  filePath?: string,
): Promise<{ content: string; imageResults: string[] }> {
  const baseDir = filePath ? path.dirname(path.resolve(filePath)) : undefined;
  const result = await strategy.processAndUploadImages(content, baseDir);
  const imageResults = result.uploadedImages.map(img =>
    img.success
      ? `  ✓ ${img.original} → ${img.uploadedUrl}`
      : `  ✗ ${img.original}: ${img.message || '上传失败'}`,
  );
  return { content: result.content, imageResults };
}

export function createServer(): McpServer {
  initStrategies();

  const server = new McpServer({
    name: 'easy-blog-mcp-server',
    version: '1.0.0',
  });

  server.tool(
    'set_platform_config',
    '动态设置博客平台配置（cookie等），优先级高于环境变量',
    {
      platform: PlatformEnum.describe('平台名称'),
      config: z.object({
        cookie: z.string().describe('Cookie值'),
        token: z.string().optional().describe('Token值（博客园需要x-xsrf-token）'),
        appKey: z.string().optional().describe('CSDN签名AppKey（不传则使用默认值）'),
        appSecret: z.string().optional().describe('CSDN签名AppSecret（不传则使用默认值）'),
      }).describe('平台配置'),
    },
    async ({ platform, config }) => {
      const platformConfig: PlatformConfig = {
        cookie: config.cookie,
        token: config.token,
        ...(config.appKey ? { appKey: config.appKey } : {}),
        ...(config.appSecret ? { appSecret: config.appSecret } : {}),
      };
      configManager.setConfig(platform, platformConfig);
      const strategy = getStrategy(platform);
      strategy.setCredentials(platformConfig);

      return {
        content: [{ type: 'text', text: `已成功配置 ${platform} 平台` }],
      };
    }
  );

  function withAuth<T extends { platform: string; auth?: { cookie?: string; token?: string; appKey?: string; appSecret?: string } }>(
    handler: (args: T) => Promise<any>,
  ): (args: T) => Promise<any> {
    return async (args: T) => {
      applyRuntimeAuth(args.platform, args.auth);
      try {
        return await handler(args);
      } finally {
        clearRuntimeAuth(args.platform);
      }
    };
  }

  server.tool(
    'publish_article',
    '发布文章到指定博客平台。会自动上传内容中的本地图片并替换为远程URL。'
      + '\n\n各平台专属参数（通过extraParams传入）:\n' + getPlatformParamsDescription(),
    {
      platform: PlatformEnum.describe('目标平台'),
      title: z.string().describe('文章标题'),
      content: z.string().describe('文章内容（Markdown格式）'),
      description: z.string().optional().describe('文章摘要'),
      tags: z.array(z.string()).optional().describe('标签列表'),
      categories: z.array(z.string()).optional().describe('分类列表（CSDN专用）'),
      coverImage: z.string().optional().describe('封面图片URL'),
      status: z.enum(['draft', 'publish']).optional().describe('状态：draft=草稿，publish=发布'),
      csdnParams: csdnExtraSchema,
      juejinParams: juejinExtraSchema,
      cnblogParams: cnblogExtraSchema,
      auth: authSchema,
    },
    withAuth(async ({ platform, title, content, description, tags, categories, coverImage, status, csdnParams, juejinParams, cnblogParams }) => {
      ensurePlatformConfigured(platform);
      const strategy = getStrategy(platform);

      const { content: processedContent, imageResults } = await processContentImages(strategy, content);

      let extraParams: Record<string, any> | undefined;
      if (platform === 'csdn' && csdnParams) extraParams = csdnParams;
      else if (platform === 'juejin' && juejinParams) extraParams = juejinParams;
      else if (platform === 'cnblog' && cnblogParams) extraParams = cnblogParams;
      if (categories && platform === 'csdn') {
        extraParams = { ...extraParams, categories };
      }

      const article: ArticleRequest = {
        title,
        content: processedContent,
        description,
        tags,
        categories: platform !== 'csdn' ? categories : undefined,
        coverImage,
        status,
        extraParams,
      };
      const result = await strategy.publishArticle(article);

      const imageLog = imageResults.length > 0
        ? `\n\n图片处理:\n${imageResults.join('\n')}`
        : '';

      return {
        content: [{
          type: 'text',
          text: result.success
            ? `发布成功！\n平台: ${platform}\nID: ${result.id}\n链接: ${result.url}${imageLog}`
            : `发布失败: ${result.message}`,
        }],
      };
    })
  );

  server.tool(
    'batch_publish',
    '批量发布文章到多个博客平台。会自动上传内容中的本地图片并替换为远程URL。'
      + '\n\n各平台专属参数（通过对应参数传入）:\n' + getPlatformParamsDescription(),
    {
      platforms: z.array(PlatformEnum).describe('目标平台列表'),
      title: z.string().describe('文章标题'),
      content: z.string().describe('文章内容（Markdown格式）'),
      description: z.string().optional().describe('文章摘要'),
      tags: z.array(z.string()).optional().describe('标签列表'),
      categories: z.array(z.string()).optional().describe('分类列表'),
      coverImage: z.string().optional().describe('封面图片URL'),
      status: z.enum(['draft', 'publish']).optional().describe('状态'),
      csdnParams: csdnExtraSchema,
      juejinParams: juejinExtraSchema,
      cnblogParams: cnblogExtraSchema,
      csdnAuth: authSchema,
      juejinAuth: authSchema,
      cnblogAuth: authSchema,
    },
    async ({ platforms, title, content, description, tags, categories, coverImage, status, csdnParams, juejinParams, cnblogParams, csdnAuth, juejinAuth, cnblogAuth }) => {
      const allExtra: Record<string, any> = {
        csdn: csdnParams,
        juejin: juejinParams,
        cnblog: cnblogParams,
      };
      const allAuth: Record<string, any> = {
        csdn: csdnAuth,
        juejin: juejinAuth,
        cnblog: cnblogAuth,
      };

      const results: BatchPublishResult[] = [];
      const imageLogs: string[] = [];

      for (const platform of platforms) {
        applyRuntimeAuth(platform, allAuth[platform]);
        try {
          ensurePlatformConfigured(platform);
          const strategy = getStrategy(platform);

          const { content: processedContent, imageResults } = await processContentImages(strategy, content);
          if (imageResults.length > 0) {
            imageLogs.push(`[${platform}]\n${imageResults.join('\n')}`);
          }

          let extraParams = allExtra[platform] || undefined;
          if (categories && platform === 'csdn') {
            extraParams = { ...extraParams, categories };
          }

          const article: ArticleRequest = {
            title,
            content: processedContent,
            description,
            tags,
            categories: platform !== 'csdn' ? categories : undefined,
            coverImage,
            status,
            extraParams,
          };

          const result = await strategy.publishArticle(article);
          results.push({ platform, ...result });
        } catch (error: any) {
          results.push({ platform, success: false, message: error.message });
        } finally {
          clearRuntimeAuth(platform);
        }
      }

      const summary = results
        .map(r => `${r.platform}: ${r.success ? `成功 - ${r.url}` : `失败 - ${r.message}`}`)
        .join('\n');

      const imageLog = imageLogs.length > 0
        ? `\n\n图片处理:\n${imageLogs.join('\n')}`
        : '';

      return {
        content: [{ type: 'text', text: `批量发布结果:\n${summary}${imageLog}` }],
      };
    }
  );

  server.tool(
    'get_articles',
    '获取指定平台的文章列表',
    {
      platform: PlatformEnum.describe('平台名称'),
      page: z.number().optional().describe('页码（默认1）'),
      pageSize: z.number().optional().describe('每页数量（默认20）'),
      auth: authSchema,
    },
    withAuth(async ({ platform, page, pageSize }) => {
      ensurePlatformConfigured(platform);
      const strategy = getStrategy(platform);
      const articles = await strategy.getArticleList(page || 1, pageSize || 20);

      const list = articles
        .map(a => `- ${a.title}\n  链接: ${a.url}\n  创建时间: ${a.createdAt}\n  阅读量: ${a.viewCount || 0}`)
        .join('\n');

      return {
        content: [{
          type: 'text',
          text: articles.length > 0
            ? `${platform} 文章列表 (共${articles.length}篇):\n${list}`
            : `${platform} 暂无文章`,
        }],
      };
    })
  );

  server.tool(
    'get_article_detail',
    '获取指定文章的详细内容',
    {
      platform: PlatformEnum.describe('平台名称'),
      articleId: z.string().describe('文章ID'),
      auth: authSchema,
    },
    withAuth(async ({ platform, articleId }) => {
      ensurePlatformConfigured(platform);
      const strategy = getStrategy(platform);
      const article = await strategy.getArticleDetail(articleId);

      return {
        content: [{
          type: 'text',
          text: `文章详情:\n标题: ${article.title}\n摘要: ${article.description || '无'}\n标签: ${article.tags?.join(', ') || '无'}\n\n内容:\n${article.content}`,
        }],
      };
    })
  );

  server.tool(
    'update_article',
    '更新指定平台的文章。会自动上传内容中的本地图片并替换为远程URL。'
      + '\n\n各平台专属参数（通过对应参数传入）:\n' + getPlatformParamsDescription(),
    {
      platform: PlatformEnum.describe('平台名称'),
      articleId: z.string().describe('文章ID'),
      title: z.string().optional().describe('新标题'),
      content: z.string().optional().describe('新内容（Markdown格式）'),
      description: z.string().optional().describe('新摘要'),
      tags: z.array(z.string()).optional().describe('新标签列表'),
      categories: z.array(z.string()).optional().describe('新分类列表'),
      coverImage: z.string().optional().describe('新封面图片URL'),
      status: z.enum(['draft', 'publish']).optional().describe('新状态'),
      csdnParams: csdnExtraSchema,
      juejinParams: juejinExtraSchema,
      cnblogParams: cnblogExtraSchema,
      auth: authSchema,
    },
    withAuth(async ({ platform, articleId, title, content, description, tags, categories, coverImage, status, csdnParams, juejinParams, cnblogParams }) => {
      ensurePlatformConfigured(platform);
      const strategy = getStrategy(platform);

      let articleContent = content;
      let articleTitle = title;

      if (!articleContent || !articleTitle) {
        const existing = await strategy.getArticleDetail(articleId);
        if (!articleContent) articleContent = existing.content;
        if (!articleTitle) articleTitle = existing.title;
      }

      const { content: processedContent, imageResults } = await processContentImages(strategy, articleContent!);

      let extraParams: Record<string, any> | undefined;
      if (platform === 'csdn' && csdnParams) extraParams = csdnParams;
      else if (platform === 'juejin' && juejinParams) extraParams = juejinParams;
      else if (platform === 'cnblog' && cnblogParams) extraParams = cnblogParams;
      if (categories && platform === 'csdn') {
        extraParams = { ...extraParams, categories };
      }

      const article: ArticleRequest = {
        title: articleTitle!,
        content: processedContent,
        description,
        tags,
        categories: platform !== 'csdn' ? categories : undefined,
        coverImage,
        status,
        extraParams,
      };

      const result = await strategy.updateArticle(articleId, article);

      const imageLog = imageResults.length > 0
        ? `\n\n图片处理:\n${imageResults.join('\n')}`
        : '';

      return {
        content: [{
          type: 'text',
          text: result.success
            ? `更新成功！\n平台: ${platform}\nID: ${result.id}\n链接: ${result.url}${imageLog}`
            : `更新失败: ${result.message}`,
        }],
      };
    })
  );

  server.tool(
    'edit_blog',
    '读取本地Markdown文件并更新到指定平台的已有文章。会自动上传文件中的本地图片并替换为远程URL。'
      + '\n\n各平台专属参数（通过对应参数传入）:\n' + getPlatformParamsDescription(),
    {
      platform: PlatformEnum.describe('平台名称'),
      articleId: z.string().describe('要更新的文章ID'),
      filePath: z.string().describe('本地Markdown文件路径（支持相对/绝对路径）'),
      title: z.string().optional().describe('自定义标题（不指定则从文件或原文章提取）'),
      tags: z.array(z.string()).optional().describe('新标签列表'),
      status: z.enum(['draft', 'publish']).optional().describe('状态'),
      csdnParams: csdnExtraSchema,
      juejinParams: juejinExtraSchema,
      cnblogParams: cnblogExtraSchema,
      auth: authSchema,
    },
    withAuth(async ({ platform, articleId, filePath, title, tags, status, csdnParams, juejinParams, cnblogParams }) => {
      ensurePlatformConfigured(platform);
      const strategy = getStrategy(platform);

      const fileContent = readMarkdownFile(filePath);
      const articleTitle = title || extractTitle(fileContent, filePath);
      const description = extractDescription(fileContent);

      const { content: processedContent, imageResults } = await processContentImages(strategy, fileContent, filePath);

      let extraParams: Record<string, any> | undefined;
      if (platform === 'csdn' && csdnParams) extraParams = csdnParams;
      else if (platform === 'juejin' && juejinParams) extraParams = juejinParams;
      else if (platform === 'cnblog' && cnblogParams) extraParams = cnblogParams;

      const article: ArticleRequest = {
        title: articleTitle,
        content: processedContent,
        description,
        tags,
        status,
        extraParams,
      };

      const result = await strategy.updateArticle(articleId, article);

      const imageLog = imageResults.length > 0
        ? `\n\n图片处理:\n${imageResults.join('\n')}`
        : '';

      return {
        content: [{
          type: 'text',
          text: result.success
            ? `编辑更新成功！\n平台: ${platform}\nID: ${result.id}\n标题: ${articleTitle}\n链接: ${result.url}${imageLog}`
            : `更新失败: ${result.message}`,
        }],
      };
    })
  );

  server.tool(
    'delete_article',
    '删除指定平台的文章',
    {
      platform: PlatformEnum.describe('平台名称'),
      articleId: z.string().describe('文章ID'),
      auth: authSchema,
    },
    withAuth(async ({ platform, articleId }) => {
      ensurePlatformConfigured(platform);
      const strategy = getStrategy(platform);
      const success = await strategy.deleteArticle(articleId);

      return {
        content: [{
          type: 'text',
          text: success
            ? `删除成功！平台: ${platform}, 文章ID: ${articleId}`
            : `删除失败`,
        }],
      };
    })
  );

  server.tool(
    'upload_image',
    '上传图片到指定博客平台',
    {
      platform: PlatformEnum.describe('平台名称'),
      filePath: z.string().optional().describe('本地图片文件路径（支持相对/绝对路径）'),
      imageUrl: z.string().optional().describe('图片URL（从网络下载后上传）'),
      auth: authSchema,
    },
    withAuth(async ({ platform, filePath, imageUrl }) => {
      if (!filePath && !imageUrl) {
        throw new Error('请提供 filePath 或 imageUrl 参数');
      }

      ensurePlatformConfigured(platform);
      const strategy = getStrategy(platform);

      let result;
      if (filePath) {
        result = await strategy.uploadImage(filePath);
      } else if (imageUrl) {
        result = await strategy.uploadImageFromUrl(imageUrl);
      }

      return {
        content: [{
          type: 'text',
          text: result!.success
            ? `图片上传成功！\n平台: ${platform}\nURL: ${result!.url}`
            : `图片上传失败: ${result!.message}`,
        }],
      };
    })
  );

  server.tool(
    'download_image',
    '下载网络图片到本地文件',
    {
      url: z.string().describe('图片URL'),
      savePath: z.string().describe('保存路径（支持相对/绝对路径）'),
    },
    async ({ url, savePath }) => {
      const savedFilePath = await downloadImageToFile(url, savePath);

      return {
        content: [{
          type: 'text',
          text: `图片下载成功！\n保存路径: ${savedFilePath}`,
        }],
      };
    }
  );

  server.tool(
    'read_markdown',
    '读取本地Markdown文件内容',
    {
      filePath: z.string().describe('Markdown文件路径（支持相对/绝对路径）'),
    },
    async ({ filePath }) => {
      const content = readMarkdownFile(filePath);
      const title = extractTitle(content, filePath);
      const description = extractDescription(content);

      return {
        content: [{
          type: 'text',
          text: `文件内容:\n标题: ${title}\n摘要: ${description}\n\n${content}`,
        }],
      };
    }
  );

  server.tool(
    'read_markdown_and_publish',
    '读取本地Markdown文件并发布到博客平台。会自动上传文件中的本地图片并替换为远程URL。'
      + '\n\n各平台专属参数（通过对应参数传入）:\n' + getPlatformParamsDescription(),
    {
      filePath: z.string().describe('Markdown文件路径（支持相对/绝对路径）'),
      platform: PlatformEnum.optional().describe('目标平台（不指定则发布到所有已配置平台）'),
      title: z.string().optional().describe('自定义标题（不指定则从文件提取）'),
      tags: z.array(z.string()).optional().describe('标签列表'),
      status: z.enum(['draft', 'publish']).optional().describe('状态'),
      csdnParams: csdnExtraSchema,
      juejinParams: juejinExtraSchema,
      cnblogParams: cnblogExtraSchema,
      csdnAuth: authSchema,
      juejinAuth: authSchema,
      cnblogAuth: authSchema,
    },
    async ({ filePath, platform, title, tags, status, csdnParams, juejinParams, cnblogParams, csdnAuth, juejinAuth, cnblogAuth }) => {
      const content = readMarkdownFile(filePath);
      const articleTitle = title || extractTitle(content, filePath);
      const description = extractDescription(content);

      const allExtra: Record<string, any> = {
        csdn: csdnParams,
        juejin: juejinParams,
        cnblog: cnblogParams,
      };
      const allAuth: Record<string, any> = {
        csdn: csdnAuth,
        juejin: juejinAuth,
        cnblog: cnblogAuth,
      };

      if (platform) {
        applyRuntimeAuth(platform, allAuth[platform]);
        try {
          ensurePlatformConfigured(platform);
          const strategy = getStrategy(platform);

          const { content: processedContent, imageResults } = await processContentImages(strategy, content, filePath);

          const article: ArticleRequest = {
            title: articleTitle,
            content: processedContent,
            description,
            tags,
            status,
            extraParams: allExtra[platform],
          };
          const result = await strategy.publishArticle(article);

          const imageLog = imageResults.length > 0
            ? `\n\n图片处理:\n${imageResults.join('\n')}`
            : '';

          return {
            content: [{
              type: 'text',
              text: result.success
                ? `发布成功！\n平台: ${platform}\n标题: ${articleTitle}\n链接: ${result.url}${imageLog}`
                : `发布失败: ${result.message}`,
            }],
          };
        } finally {
          clearRuntimeAuth(platform);
        }
      } else {
        const configuredPlatforms = configManager.getConfiguredPlatforms();
        if (configuredPlatforms.length === 0) {
          throw new Error('没有已配置的平台，请先使用 set_platform_config 配置平台');
        }

        const results: BatchPublishResult[] = [];
        const imageLogs: string[] = [];

        for (const p of configuredPlatforms) {
          applyRuntimeAuth(p, allAuth[p]);
          try {
            const strategy = getStrategy(p);
            const { content: processedContent, imageResults } = await processContentImages(strategy, content, filePath);
            if (imageResults.length > 0) {
              imageLogs.push(`[${p}]\n${imageResults.join('\n')}`);
            }

            const article: ArticleRequest = {
              title: articleTitle,
              content: processedContent,
              description,
              tags,
              status,
              extraParams: allExtra[p],
            };

            const result = await strategy.publishArticle(article);
            results.push({ platform: p as Platform, ...result });
          } catch (error: any) {
            results.push({ platform: p as Platform, success: false, message: error.message });
          } finally {
            clearRuntimeAuth(p);
          }
        }

        const summary = results
          .map(r => `${r.platform}: ${r.success ? `成功 - ${r.url}` : `失败 - ${r.message}`}`)
          .join('\n');

        const imageLog = imageLogs.length > 0
          ? `\n\n图片处理:\n${imageLogs.join('\n')}`
          : '';

        return {
          content: [{
            type: 'text',
            text: `读取文件: ${filePath}\n标题: ${articleTitle}\n\n发布结果:\n${summary}${imageLog}`,
          }],
        };
      }
    }
  );

  server.tool(
    'list_configured_platforms',
    '列出所有已配置的博客平台',
    {},
    async () => {
      const platforms = configManager.getConfiguredPlatforms();

      return {
        content: [{
          type: 'text',
          text: platforms.length > 0
            ? `已配置的平台:\n${platforms.map(p => `- ${p}`).join('\n')}`
            : '暂无已配置的平台，请使用 set_platform_config 或设置环境变量',
        }],
      };
    }
  );

  return server;
}

export async function startServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Easy Blog MCP Server started');
}
