#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryDatabase } from './database.js';
import { getEventTemplates, formatError } from './utils.js';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Personal Memory MCP Server
 * 基于 MCP 协议的长期记忆服务
 */
class MemoryMCPServer {
  constructor(dbPath = null, userId = 'default') {
    this.db = new MemoryDatabase(dbPath, userId);
    this.server = new Server(
      {
        name: 'personal-memory-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this._setupHandlers();
  }

  /**
   * 设置所有处理器
   */
  _setupHandlers() {
    // 列出所有工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // ==================== 用户属性管理 ====================
          {
            name: 'update_profile',
            description: '更新或添加用户的基础信息，如工作地点、爱好、习惯等。⚠️ 重要：建议为每个属性添加 tags，用于语义搜索。例如工作相关的信息应打上 ["工作", "职业", "job"] 等 tags。',
            inputSchema: {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description: "属性键名，如 'workplace', 'favorite_food'",
                },
                value: {
                  type: 'string',
                  description: '属性值',
                },
                category: {
                  type: 'string',
                  enum: ['basic_info', 'preferences', 'habits'],
                  description: '属性分类',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '可选：语义标签数组，用于提高搜索召回率。例如 position="测试工程师" 应打上 tags=["工作", "职业", "job", "测试", "QA"]',
                },
              },
              required: ['key', 'value'],
            },
          },
          {
            name: 'query_profile',
            description: '查询用户的基础信息，支持按键名或分类筛选',
            inputSchema: {
              type: 'object',
              properties: {
                keys: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '要查询的键名列表（可选）',
                },
                category: {
                  type: 'string',
                  description: '按分类查询（可选）',
                },
              },
            },
          },
          {
            name: 'delete_profile',
            description: '删除指定的用户属性',
            inputSchema: {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description: '要删除的属性键名',
                },
              },
              required: ['key'],
            },
          },
          {
            name: 'search_profile_by_keywords',
            description: '通过关键词搜索用户个人信息。⚠️ 重要：调用此工具前，请先分析用户输入并提取核心关键词。例如用户说"我的公司全称"，应提取关键词 ["公司", "全称"]；用户说"我在哪里工作"，应提取关键词 ["工作", "公司", "地点"]。支持同义词扩展，如"车"可扩展为["车", "汽车", "vehicle"]。',
            inputSchema: {
              type: 'object',
              properties: {
                keywords: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '关键词数组，由 AI 从用户输入中提取的核心词汇。应包含同义词和相关词以提高召回率',
                },
                category: {
                  type: 'string',
                  enum: ['basic_info', 'preferences', 'habits'],
                  description: '可选：按分类过滤结果',
                },
                match_mode: {
                  type: 'string',
                  enum: ['any', 'all'],
                  default: 'any',
                  description: '匹配模式：any=任一关键词匹配（推荐），all=所有关键词都匹配',
                },
                limit: {
                  type: 'integer',
                  default: 20,
                  description: '返回结果数量限制',
                },
              },
              required: ['keywords'],
            },
          },

          // ==================== 实体管理 ====================
          {
            name: 'create_entity',
            description: '创建新的实体，如宠物、房产、车辆、重要的人。⚠️ 建议添加语义 tags 以便更好地搜索。',
            inputSchema: {
              type: 'object',
              properties: {
                entity_type: {
                  type: 'string',
                  enum: ['pet', 'property', 'vehicle', 'person'],
                  description: '实体类型',
                },
                name: {
                  type: 'string',
                  description: '实体名称，如宠物的名字',
                },
                attributes: {
                  type: 'object',
                  description: '实体属性，如 {"breed": "金毛", "age": 3}',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '可选：语义标签。例如宠物狗应打上 ["宠物", "狗", "pet", "dog"]',
                },
              },
              required: ['entity_type'],
            },
          },
          {
            name: 'update_entity',
            description: '更新实体的属性或状态',
            inputSchema: {
              type: 'object',
              properties: {
                entity_id: {
                  type: 'integer',
                  description: '实体 ID',
                },
                name: {
                  type: 'string',
                  description: '新的名称（可选）',
                },
                attributes: {
                  type: 'object',
                  description: '要更新的属性（可选）',
                },
                status: {
                  type: 'string',
                  enum: ['active', 'inactive'],
                  description: '实体状态（可选）',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '可选：更新语义标签',
                },
              },
              required: ['entity_id'],
            },
          },
          {
            name: 'list_entities',
            description: '列出用户的所有实体，可按类型和状态筛选',
            inputSchema: {
              type: 'object',
              properties: {
                entity_type: {
                  type: 'string',
                  description: '按类型筛选（可选）',
                },
                status: {
                  type: 'string',
                  enum: ['active', 'inactive', 'all'],
                  default: 'active',
                  description: '按状态筛选',
                },
              },
            },
          },
          {
            name: 'delete_entity',
            description: '删除指定实体（软删除，状态改为 inactive）',
            inputSchema: {
              type: 'object',
              properties: {
                entity_id: {
                  type: 'integer',
                  description: '要删除的实体 ID',
                },
              },
              required: ['entity_id'],
            },
          },
          {
            name: 'search_entities_by_keywords',
            description: '通过关键词搜索实体（宠物、房产、车辆、人物）。⚠️ 重要：调用此工具前，请先分析用户输入并提取核心关键词。例如用户说"我的小狗"，应提取关键词 ["小狗", "狗", "宠物", "pet"]；用户说"我的车"，应提取关键词 ["车", "汽车", "vehicle"]。建议包含同义词和相关词以提高匹配准确率。',
            inputSchema: {
              type: 'object',
              properties: {
                keywords: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '关键词数组，由 AI 从用户输入中提取。应包含同义词（如"车"和"汽车"）、中英文词汇（如"宠物"和"pet"）',
                },
                entity_type: {
                  type: 'string',
                  enum: ['pet', 'property', 'vehicle', 'person'],
                  description: '可选：按实体类型过滤。如果用户明确提到类型（如"我的宠物"），应设置此参数',
                },
                search_fields: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['name', 'attributes', 'all']
                  },
                  default: ['all'],
                  description: '搜索字段范围：name=仅名称，attributes=仅属性，all=全部字段（推荐）',
                },
                match_mode: {
                  type: 'string',
                  enum: ['any', 'all'],
                  default: 'any',
                  description: '匹配模式：any=任一关键词匹配（推荐），all=所有关键词都匹配',
                },
                limit: {
                  type: 'integer',
                  default: 20,
                  description: '返回结果数量限制',
                },
              },
              required: ['keywords'],
            },
          },

          // ==================== 事件管理 ====================
          {
            name: 'add_event',
            description: '记录一个新事件，可以关联一个或多个实体。⚠️ 建议添加语义 tags 以便更好地搜索和关联。',
            inputSchema: {
              type: 'object',
              properties: {
                event_type: {
                  type: 'string',
                  enum: ['purchase', 'illness', 'maintenance', 'activity', 'milestone', 'other'],
                  description: '事件类型',
                },
                description: {
                  type: 'string',
                  description: '事件描述',
                },
                related_entity_ids: {
                  type: 'array',
                  items: { type: 'integer' },
                  description: '关联的实体 ID 列表（可选）',
                },
                metadata: {
                  type: 'object',
                  description: '额外信息，如 {"cost": 2000, "location": "北京"}（可选）',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  description: '事件发生时间（ISO 8601 格式，可选，默认当前时间）',
                },
                importance: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                  default: 0.5,
                  description: '重要性评分',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '可选：语义标签。例如腰疼相关事件应打上 ["健康", "疼痛", "腰", "久坐", "工作"]',
                },
              },
              required: ['event_type', 'description'],
            },
          },
          {
            name: 'search_events',
            description: '搜索历史事件。⚠️ 重要：优先使用 keywords 参数进行语义搜索。调用前请从用户输入中提取关键词，例如"收养小狗的时间"应提取 ["收养", "小狗", "宠物"]。支持按时间范围和事件类型过滤。',
            inputSchema: {
              type: 'object',
              properties: {
                keywords: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '推荐参数：关键词数组，由 AI 从用户输入中提取。应包含动作词、对象词和同义词',
                },
                query: {
                  type: 'string',
                  description: '传统参数（向后兼容）：单个搜索关键词。如果提供了 keywords，此参数将被忽略',
                },
                event_type: {
                  type: 'string',
                  enum: ['purchase', 'illness', 'maintenance', 'activity', 'milestone', 'other'],
                  description: '可选：按事件类型筛选',
                },
                time_range: {
                  type: 'string',
                  description: "可选：时间范围，如 'last_week', 'last_month', '2024-01'",
                },
                limit: {
                  type: 'integer',
                  default: 20,
                  description: '返回结果数量限制',
                },
              },
            },
          },
          {
            name: 'query_entity_timeline',
            description: '查询某个实体相关的所有事件，按时间倒序排列',
            inputSchema: {
              type: 'object',
              properties: {
                entity_id: {
                  type: 'integer',
                  description: '实体 ID',
                },
                limit: {
                  type: 'integer',
                  default: 10,
                  description: '返回结果数量限制',
                },
              },
              required: ['entity_id'],
            },
          },
          {
            name: 'delete_event',
            description: '删除指定事件（软删除，不会真正从数据库中移除）',
            inputSchema: {
              type: 'object',
              properties: {
                event_id: {
                  type: 'integer',
                  description: '要删除的事件 ID',
                },
              },
              required: ['event_id'],
            },
          },

          // ==================== Tags 管理 ====================
          {
            name: 'add_tags_to_profile',
            description: '为用户属性添加语义标签。用于补充或优化已存在的记忆，提高搜索准确性。',
            inputSchema: {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description: '要添加 tags 的属性键名',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '要添加的 tags 数组，会自动去重',
                },
              },
              required: ['key', 'tags'],
            },
          },
          {
            name: 'remove_tags_from_profile',
            description: '从用户属性中删除指定的语义标签',
            inputSchema: {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description: '要删除 tags 的属性键名',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '要删除的 tags 数组',
                },
              },
              required: ['key', 'tags'],
            },
          },
          {
            name: 'add_tags_to_entity',
            description: '为实体添加语义标签',
            inputSchema: {
              type: 'object',
              properties: {
                entity_id: {
                  type: 'integer',
                  description: '实体 ID',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '要添加的 tags 数组',
                },
              },
              required: ['entity_id', 'tags'],
            },
          },
          {
            name: 'remove_tags_from_entity',
            description: '从实体中删除指定的语义标签',
            inputSchema: {
              type: 'object',
              properties: {
                entity_id: {
                  type: 'integer',
                  description: '实体 ID',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '要删除的 tags 数组',
                },
              },
              required: ['entity_id', 'tags'],
            },
          },
          {
            name: 'add_tags_to_event',
            description: '为事件添加语义标签',
            inputSchema: {
              type: 'object',
              properties: {
                event_id: {
                  type: 'integer',
                  description: '事件 ID',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '要添加的 tags 数组',
                },
              },
              required: ['event_id', 'tags'],
            },
          },
          {
            name: 'remove_tags_from_event',
            description: '从事件中删除指定的语义标签',
            inputSchema: {
              type: 'object',
              properties: {
                event_id: {
                  type: 'integer',
                  description: '事件 ID',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '要删除的 tags 数组',
                },
              },
              required: ['event_id', 'tags'],
            },
          },
        ],
      };
    });

    // 列出所有资源
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'memory://event-templates',
            name: 'Event Type Templates',
            description: '预定义的事件类型模板，帮助理解不同事件的使用场景',
            mimeType: 'application/json',
          },
        ],
      };
    });

    // 读取资源
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === 'memory://event-templates') {
        const templates = getEventTemplates();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(templates, null, 2),
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });

    // 调用工具
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result = null;

        // 用户属性管理
        if (name === 'update_profile') {
          result = await this.db.updateProfile(args.key, args.value, args.category, args.tags);
        } else if (name === 'query_profile') {
          result = await this.db.queryProfile(args.keys, args.category);
        } else if (name === 'delete_profile') {
          result = await this.db.deleteProfile(args.key);
        } else if (name === 'search_profile_by_keywords') {
          result = await this.db.searchProfileByKeywords(
            args.keywords,
            args.category,
            args.match_mode || 'any',
            args.limit || 20
          );
        }

        // 实体管理
        else if (name === 'create_entity') {
          const entityId = await this.db.createEntity(
            args.entity_type,
            args.name,
            args.attributes,
            args.tags
          );
          result = { entity_id: entityId };
        } else if (name === 'update_entity') {
          result = await this.db.updateEntity(
            args.entity_id,
            args.name,
            args.attributes,
            args.status,
            args.tags
          );
        } else if (name === 'list_entities') {
          result = await this.db.listEntities(args.entity_type, args.status || 'active');
        } else if (name === 'delete_entity') {
          result = await this.db.deleteEntity(args.entity_id);
        } else if (name === 'search_entities_by_keywords') {
          result = await this.db.searchEntitiesByKeywords(
            args.keywords,
            args.entity_type,
            args.search_fields || ['all'],
            args.match_mode || 'any',
            args.limit || 20
          );
        }

        // 事件管理
        else if (name === 'add_event') {
          const eventId = await this.db.addEvent(
            args.event_type,
            args.description,
            args.related_entity_ids,
            args.metadata,
            args.timestamp,
            args.importance || 0.5,
            args.tags
          );
          result = { event_id: eventId };
        } else if (name === 'search_events') {
          result = await this.db.searchEvents(
            args.query,
            args.keywords,
            args.event_type,
            args.time_range,
            args.limit || 20
          );
        } else if (name === 'query_entity_timeline') {
          result = await this.db.queryEntityTimeline(args.entity_id, args.limit || 10);
        } else if (name === 'delete_event') {
          result = await this.db.deleteEvent(args.event_id);
        }

        // Tags 管理
        else if (name === 'add_tags_to_profile') {
          result = await this.db.addTagsToProfile(args.key, args.tags);
        } else if (name === 'remove_tags_from_profile') {
          result = await this.db.removeTagsFromProfile(args.key, args.tags);
        } else if (name === 'add_tags_to_entity') {
          result = await this.db.addTagsToEntity(args.entity_id, args.tags);
        } else if (name === 'remove_tags_from_entity') {
          result = await this.db.removeTagsFromEntity(args.entity_id, args.tags);
        } else if (name === 'add_tags_to_event') {
          result = await this.db.addTagsToEvent(args.event_id, args.tags);
        } else if (name === 'remove_tags_from_event') {
          result = await this.db.removeTagsFromEvent(args.event_id, args.tags);
        }

        else {
          throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formatError(error), null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * 启动服务器
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Personal Memory MCP Server running on stdio');
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  let dbPath = null;
  let userId = 'default';

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db-path' && i + 1 < args.length) {
      dbPath = args[i + 1];
      i++;
    } else if (args[i] === '--user-id' && i + 1 < args.length) {
      userId = args[i + 1];
      i++;
    }
  }

  // 如果没有指定数据库路径，使用默认路径
  if (!dbPath) {
    const dataDir = join(homedir(), '.mnemosyne');
    dbPath = join(dataDir, 'memory.db');
  }

  const server = new MemoryMCPServer(dbPath, userId);
  await server.run();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
