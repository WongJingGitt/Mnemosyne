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
            description: '更新或添加用户的基础信息，如工作地点、爱好、习惯等',
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

          // ==================== 实体管理 ====================
          {
            name: 'create_entity',
            description: '创建新的实体，如宠物、房产、车辆、重要的人',
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

          // ==================== 事件管理 ====================
          {
            name: 'add_event',
            description: '记录一个新事件，可以关联一个或多个实体',
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
              },
              required: ['event_type', 'description'],
            },
          },
          {
            name: 'search_events',
            description: '按时间、类型、关键词搜索历史事件',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: '搜索关键词（可选）',
                },
                event_type: {
                  type: 'string',
                  description: '按事件类型筛选（可选）',
                },
                time_range: {
                  type: 'string',
                  description: "时间范围，如 'last_week', 'last_month', '2024-01'（可选）",
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
          result = await this.db.updateProfile(args.key, args.value, args.category);
        } else if (name === 'query_profile') {
          result = await this.db.queryProfile(args.keys, args.category);
        } else if (name === 'delete_profile') {
          result = await this.db.deleteProfile(args.key);
        }

        // 实体管理
        else if (name === 'create_entity') {
          const entityId = await this.db.createEntity(
            args.entity_type,
            args.name,
            args.attributes
          );
          result = { entity_id: entityId };
        } else if (name === 'update_entity') {
          result = await this.db.updateEntity(
            args.entity_id,
            args.name,
            args.attributes,
            args.status
          );
        } else if (name === 'list_entities') {
          result = await this.db.listEntities(args.entity_type, args.status || 'active');
        } else if (name === 'delete_entity') {
          result = await this.db.deleteEntity(args.entity_id);
        }

        // 事件管理
        else if (name === 'add_event') {
          const eventId = await this.db.addEvent(
            args.event_type,
            args.description,
            args.related_entity_ids,
            args.metadata,
            args.timestamp,
            args.importance || 0.5
          );
          result = { event_id: eventId };
        } else if (name === 'search_events') {
          result = await this.db.searchEvents(
            args.query,
            args.event_type,
            args.time_range,
            args.limit || 20
          );
        } else if (name === 'query_entity_timeline') {
          result = await this.db.queryEntityTimeline(args.entity_id, args.limit || 10);
        } else if (name === 'delete_event') {
          result = await this.db.deleteEvent(args.event_id);
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
