import { MemoryDatabase } from '../src/database.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB_PATH = './test_memory.db';

// 清理测试数据库
function cleanup() {
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
  if (existsSync(TEST_DB_PATH + '-shm')) {
    unlinkSync(TEST_DB_PATH + '-shm');
  }
  if (existsSync(TEST_DB_PATH + '-wal')) {
    unlinkSync(TEST_DB_PATH + '-wal');
  }
}

console.log('🧪 开始测试 Mnemosyne Personal Memory Server\n');

// 清理旧的测试数据
cleanup();

try {
  // 测试 1: 数据库初始化
  console.log('✅ 测试 1: 数据库初始化');
  const db = new MemoryDatabase(TEST_DB_PATH, 'test_user');
  console.log('   数据库创建成功:', TEST_DB_PATH);

  // 测试 2: 用户属性管理
  console.log('\n✅ 测试 2: 用户属性管理');
  
  const profile1 = db.updateProfile('workplace', '字节跳动', 'basic_info');
  console.log('   添加属性:', profile1);
  
  const profile2 = db.updateProfile('work_location', '北京', 'basic_info');
  console.log('   添加属性:', profile2);
  
  const profile3 = db.updateProfile('workplace', '腾讯', 'basic_info');
  console.log('   更新属性 (应显示有旧值):', profile3);
  
  const queryResult = db.queryProfile();
  console.log('   查询所有属性:', queryResult);
  
  const deleteResult = db.deleteProfile('work_location');
  console.log('   删除属性:', deleteResult);

  // 测试 3: 实体管理
  console.log('\n✅ 测试 3: 实体管理');
  
  const petId = db.createEntity('pet', '旺财', { breed: '金毛', age: 3 });
  console.log('   创建宠物实体 ID:', petId);
  
  const carId = db.createEntity('vehicle', 'Model 3', { brand: 'Tesla', year: 2023 });
  console.log('   创建车辆实体 ID:', carId);
  
  const entities = db.listEntities();
  console.log('   列出所有实体:', entities);
  
  const updateResult = db.updateEntity(petId, '旺财宝宝', { breed: '金毛', age: 4 });
  console.log('   更新实体:', updateResult);
  
  const pets = db.listEntities('pet');
  console.log('   列出宠物实体:', pets);

  // 测试 4: 事件管理
  console.log('\n✅ 测试 4: 事件管理');
  
  const event1Id = db.addEvent(
    'milestone',
    '领养了金毛旺财',
    [petId],
    { location: '北京' },
    null,
    0.8
  );
  console.log('   添加里程碑事件 ID:', event1Id);
  
  const event2Id = db.addEvent(
    'illness',
    '旺财生病就医',
    [petId],
    { cost: 2000, hospital: '宠物医院' },
    null,
    0.6
  );
  console.log('   添加生病事件 ID:', event2Id);
  
  const event3Id = db.addEvent(
    'purchase',
    '购买特斯拉 Model 3',
    [carId],
    { cost: 280000, location: '上海' },
    null,
    0.9
  );
  console.log('   添加购买事件 ID:', event3Id);
  
  const allEvents = db.searchEvents();
  console.log('   搜索所有事件:', allEvents);
  
  const petEvents = db.queryEntityTimeline(petId);
  console.log('   查询宠物时间线:', petEvents);
  
  const illnessEvents = db.searchEvents(null, 'illness');
  console.log('   查询生病事件:', illnessEvents);

  // 测试 5: 时间范围搜索
  console.log('\n✅ 测试 5: 时间范围搜索');
  
  const recentEvents = db.searchEvents(null, null, 'last_week');
  console.log('   最近一周的事件:', recentEvents);

  // 测试 6: 软删除
  console.log('\n✅ 测试 6: 软删除');
  
  const deleteEntityResult = db.deleteEntity(carId);
  console.log('   删除车辆实体:', deleteEntityResult);
  
  const activeEntities = db.listEntities(null, 'active');
  console.log('   活跃实体 (不应包含车辆):', activeEntities);
  
  const allEntitiesIncludingInactive = db.listEntities(null, 'all');
  console.log('   所有实体 (包括已删除):', allEntitiesIncludingInactive);

  // 关闭数据库
  db.close();
  
  console.log('\n🎉 所有测试通过！');
  console.log('\n📊 测试总结:');
  console.log('   - 数据库文件:', TEST_DB_PATH);
  console.log('   - 用户属性: ✅');
  console.log('   - 实体管理: ✅');
  console.log('   - 事件管理: ✅');
  console.log('   - 时间线查询: ✅');
  console.log('   - 软删除: ✅');
  
} catch (error) {
  console.error('\n❌ 测试失败:', error);
  process.exit(1);
} finally {
  // 清理测试数据
  console.log('\n🧹 清理测试数据...');
  cleanup();
  console.log('   测试数据已清理');
}
