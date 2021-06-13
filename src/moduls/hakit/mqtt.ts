import { Logger } from '../../utils/logger';
import helper from '../../utils/helper';
import verify from './verify';
import { MqttClient, MqttPacket, ClientRole, BrokerOptions, BrokerCallbacks } from '../../types/index';
const mqtt = require('mqtt');

const logger = new Logger('Mqtt');

/**
 * 创建一个 super client
 * 
 * @param id 客户端ID
 * @param port 连接端口
 * @param usews 是否使用websocket协议
 */
function _createSuperClient(
  id: string,
  port: number,
  usews: boolean = false): Promise<any> {
  return new Promise(resolve => {
    const client = mqtt.connect(`${usews ? 'ws' : 'mqtt'}://localhost:${port}`, {
      clientId: id,
    });
    client.on('connect', function () {
      client.ready = true;
      resolve(client);
    });
  });
}

/**
 * 连接鉴权
 * 
 * @param client 客户端实例
 * @param username 连接用户名
 * @param password 连接密码
 * @param callback 回调函数
 */
async function _mqAuthenticate(
  client: MqttClient,
  username: string,
  password: string,
  callback: Function): Promise<void> {

  const conetxt: MqttServer = this;

  // super client
  if (client.id === conetxt.superId) {
    logger.info("Super Client Ready");
    client.role = ClientRole.super;
    return callback(null, true);
  }

  // ID是否有效
  if (!verify.isAvailableRoles(client.id)) {
    return callback(null, false);
  }

  // 设备端
  if (verify.isDevice(client.id)) {
    client.role = ClientRole.device;
    client.did = client.id.slice(2);
    // 连接鉴权
    let authres = await conetxt.opts.authDeviceConnection(conetxt, client, username, password);
    if (!authres) {
      logger.warn(`Device auth connextion failed`);
      return callback(null, false);
    }
  }

  // 应用端
  if (verify.isUser(client.id)) {
    client.role = ClientRole.user;
    client.uid = username;
    let res = await conetxt.opts.authUserConnection(conetxt, client, username, password);
    if (!res) {
      logger.warn(`User application auth connextion failed`);
      return callback(null, false);
    }
  }

  callback(null, true);
}

/**
 * 发布鉴权
 * 
 * @param client 客户端实例
 * @param packet 消息体
 * @param callback 回调函数
 */
function _mqAuthorizePublish(
  client: MqttClient,
  packet: MqttPacket,
  callback: Function): void {

  // super client or heartbeat pong
  if (client.role === ClientRole.super || packet.topic === '/heartbeat') {
    return callback(null);
  }

  // 应用端，可发布广播到 /broadcast/{openid} 或发布指定消息到 /device/{sn}, 应用端可发布 datamap update 广播
  if (client.role === ClientRole.user && packet.topic.indexOf("/broadcast/") != 0 && packet.topic.indexOf("/device/") != 0 && packet.topic != "/datamap/update") {
    logger.warn(`${client.role} 无权发布消息到 ${packet.topic}`);
    return callback(new Error('wrong topic'));
  }

  // 设备端，可发布广播到 /broadcast/{sn}
  if (client.role === ClientRole.device && packet.topic != `/broadcast/${client.did}`) {
    logger.warn(`${client.role} 无权发布消息到 ${packet.topic}`);
    return callback(new Error('wrong topic'));
  }

  const conetxt: MqttServer = this;

  logger.info(`topic <${packet.topic}> : onClientPublish callback`);
  conetxt.opts.onClientPublish(conetxt, client, packet);
  callback(null);
}

/**
 * 订阅鉴权
 * 
 * @param client 客户端实例
 * @param packet 消息体
 * @param callback 回调函数
 */
function _mqAuthorizeSubscribe(
  client: MqttClient,
  packet: MqttPacket,
  callback: Function): void {

  // super client
  if (client.role === ClientRole.super) {
    return callback(null, packet);
  }

  // 应用端，只能订阅 /user/{openid}
  if (client.role === ClientRole.user && packet.topic !== `/user/${client.uid}`) {
    logger.info(`${client.role} Subscribe auth faild, topic: "${packet.topic}"`);
    return callback(new Error(`${client.role}, wrong topic:, ${packet.topic}`));
  }

  // 设备端，只能订阅 /device/{sn}
  if (client.role === ClientRole.device && packet.topic !== `/device/${client.did}`) {
    logger.info(`${client.role} Subscribe auth faild, topic: "${packet.topic}"`);
    return callback(new Error(`${client.role}, wrong topic:, ${packet.topic}`));
  }

  // 默认允许订阅
  logger.info(`Subscribe auth Succeed.`, packet.topic);
  callback(null, packet)
}

/**
 * MQTT客户端连接成功回调
 */
function _mqOnClient(context: MqttServer, client: MqttClient) {
  logger.info(client.role, `${client.id} connected`);
  if (context.clientIdOnline.indexOf(client.id) < 0) {
    context.clientIdOnline.push(client.id);
  }
  context.clientObjsOnline[client.id] = client;
  context.opts.onClientConnnect(context, client);
}

/**
 * 客户端断开连接回调
 */
function _mqOnClientDisconnect(context: MqttServer, client: MqttClient) {
  logger.info(client.role, `${client.id} disconnected`);
  if (context.clientIdOnline.indexOf(client.id) >= 0) {
    context.clientIdOnline.splice(context.clientIdOnline.indexOf(client.id), 1);
    try {
      delete context.clientObjsOnline[client.id];
    } catch (error) {
      logger.error(`Delete Client ${client.id} error`);
    }
    logger.info(`${client.id} is removed`);
  }
  context.opts.onClientDisconnect(this, client);
}

/**
 * Mqtt 服务器
 */
class MqttServer {
  opts: BrokerCallbacks
  ws: boolean
  port: number
  wxsServer: any
  superClient: any
  superId: string
  clientIdOnline: Array<string>
  clientObjsOnline: object

  constructor(factory: BrokerOptions) {
    this.opts = null;
    this.ws = factory.ws || false,
    this.port = factory.port;
    this.superId = `super:${helper.getRandomStr(32)}`;
    this.superClient = null;
    // init
    this.clientIdOnline = [];
    this.clientObjsOnline = {};
    // MQTT
    const aedes = require('aedes')();
    const { createServer } = require('aedes-server-factory');
    this.wxsServer = createServer(aedes, { ws: this.ws });

    // 注册监听
    aedes.authenticate = _mqAuthenticate.bind(this);
    aedes.authorizePublish = _mqAuthorizePublish.bind(this);
    aedes.authorizeSubscribe = _mqAuthorizeSubscribe.bind(this);
    // MQTT客户端连接成功
    aedes.on("client", client => {
      _mqOnClient(this, client);
    });
    // 客户端断开连接
    aedes.on("clientDisconnect", client => {
      _mqOnClientDisconnect(this, client);
    });
  }

  setCallbackOptions(options: BrokerCallbacks) {
    this.opts = options;
  }

  /**
   * 通过SuperClient给设备透传消息
   * 
   * @param clientId 客户端ID
   * @param topic 话题
   * @param msgstr 消息
   */
  sendToClient(clientId: string, topic: string, msgstr: string): void {
    if (clientId === null) {
      return this.superClient.publish(topic, msgstr);
    }
    if (this.isOnline(clientId)) {
      this.superClient.publish(topic, msgstr);
      logger.info(`Send to <${topic}> ready`);
      return;
    }
    logger.warn(`[${this.ws ? 'Socket' : 'Mqtt'}] Client <${clientId}> is not online`);
  }

  /**
   * 检测给定id的客户端是否在线
   * @param clientId 客户端ID
   */
  isOnline(clientId: string): boolean {
    return this.clientObjsOnline[clientId] ? true : false;
  }

  /**
   * 启动代理服务器
   * 
   * @returns 
   */
  startBroker(): Promise<boolean> {
    const self = this;
    return new Promise(resolve => {
      self.wxsServer.listen(self.port, async () => {
        logger.info('server started and listening on port ', self.port);
        self.superClient = await _createSuperClient(self.superId, self.port, self.ws);
        return resolve(true);
      });
    });
  }

}

export default MqttServer;