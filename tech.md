# 技术文档 (Technical Documentation)

## 项目概述

这是一个基于 Node.js 开发的 Memcache 协议反向代理服务器，实现了客户端与多个后端 Memcache 服务器之间的负载均衡和请求分发。

## 核心技术架构

### 1. 技术栈
- **运行环境**: Node.js (基于 V8 引擎和 libevent)
- **网络模型**: 单线程 + 事件循环 (Event Loop)
- **I/O 模式**: 异步非阻塞 I/O
- **协议支持**: Memcache 文本协议

### 2. 架构设计

#### 2.1 代理服务器模式
```
客户端 → Node.js 代理服务器 → 多个 Memcache 服务器
```

#### 2.2 核心组件

**主要模块**:
- `nodeproxy.js` - 核心代理服务器实现
- `buffermanager.js` - 缓冲区管理器，处理数据包的拆分和合并
- `log.js` - 日志系统
- `optparser.js` - 命令行参数解析器
- `memcache.js` - Memcache 客户端实现

### 3. 关键技术实现

#### 3.1 连接池管理
- **连接复用**: 维护与后端 Memcache 服务器的长连接池
- **连接数控制**: 每个后端服务器可配置最大连接数
- **连接生命周期**: 自动处理连接创建、复用和释放

#### 3.2 负载均衡算法
```javascript
function hashCode(str) {
    // 兼容 Java String.hashCode 的哈希算法
    var h = 0, off = 0, len = str.length;
    for (var i = 0; i < len; i++) {
        h = 31 * h + str.charCodeAt(off++);
    }
    return h;
}

// 根据 key 选择后端服务器
var hash = hashCode(request.key);
var idx = hash % servers.length;
```

#### 3.3 协议解析
- **请求解析**: 解析 Memcache 文本协议请求
- **响应处理**: 处理各种 Memcache 响应类型
- **数据包边界**: 处理 TCP 数据包的拆分和重组

支持的 Memcache 命令:
- `get` - 获取数据
- `set`, `add`, `replace` - 存储数据
- `delete` - 删除数据
- `incr`, `decr` - 数值增减

#### 3.4 异步 I/O 处理

**数据包处理流程**:
```javascript
socket.on('data', function(buf) {
    do {
        var request = mk_request(this.remain_data, buf);
        if (request) {
            push_request_to_return_queue(this, request);
            process_request(this, request);
        }
    } while (request);
});
```

**响应顺序保证**:
- 使用队列机制确保响应顺序与请求顺序一致
- 处理并发请求时的响应同步问题

### 4. 性能优化

#### 4.1 内存管理
- **缓冲区管理**: 自定义 BufferManager 处理数据包
- **连接复用**: 避免频繁建立/关闭连接的开销
- **队列管理**: 高效的请求/响应队列实现

#### 4.2 并发处理
- **事件驱动**: 基于 Node.js 事件循环的高并发处理
- **非阻塞 I/O**: 避免线程阻塞，提高吞吐量
- **连接池**: 控制后端连接数，避免资源耗尽

### 5. 错误处理

#### 5.1 连接错误处理
- 后端 Memcache 服务器连接失败处理
- 客户端连接断开处理
- 网络异常恢复机制

#### 5.2 协议错误处理
- 非法请求格式处理
- 不支持命令的错误响应
- 数据包损坏检测

### 6. 配置与部署

#### 6.1 启动参数
```bash
node nodeproxy.js -s 127.0.0.1:11210,127.0.0.1:11211,127.0.0.1:11212 -p 11111 -n 5 -b 0.0.0.0
```

参数说明:
- `-s`: 后端 Memcache 服务器地址列表
- `-p`: 代理服务器监听端口
- `-n`: 每个后端服务器的最大连接数
- `-b`: 绑定的 IP 地址

#### 6.2 性能指标
- 支持数千并发连接
- 每秒处理请求数可达数万次
- 内存使用效率高，适合高并发场景

### 7. 监控与日志

#### 7.1 日志系统
- 支持多级别日志 (DEBUG, INFO, NOTICE, ERROR)
- 连接建立/断开日志
- 请求处理状态跟踪

#### 7.2 运行状态监控
- 连接池状态监控
- 请求队列长度监控
- 后端服务器健康状态检查

## 技术优势

1. **高性能**: 基于 Node.js 的异步 I/O 模型，单线程处理高并发
2. **可扩展**: 支持动态添加后端 Memcache 服务器
3. **透明代理**: 对客户端完全透明，无需修改现有代码
4. **负载均衡**: 基于哈希算法的均匀负载分发
5. **容错性**: 完善的错误处理和连接管理机制

## 适用场景

- Web 应用的缓存层代理
- 分布式缓存系统的负载均衡
- Memcache 集群的统一入口
- 高并发场景下的缓存访问优化

## 发展方向

1. 支持更多 Memcache 协议命令
2. 添加管理界面和监控面板
3. 支持配置热重载
4. 添加更多负载均衡算法选项
5. 支持 Memcache 二进制协议