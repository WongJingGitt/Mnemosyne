/**
 * 工具函数模块
 */

/**
 * 获取事件类型模板
 */
export function getEventTemplates() {
  return {
    event_templates: {
      purchase: {
        description: "购买或获得某物",
        common_entities: ["property", "vehicle", "pet"],
        metadata_fields: ["cost", "location", "brand", "model"]
      },
      illness: {
        description: "疾病或就医事件",
        common_entities: ["pet", "person"],
        metadata_fields: ["cost", "diagnosis", "hospital", "medication"]
      },
      maintenance: {
        description: "维护或保养",
        common_entities: ["vehicle", "property"],
        metadata_fields: ["cost", "service_type", "service_provider"]
      },
      activity: {
        description: "日常活动或互动",
        common_entities: ["pet", "person"],
        metadata_fields: ["location", "duration"]
      },
      milestone: {
        description: "重要里程碑",
        common_entities: ["person", "pet", "property"],
        metadata_fields: ["significance"]
      }
    }
  };
}

/**
 * 格式化错误响应
 */
export function formatError(error) {
  return {
    error: error.message || String(error),
    stack: error.stack
  };
}

/**
 * 验证实体类型
 */
export function isValidEntityType(type) {
  const validTypes = ["pet", "property", "vehicle", "person"];
  return validTypes.includes(type);
}

/**
 * 验证事件类型
 */
export function isValidEventType(type) {
  const validTypes = ["purchase", "illness", "maintenance", "activity", "milestone", "other"];
  return validTypes.includes(type);
}

/**
 * 验证状态
 */
export function isValidStatus(status) {
  const validStatuses = ["active", "inactive", "all"];
  return validStatuses.includes(status);
}
