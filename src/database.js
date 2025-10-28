import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

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
    this.userId = userId;
    this.db = null;
    this._initialize();
  }

  /**
   * 初始化数据库连接和表结构
   */
  _initialize() {
    // 确保数据库目录存在
    const dbDir = dirname(this.dbPath);
    mkdirSync(dbDir, { recursive: true });

    // 检查数据库文件是否已存在
    const dbExists = existsSync(this.dbPath);
    
    // 创建数据库连接
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // 启用 WAL 模式提高性能

    // 只有在数据库文件不存在时才创建表
    if (!dbExists) {
      console.log('Creating new database tables...');
      this._createTables();
    } else {
      console.log('Using existing database:', this.dbPath);
    }
  }

  /**
   * 创建所有数据表
   */
  _createTables() {
    // 用户基础信息表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_profile (
        user_id TEXT NOT NULL DEFAULT 'default',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        category TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        confidence REAL DEFAULT 1.0,
        PRIMARY KEY (user_id, key)
      )
    `);

    // 实体表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'default',
        entity_type TEXT NOT NULL,
        name TEXT,
        attributes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active'
      )
    `);

    // 事件表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'default',
        event_type TEXT NOT NULL,
        description TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        related_entity_ids TEXT,
        metadata TEXT,
        importance REAL DEFAULT 0.5
      )
    `);

    // 实体关系表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entity_relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'default',
        entity_id_1 INTEGER NOT NULL,
        entity_id_2 INTEGER NOT NULL,
        relation_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entity_id_1) REFERENCES entities(id),
        FOREIGN KEY (entity_id_2) REFERENCES entities(id)
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entities_user_type ON entities(user_id, entity_type);
      CREATE INDEX IF NOT EXISTS idx_events_user_time ON events(user_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_entity ON events(user_id, related_entity_ids);
    `);

    console.log('Database tables created successfully');
  }

  // ==================== 用户属性管理 ====================

  /**
   * 更新用户属性
   */
  updateProfile(key, value, category = null) {
    // 检查是否存在旧值
    const oldRow = this.db.prepare(
      'SELECT value FROM user_profile WHERE user_id = ? AND key = ?'
    ).get(this.userId, key);

    // 插入或更新
    const stmt = this.db.prepare(`
      INSERT INTO user_profile (user_id, key, value, category, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, key) DO UPDATE SET
        value = excluded.value,
        category = COALESCE(excluded.category, category),
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(this.userId, key, value, category);

    return {
      updated: true,
      had_previous_value: oldRow !== undefined,
      previous_value: oldRow?.value || null
    };
  }

  /**
   * 查询用户属性
   */
  queryProfile(keys = null, category = null) {
    let sql = 'SELECT key, value, category, updated_at, confidence FROM user_profile WHERE user_id = ?';
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

    const rows = this.db.prepare(sql).all(...params);
    return rows;
  }

  /**
   * 删除用户属性
   */
  deleteProfile(key) {
    const stmt = this.db.prepare(
      'DELETE FROM user_profile WHERE user_id = ? AND key = ?'
    );
    const result = stmt.run(this.userId, key);

    return {
      deleted: result.changes > 0,
      changes: result.changes
    };
  }

  // ==================== 实体管理 ====================

  /**
   * 创建实体
   */
  createEntity(entityType, name = null, attributes = null) {
    const attributesJson = attributes ? JSON.stringify(attributes) : null;
    
    const stmt = this.db.prepare(`
      INSERT INTO entities (user_id, entity_type, name, attributes, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(this.userId, entityType, name, attributesJson);
    return result.lastInsertRowid;
  }

  /**
   * 更新实体
   */
  updateEntity(entityId, name = null, attributes = null, status = null) {
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
    params.push(this.userId, entityId);

    const sql = `UPDATE entities SET ${updates.join(', ')} WHERE user_id = ? AND id = ?`;
    const result = this.db.prepare(sql).run(...params);

    return {
      updated: result.changes > 0,
      changes: result.changes
    };
  }

  /**
   * 列出实体
   */
  listEntities(entityType = null, status = 'active') {
    let sql = 'SELECT id, entity_type, name, attributes, created_at, updated_at, status FROM entities WHERE user_id = ?';
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

    const rows = this.db.prepare(sql).all(...params);
    
    // 解析 JSON 属性
    return rows.map(row => ({
      ...row,
      attributes: row.attributes ? JSON.parse(row.attributes) : null
    }));
  }

  /**
   * 删除实体（软删除）
   */
  deleteEntity(entityId) {
    const stmt = this.db.prepare(
      'UPDATE entities SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?'
    );
    const result = stmt.run('inactive', this.userId, entityId);

    return {
      deleted: result.changes > 0,
      changes: result.changes
    };
  }

  // ==================== 事件管理 ====================

  /**
   * 添加事件
   */
  addEvent(eventType, description, relatedEntityIds = null, metadata = null, timestamp = null, importance = 0.5) {
    const relatedEntityIdsJson = relatedEntityIds ? JSON.stringify(relatedEntityIds) : null;
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    const eventTimestamp = timestamp || new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO events (user_id, event_type, description, related_entity_ids, metadata, timestamp, importance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      this.userId,
      eventType,
      description,
      relatedEntityIdsJson,
      metadataJson,
      eventTimestamp,
      importance
    );

    return result.lastInsertRowid;
  }

  /**
   * 搜索事件
   */
  searchEvents(query = null, eventType = null, timeRange = null, limit = 20) {
    let sql = `
      SELECT id, event_type, description, related_entity_ids, metadata, timestamp, importance
      FROM events
      WHERE user_id = ?
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

    const rows = this.db.prepare(sql).all(...params);
    
    // 解析 JSON 字段
    return rows.map(row => ({
      ...row,
      related_entity_ids: row.related_entity_ids ? JSON.parse(row.related_entity_ids) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    }));
  }

  /**
   * 查询实体的事件时间线
   */
  queryEntityTimeline(entityId, limit = 10) {
    // SQLite 的 JSON 支持有限，使用 LIKE 匹配
    const sql = `
      SELECT id, event_type, description, related_entity_ids, metadata, timestamp, importance
      FROM events
      WHERE user_id = ?
        AND (
          related_entity_ids LIKE ?
          OR related_entity_ids LIKE ?
          OR related_entity_ids LIKE ?
        )
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const rows = this.db.prepare(sql).all(
      this.userId,
      `%[${entityId},%`,   // [123, ...
      `%, ${entityId}]%`,  // ..., 123]
      `%[${entityId}]%`,   // [123]
      limit
    );

    // 解析 JSON 字段
    return rows.map(row => ({
      ...row,
      related_entity_ids: row.related_entity_ids ? JSON.parse(row.related_entity_ids) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    }));
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
      this.db.close();
    }
  }
}
