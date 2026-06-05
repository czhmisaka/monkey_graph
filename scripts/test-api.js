#!/usr/bin/env node
/**
 * API 测试脚本
 * 用法: node scripts/test-api.js
 */

import http from 'http';

// 配置
const BASE_URL = process.env.API_URL || 'http://localhost:13001';
const TEST_USER = {
  username: 'test_' + Date.now(),
  password: 'Test@123456'
};

let authToken = '';
let testGraphId = '';
let testNodeId = '';

/**
 * 发送 HTTP 请求
 */
function request(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(body)
          });
        } catch {
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * 打印测试结果
 */
function log(type, message, data = null) {
  const icons = {
    pass: '✅',
    fail: '❌',
    info: 'ℹ',
    warn: '⚠'
  };
  console.log(`${icons[type] || '•'} ${message}`);
  if (data && process.env.DEBUG) {
    console.log('   ', JSON.stringify(data, null, 2));
  }
}

/**
 * 测试用户认证
 */
async function testAuth() {
  console.log('\n--- 用户认证测试 ---\n');

  // 注册
  try {
    const res = await request('POST', '/api/auth/register', {
      username: TEST_USER.username,
      password: TEST_USER.password
    });
    
    if (res.status === 200 || res.status === 201) {
      log('pass', '用户注册成功');
      authToken = res.data.token;
    } else {
      log('fail', `用户注册失败: ${res.data.error || res.status}`);
    }
  } catch (err) {
    log('fail', `注册请求失败: ${err.message}`);
  }

  // 登录
  try {
    const res = await request('POST', '/api/auth/login', {
      username: TEST_USER.username,
      password: TEST_USER.password
    });

    if (res.status === 200) {
      log('pass', '用户登录成功');
      authToken = res.data.token;
    } else {
      log('fail', `登录失败: ${res.data.error || res.status}`);
    }
  } catch (err) {
    log('fail', `登录请求失败: ${err.message}`);
  }

  // 获取当前用户
  if (authToken) {
    try {
      const res = await request('GET', '/api/auth/me', null, authToken);
      if (res.status === 200) {
        log('pass', '获取用户信息成功');
      } else {
        log('fail', `获取用户信息失败: ${res.status}`);
      }
    } catch (err) {
      log('fail', `获取用户信息失败: ${err.message}`);
    }
  }
}

/**
 * 测试图谱操作
 */
async function testGraphs() {
  console.log('\n--- 图谱操作测试 ---\n');

  // 创建图谱
  try {
    const res = await request('POST', '/api/graphs', {
      name: '测试图谱',
      description: 'API 测试创建的图谱'
    }, authToken);

    if (res.status === 200 || res.status === 201) {
      log('pass', '创建图谱成功');
      testGraphId = res.data.id;
      console.log(`   图谱ID: ${testGraphId}`);
    } else {
      log('fail', `创建图谱失败: ${res.data.error || res.status}`);
    }
  } catch (err) {
    log('fail', `创建图谱失败: ${err.message}`);
  }

  // 获取图谱列表
  try {
    const res = await request('GET', '/api/graphs', null, authToken);
    if (res.status === 200) {
      log('pass', `获取图谱列表成功 (${res.data.length || 0} 个)`);
    } else {
      log('fail', `获取图谱列表失败: ${res.status}`);
    }
  } catch (err) {
    log('fail', `获取图谱列表失败: ${err.message}`);
  }

  // 获取图谱详情
  if (testGraphId) {
    try {
      const res = await request('GET', `/api/graphs/${testGraphId}`, null, authToken);
      if (res.status === 200) {
        log('pass', '获取图谱详情成功');
      } else {
        log('fail', `获取图谱详情失败: ${res.status}`);
      }
    } catch (err) {
      log('fail', `获取图谱详情失败: ${err.message}`);
    }
  }

  // 更新图谱
  if (testGraphId) {
    try {
      const res = await request('PUT', `/api/graphs/${testGraphId}`, {
        name: '测试图谱 (已更新)',
        description: '更新后的描述'
      }, authToken);
      
      if (res.status === 200) {
        log('pass', '更新图谱成功');
      } else {
        log('fail', `更新图谱失败: ${res.status}`);
      }
    } catch (err) {
      log('fail', `更新图谱失败: ${err.message}`);
    }
  }
}

/**
 * 测试节点操作
 */
async function testNodes() {
  console.log('\n--- 节点操作测试 ---\n');

  if (!testGraphId) {
    log('warn', '跳过节点测试：需要有效的图谱ID');
    return;
  }

  // 创建节点
  try {
    const res = await request('POST', `/api/graphs/${testGraphId}/nodes`, {
      label: '测试节点',
      type: 'person',
      properties: { name: '测试', age: 25 }
    }, authToken);

    if (res.status === 200 || res.status === 201) {
      log('pass', '创建节点成功');
      testNodeId = res.data.id;
      console.log(`   节点ID: ${testNodeId}`);
    } else {
      log('fail', `创建节点失败: ${res.data.error || res.status}`);
    }
  } catch (err) {
    log('fail', `创建节点失败: ${err.message}`);
  }

  // 获取节点列表
  try {
    const res = await request('GET', `/api/graphs/${testGraphId}/nodes`, null, authToken);
    if (res.status === 200) {
      log('pass', `获取节点列表成功 (${res.data.length || 0} 个)`);
    } else {
      log('fail', `获取节点列表失败: ${res.status}`);
    }
  } catch (err) {
    log('fail', `获取节点列表失败: ${err.message}`);
  }

  // 更新节点
  if (testNodeId) {
    try {
      const res = await request('PUT', `/api/graphs/${testGraphId}/nodes/${testNodeId}`, {
        label: '测试节点 (已更新)',
        properties: { name: '更新后', age: 30 }
      }, authToken);
      
      if (res.status === 200) {
        log('pass', '更新节点成功');
      } else {
        log('fail', `更新节点失败: ${res.status}`);
      }
    } catch (err) {
      log('fail', `更新节点失败: ${err.message}`);
    }
  }

  // 删除节点
  if (testNodeId) {
    try {
      const res = await request('DELETE', `/api/graphs/${testGraphId}/nodes/${testNodeId}`, null, authToken);
      if (res.status === 200) {
        log('pass', '删除节点成功');
      } else {
        log('fail', `删除节点失败: ${res.status}`);
      }
    } catch (err) {
      log('fail', `删除节点失败: ${err.message}`);
    }
  }
}

/**
 * 测试边操作
 */
async function testEdges() {
  console.log('\n--- 边操作测试 ---\n');

  if (!testGraphId) {
    log('warn', '跳过边测试：需要有效的图谱ID');
    return;
  }

  // 创建两个节点用于测试边
  let sourceNodeId, targetNodeId;
  
  try {
    const res1 = await request('POST', `/api/graphs/${testGraphId}/nodes`, {
      label: '源节点',
      type: 'concept'
    }, authToken);
    sourceNodeId = res1.data?.id;

    const res2 = await request('POST', `/api/graphs/${testGraphId}/nodes`, {
      label: '目标节点',
      type: 'concept'
    }, authToken);
    targetNodeId = res2.data?.id;

    if (sourceNodeId && targetNodeId) {
      log('pass', '创建测试节点成功');
    }
  } catch (err) {
    log('fail', `创建测试节点失败: ${err.message}`);
  }

  // 创建边
  if (sourceNodeId && targetNodeId) {
    try {
      const res = await request('POST', `/api/graphs/${testGraphId}/edges`, {
        source: sourceNodeId,
        target: targetNodeId,
        label: '测试关系',
        type: 'related'
      }, authToken);

      if (res.status === 200 || res.status === 201) {
        log('pass', '创建边成功');
        console.log(`   边ID: ${res.data.id}`);
      } else {
        log('fail', `创建边失败: ${res.data.error || res.status}`);
      }
    } catch (err) {
      log('fail', `创建边失败: ${err.message}`);
    }
  }

  // 获取边列表
  try {
    const res = await request('GET', `/api/graphs/${testGraphId}/edges`, null, authToken);
    if (res.status === 200) {
      log('pass', `获取边列表成功 (${res.data.length || 0} 条)`);
    } else {
      log('fail', `获取边列表失败: ${res.status}`);
    }
  } catch (err) {
    log('fail', `获取边列表失败: ${err.message}`);
  }
}

/**
 * 清理测试数据
 */
async function cleanup() {
  console.log('\n--- 清理测试数据 ---\n');

  if (testGraphId) {
    try {
      const res = await request('DELETE', `/api/graphs/${testGraphId}`, null, authToken);
      if (res.status === 200) {
        log('pass', '删除测试图谱成功');
      } else {
        log('warn', `删除测试图谱失败: ${res.status}`);
      }
    } catch (err) {
      log('warn', `删除测试图谱失败: ${err.message}`);
    }
  }
}

/**
 * 运行所有测试
 */
async function runTests() {
  console.log('═══════════════════════════════════════');
  console.log('       MonkeyGraph API 测试套件');
  console.log('═══════════════════════════════════════');
  console.log(`目标服务器: ${BASE_URL}`);
  console.log(`测试用户: ${TEST_USER.username}`);
  console.log('═══════════════════════════════════════');

  try {
    await testAuth();
    await testGraphs();
    await testNodes();
    await testEdges();
  } catch (err) {
    console.error('\n❌ 测试过程出错:', err.message);
  } finally {
    await cleanup();
  }

  console.log('\n═══════════════════════════════════════');
  console.log('              测试完成');
  console.log('═══════════════════════════════════════\n');
}

// 运行测试
runTests();
