import initSqlJs from 'sql.js';
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

/**
 * 个人记忆数据库管理类
 */
export class MemoryDatabase {
  constructor(dbPath = null, userId = 'default') {
    // 如果没有指定路径，默认使用用户目录下的 .mnemosyne 文件夹
    if (!dbPath) {
      const dataDir = join(homedir(), '.mnemosyne');
      mkdirSync(dataDir, { recursive: true });
      dbPath = join(dataDir, 'memory.db');
    }
    
    this.dbPath = dbPath;
    this.dataDir = dirname(dbPath);
    this.userId = userId;
    this.db = null;
    this.SQL = null;
    this.lastModifiedTime = null;
    this._initPromise = this._initialize();
  }

  /**
   * 初始化数据库连接和表结构
   */
  async _initialize() {
    // 确保数据库目录存在
    const dbDir = dirname(this.dbPath);
    mkdirSync(dbDir, { recursive: true });

    // 检查数据库文件是否已存在
    const dbExists = existsSync(this.dbPath);
    
    // 初始化 sql.js
    this.SQL = await initSqlJs();
    
    // 创建或加载数据库
    if (dbExists) {
      console.log('Loading existing database:', this.dbPath);
      const buffer = readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
      
      // 确保表结构是最新的（包括 deleted 字段）
      this._ensureTablesUpToDate();
      
      // 初始化最后修改时间
      const stats = statSync(this.dbPath);
      this.lastModifiedTime = stats.mtimeMs;
    } else {
      console.log('Creating new database...');
      this.db = new this.SQL.Database();
      this._createTables();
      this._saveDatabase();
    }
  }

  /**
   * 保存数据库到文件
   */
  _saveDatabase() {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
    
    // 检测文件是否发生变更，如果是则触发 Git 同步
    this._autoSync();
  }

  /**
   * 自动 Git 同步（简单粗暴版）
   */
  _autoSync() {
    try {
      // 获取当前文件的修改时间
      const stats = statSync(this.dbPath);
      const currentModifiedTime = stats.mtimeMs;
      
      // 如果是第一次或者文件确实发生了变化
      if (this.lastModifiedTime !== null && currentModifiedTime !== this.lastModifiedTime) {
        // 检查是否是 Git 仓库
        const gitDir = join(this.dataDir, '.git');
        if (!existsSync(gitDir)) {
          this.lastModifiedTime = currentModifiedTime;
          return;
        }
        
        // 执行 WAL checkpoint
        this.db.run('PRAGMA wal_checkpoint(TRUNCATE)');
        
        // 导出并保存数据库（确保 checkpoint 生效）
        const data = this.db.export();
        const buffer = Buffer.from(data);
        writeFileSync(this.dbPath, buffer);
        
        // 执行 Git 同步
        const now = new Date();
        const dateStr = now.toISOString().replace('T', ' ').substring(0, 19);
        
        try {
          execSync('git add memory.db', { cwd: this.dataDir, stdio: 'ignore' });
          execSync(`git commit -m "Auto sync: ${dateStr}"`, { cwd: this.dataDir, stdio: 'ignore' });
          
          // 尝试推送（可能失败，但不影响）
          try {
            execSync('git push', { cwd: this.dataDir, stdio: 'ignore', timeout: 5000 });
          } catch (pushError) {
            // 推送失败不打印错误，静默处理
          }
        } catch (gitError) {
          // Git 命令失败不打印错误，静默处理
        }
      }
      
      // 更新最后修改时间
      this.lastModifiedTime = currentModifiedTime;
    } catch (error) {
      // 所有错误都静默处理，不影响主流程
    }
  }

  /**
   * 确保数据库已初始化
   */
  async _ensureInitialized() {
    await this._initPromise;
  }

  /**
   * 创建所有数据表
   */
  _createTables() {
    // 用户基础信息表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_profile (
        user_id TEXT NOT NULL DEFAULT 'default',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        category TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        confidence REAL DEFAULT 1.0,
        deleted INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, key)
      )
    `);

    // 实体表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'default',
        entity_type TEXT NOT NULL,
        name TEXT,
        attributes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        deleted INTEGER DEFAULT 0
      )
    `);

    // 事件表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'default',
        event_type TEXT NOT NULL,
        description TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        related_entity_ids TEXT,
        metadata TEXT,
        importance REAL DEFAULT 0.5,
        deleted INTEGER DEFAULT 0
      )
    `);

    // 实体关系表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS entity_relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'default',
        entity_id_1 INTEGER NOT NULL,
        entity_id_2 INTEGER NOT NULL,
        relation_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted INTEGER DEFAULT 0,
        FOREIGN KEY (entity_id_1) REFERENCES entities(id),
        FOREIGN KEY (entity_id_2) REFERENCES entities(id)
      )
    `);

    // 创建索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_entities_user_type ON entities(user_id, entity_type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_events_user_time ON events(user_id, timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_events_entity ON events(user_id, related_entity_ids)`);

    console.log('Database tables created successfully');
  }

  /**
   * 确保现有数据库表结构是最新的
   */
  _ensureTablesUpToDate() {
    // 检查并添加 deleted 字段（如果不存在）
    const tables = ['user_profile', 'entities', 'events', 'entity_relations'];
    
    for (const table of tables) {
      try {
        // 检查字段是否存在
        const result = this.db.exec(`PRAGMA table_info(${table})`);
        if (result.length === 0) continue;
        
        const columns = result[0].values.map(row => row[1]); // 第二列是字段名
        
        if (!columns.includes('deleted')) {
          console.log(`Adding 'deleted' column to ${table}...`);
          this.db.run(`ALTER TABLE ${table} ADD COLUMN deleted INTEGER DEFAULT 0`);
          this._saveDatabase(); // 保存更改
        }
      } catch (e) {
        console.error(`Error updating table ${table}:`, e.message);
      }
    }
  }

  // ==================== 用户属性管理 ====================

  /**
   * 更新用户属性
   */
  async updateProfile(key, value, category = null) {
    await this._ensureInitialized();
    
    // 检查是否存在旧值
    const oldRow = this.db.exec(
      'SELECT value FROM user_profile WHERE user_id = ? AND key = ?',
      [this.userId, key]
    );

    // 插入或更新
    this.db.run(`
      INSERT INTO user_profile (user_id, key, value, category, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, key) DO UPDATE SET
        value = excluded.value,
        category = COALESCE(excluded.category, category),
        updated_at = CURRENT_TIMESTAMP
    `, [this.userId, key, value, category]);

    this._saveDatabase();

    return {
      updated: true,
      had_previous_value: oldRow.length > 0 && oldRow[0].values.length > 0,
      previous_value: oldRow.length > 0 && oldRow[0].values.length > 0 ? oldRow[0].values[0][0] : null
    };
  }

  /**
   * 查询用户属性
   */
  async queryProfile(keys = null, category = null) {
    await this._ensureInitialized();
    
    let sql = 'SELECT key, value, category, updated_at, confidence FROM user_profile WHERE user_id = ? AND deleted = 0';
    const params = [this.userId];

    if (keys && keys.length > 0) {
      const placeholders = keys.map(() => '?').join(',');
      sql += ` AND key IN (${placeholders})`;
      params.push(...keys);
    }

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    const result = this.db.exec(sql, params);
    
    if (result.length === 0) return [];
    
    const columns = result[0].columns;
    const values = result[0].values;
    
    return values.map(row => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  }

  /**
   * 删除用户属性（软删除）
   */
  async deleteProfile(key) {
    await this._ensureInitialized();
    
    const result = this.db.exec(
      'SELECT COUNT(*) as count FROM user_profile WHERE user_id = ? AND key = ? AND deleted = 0',
      [this.userId, key]
    );
    
    const count = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
    
    this.db.run(
      'UPDATE user_profile SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND key = ?',
      [this.userId, key]
    );

    this._saveDatabase();

    return {
      deleted: count > 0,
      changes: count
    };
  }

  // ==================== 实体管理 ====================

  /**
   * 创建实体
   */
  async createEntity(entityType, name = null, attributes = null) {
    await this._ensureInitialized();
    
    const attributesJson = attributes ? JSON.stringify(attributes) : null;
    
    this.db.run(`
      INSERT INTO entities (user_id, entity_type, name, attributes, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [this.userId, entityType, name, attributesJson]);

    const result = this.db.exec('SELECT last_insert_rowid()');
    this._saveDatabase();
    
    return result[0].values[0][0];
  }

  /**
   * 更新实体
   */
  async updateEntity(entityId, name = null, attributes = null, status = null) {
    await this._ensureInitialized();
    
    const updates = [];
    const params = [];

    if (name !== null) {
      updates.push('name = ?');
      params.push(name);
    }

    if (attributes !== null) {
      updates.push('attributes = ?');
      params.push(JSON.stringify(attributes));
    }

    if (status !== null) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return { updated: false, message: 'No fields to update' };
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    
    // 检查更新前是否存在
    const checkResult = this.db.exec(
      'SELECT COUNT(*) as count FROM entities WHERE user_id = ? AND id = ?',
      [this.userId, entityId]
    );
    const existsBefore = checkResult.length > 0 && checkResult[0].values.length > 0 ? checkResult[0].values[0][0] : 0;

    const sql = `UPDATE entities SET ${updates.join(', ')} WHERE user_id = ? AND id = ?`;
    params.push(this.userId, entityId);
    
    this.db.run(sql, params);
    this._saveDatabase();

    return {
      updated: existsBefore > 0,
      changes: existsBefore
    };
  }

  /**
   * 列出实体
   */
  async listEntities(entityType = null, status = 'active') {
    await this._ensureInitialized();
    
    let sql = 'SELECT id, entity_type, name, attributes, created_at, updated_at, status FROM entities WHERE user_id = ? AND deleted = 0';
    const params = [this.userId];

    if (entityType) {
      sql += ' AND entity_type = ?';
      params.push(entityType);
    }

    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const result = this.db.exec(sql, params);
    
    if (result.length === 0) return [];
    
    const columns = result[0].columns;
    const values = result[0].values;
    
    // 解析 JSON 属性
    return values.map(row => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      if (obj.attributes) {
        try {
          obj.attributes = JSON.parse(obj.attributes);
        } catch (e) {
          obj.attributes = null;
        }
      }
      return obj;
    });
  }

  /**
   * 删除实体（软删除）
   */
  async deleteEntity(entityId) {
    await this._ensureInitialized();
    
    const checkResult = this.db.exec(
      'SELECT COUNT(*) as count FROM entities WHERE user_id = ? AND id = ? AND deleted = 0',
      [this.userId, entityId]
    );
    const count = checkResult.length > 0 && checkResult[0].values.length > 0 ? checkResult[0].values[0][0] : 0;
    
    this.db.run(
      'UPDATE entities SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?',
      [this.userId, entityId]
    );
    
    this._saveDatabase();

    return {
      deleted: count > 0,
      changes: count
    };
  }

  // ==================== 事件管理 ====================

  /**
   * 添加事件
   */
  async addEvent(eventType, description, relatedEntityIds = null, metadata = null, timestamp = null, importance = 0.5) {
    await this._ensureInitialized();
    
    const relatedEntityIdsJson = relatedEntityIds ? JSON.stringify(relatedEntityIds) : null;
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    const eventTimestamp = timestamp || new Date().toISOString();

    this.db.run(`
      INSERT INTO events (user_id, event_type, description, related_entity_ids, metadata, timestamp, importance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      this.userId,
      eventType,
      description,
      relatedEntityIdsJson,
      metadataJson,
      eventTimestamp,
      importance
    ]);

    const result = this.db.exec('SELECT last_insert_rowid()');
    this._saveDatabase();
    
    return result[0].values[0][0];
  }

  /**
   * 搜索事件
   */
  async searchEvents(query = null, eventType = null, timeRange = null, limit = 20) {
    await this._ensureInitialized();
    
    let sql = `
      SELECT id, event_type, description, related_entity_ids, metadata, timestamp, importance
      FROM events
      WHERE user_id = ? AND deleted = 0
    `;
    const params = [this.userId];

    // 关键词搜索
    if (query) {
      sql += ' AND description LIKE ?';
      params.push(`%${query}%`);
    }

    // 事件类型筛选
    if (eventType) {
      sql += ' AND event_type = ?';
      params.push(eventType);
    }

    // 时间范围筛选
    if (timeRange) {
      const { start, end } = this._parseTimeRange(timeRange);
      sql += ' AND timestamp BETWEEN ? AND ?';
      params.push(start.toISOString(), end.toISOString());
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const result = this.db.exec(sql, params);
    
    if (result.length === 0) return [];
    
    const columns = result[0].columns;
    const values = result[0].values;
    
    // 解析 JSON 字段
    return values.map(row => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      if (obj.related_entity_ids) {
        try {
          obj.related_entity_ids = JSON.parse(obj.related_entity_ids);
        } catch (e) {
          obj.related_entity_ids = null;
        }
      }
      if (obj.metadata) {
        try {
          obj.metadata = JSON.parse(obj.metadata);
        } catch (e) {
          obj.metadata = null;
        }
      }
      return obj;
    });
  }

  /**
   * 查询实体的事件时间线
   */
  async queryEntityTimeline(entityId, limit = 10) {
    await this._ensureInitialized();
    
    // SQLite 的 JSON 支持有限，使用 LIKE 匹配
    const sql = `
      SELECT id, event_type, description, related_entity_ids, metadata, timestamp, importance
      FROM events
      WHERE user_id = ? AND deleted = 0
        AND (
          related_entity_ids LIKE ?
          OR related_entity_ids LIKE ?
          OR related_entity_ids LIKE ?
        )
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const result = this.db.exec(sql, [
      this.userId,
      `%[${entityId},%`,   // [123, ...
      `%, ${entityId}]%`,  // ..., 123]
      `%[${entityId}]%`,   // [123]
      limit
    ]);
    
    if (result.length === 0) return [];
    
    const columns = result[0].columns;
    const values = result[0].values;

    // 解析 JSON 字段
    return values.map(row => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      if (obj.related_entity_ids) {
        try {
          obj.related_entity_ids = JSON.parse(obj.related_entity_ids);
        } catch (e) {
          obj.related_entity_ids = null;
        }
      }
      if (obj.metadata) {
        try {
          obj.metadata = JSON.parse(obj.metadata);
        } catch (e) {
          obj.metadata = null;
        }
      }
      return obj;
    });
  }

  /**
   * 删除事件（软删除）
   */
  async deleteEvent(eventId) {
    await this._ensureInitialized();
    
    const checkResult = this.db.exec(
      'SELECT COUNT(*) as count FROM events WHERE user_id = ? AND id = ? AND deleted = 0',
      [this.userId, eventId]
    );
    const count = checkResult.length > 0 && checkResult[0].values.length > 0 ? checkResult[0].values[0][0] : 0;
    
    this.db.run(
      'UPDATE events SET deleted = 1 WHERE user_id = ? AND id = ?',
      [this.userId, eventId]
    );
    
    this._saveDatabase();

    return {
      deleted: count > 0,
      changes: count
    };
  }

  /**
   * 解析时间范围字符串
   */
  _parseTimeRange(timeRange) {
    const now = new Date();
    
    if (timeRange === 'last_week') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start, end: now };
    } else if (timeRange === 'last_month') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start, end: now };
    } else if (timeRange === 'last_year') {
      const start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      return { start, end: now };
    } else if (timeRange.match(/^\d{4}-\d{2}$/)) {
      // YYYY-MM 格式
      const [year, month] = timeRange.split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      return { start, end };
    } else if (timeRange.match(/^\d{4}$/)) {
      // YYYY 格式
      const year = parseInt(timeRange);
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      return { start, end };
    } else {
      throw new Error(`Unsupported time range format: ${timeRange}`);
    }
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this.db) {
      this._saveDatabase(); // 保存最后的更改
      this.db.close();
    }
  }
}
