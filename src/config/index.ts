import { PlatformConfig } from '../types/index.js';

export class ConfigManager {
  private configs: Map<string, PlatformConfig> = new Map();

  constructor() {
    this.loadFromEnv();
  }

  private loadFromEnv() {
    if (process.env.CSDN_COOKIE) {
      this.configs.set('csdn', {
        cookie: process.env.CSDN_COOKIE,
        appKey: process.env.CSDN_APP_KEY,
        appSecret: process.env.CSDN_APP_SECRET,
      });
    }
    if (process.env.JUEJIN_COOKIE) {
      this.configs.set('juejin', { cookie: process.env.JUEJIN_COOKIE });
    }
    if (process.env.CNBLOG_COOKIE) {
      this.configs.set('cnblog', {
        cookie: process.env.CNBLOG_COOKIE,
        token: process.env.CNBLOG_TOKEN || '',
      });
    }
  }

  setConfig(platform: string, config: PlatformConfig): void {
    this.configs.set(platform, config);
  }

  getConfig(platform: string): PlatformConfig | undefined {
    return this.configs.get(platform);
  }

  getConfiguredPlatforms(): string[] {
    return Array.from(this.configs.keys());
  }

  isConfigured(platform: string): boolean {
    return this.configs.has(platform);
  }
}

export const configManager = new ConfigManager();
