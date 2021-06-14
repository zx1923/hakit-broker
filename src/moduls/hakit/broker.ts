import MqttServer from "./mqtt";
import wxCloud from "../wx/wx-cloud";
import config from "../../config";
import { Logger } from "../../utils/logger";
import { MqttClient, MqttPacket, ClientRole } from '../../types/index';

const logger = new Logger('Broker');

// 关系映射
let deviceMapUser: object = {};
let userMapDevice: object = {};

// MQTT 协议服务器
const mqServ = new MqttServer({
  ws: false,
  port: config.broker.mqtt.port
});

// WebSocket 协议服务器
const wsServ = new MqttServer({
  ws: true,
  port: config.broker.ws.port
});

/**
   * 通过sn获取设备列表
   * @param sn 设备SN，client.id
   */
function _dbGetDeviceBindInfoBySn(sn: string) {
  const fields = JSON.stringify({
    _openid: true,
  });
  return wxCloud.dbQuery(`db.collection("devices").where({sn:"${sn}"}).field(${fields}).get()`);
}

/**
 * 通过openid获取设备列表
 * 
 * @param openid 用户Openid，client.id
 */
function _dbGetDevicesByOpenid(openid: string) {
  const fields = JSON.stringify({
    sn: true,
  });
  return wxCloud.dbQuery(`db.collection("devices").where({_openid:"${openid}"}).field(${fields}).get()`)
}

/**
 * 重置映射关系
 * 
 * @param openid 应用端ID
 * @param sn 设备端ID
 */
async function _resetMapData(openid: string, sn: string) {
  logger.warn('_resetMapData', `openid: ${openid}, sn: ${sn}`);
  // user map device
  if (openid) {
    const res = await _dbGetDevicesByOpenid(openid);
    if (res.errcode === 0) {
      return _setUserMapDevice(openid, res.data.length ? res.data : []);
    }
  }

  // device map user
  if (sn) {
    const res = await _dbGetDeviceBindInfoBySn(sn);
    if (res.errcode === 0) {
      return _setDeviceMapUser(sn, res.data.length ? res.data : []);
    }
  }
}

/**
 * 生成用户与设备关系表
 * 
 * @param openid 用户id
 * @param dbdata 数据
 */
function _setUserMapDevice(openid: string, dbdata = []) {
  userMapDevice[openid] = new Set([]);
  for (let i in dbdata) {
    let line = JSON.parse(dbdata[i]);
    userMapDevice[openid].add(line.sn);
  }
  // console.log(userMapDevice);
}

/**
 * 生成设备与用户关系表
 * 
 * @param sn 设备id
 * @param dbdata 
 */
function _setDeviceMapUser(sn: string, dbdata = []) {
  deviceMapUser[sn] = new Set([]);
  for (let i in dbdata) {
    let line = JSON.parse(dbdata[i]);
    deviceMapUser[sn].add(line._openid);
  }
  // console.log(deviceMapUser);
}

/**
 * 向指定通道server发送设备离线消息
 * 
 * @param context 上下文对象
 * @param uid 应用端ID
 * @param did 设备ID
 */
function _sendDeviceOfflineMsgUseContext(context: MqttServer, uid: string, did: string) {
  const msgstr = JSON.stringify({
    response: 'offline',
    sn: did,
  });
  context.transfer(`/user/${uid}`, msgstr);
}

/**
 * 广播设备离线消息
 * 
 * @param did 设备ID
 */
function _broadcastDeviceOfflineMsg(did: string) {
  let users = deviceMapUser[did];
  if (!users) {
    return;
  }
  const msgstr = JSON.stringify({
    response: 'offline',
    sn: did,
  });
  for (let openid of users) {
    mqServ.transfer(`/user/${openid}`, msgstr);
    wsServ.transfer(`/user/${openid}`, msgstr);
  }
}

/**
 * 发送广播消息前先检查设备是否在线
 * 
 * @param did 设备ID
 */
function _getDeviceAvailableServers( did: string): Array<MqttServer> {
  // 如果设备不在线，则直接回复应用端
  return [mqServ, wsServ].filter(serv => {
    return serv.isOnline(`D:${did}`);
  });
}

/**
 * 透传消息给客户端
 * 
 * @param context 上下文对象
 * @param uid 客户端id，to devices
 * @param payload 数据
 */
function _broadcastToDevicesByUid(context: MqttServer, uid: string = null, msgstr: string) {
  let devices = userMapDevice[uid];
  if (!devices) {
    return;
  }
  for (let sn of devices) {
    // 在线检测
    const onlineInServs = _getDeviceAvailableServers(sn);
    if (!onlineInServs.length) {
      // 发送离线消息
      _sendDeviceOfflineMsgUseContext(context, uid, sn);
      continue;
    }
    onlineInServs.forEach(serv => {
      serv.transfer(`/device/${sn}`, msgstr);
    });
  }
}

/**
 * 透传消息给应用端
 * 
 * @param uid 设备id，to user app
 * @param topic 话题
 * @param payload 数据
 */
function _broadcastToUsersBySn(did: string = null, msgstr: string) {
  let users = deviceMapUser[did];
  if (!users) {
    return;
  }
  for (let openid of users) {
    mqServ.transfer(`/user/${openid}`, msgstr);
    wsServ.transfer(`/user/${openid}`, msgstr);
  }
}

/**
 * 设备端连接鉴权回调
 * 
 * @param client 客户端实例
 * @param sn 连接用户
 * @param secret 连接密码
 */
async function authDeviceConnection(
  conetxt: MqttServer,
  client: MqttClient,
  sn: string = null,
  secret: string = null): Promise<boolean> {

  // 非空
  if (!sn || !secret) {
    return Promise.resolve(false);
  }

  // 不可重复连接
  if (mqServ.isOnline(client.id) || wsServ.isOnline(client.id)) {
    return Promise.resolve(false);
  }

  // 验证设备是否可以被激活
  let query = `db.collection("devices").where({sn:"${sn}",secret:"${secret}"}).update({data:{activated:true}})`;
  const res = await wxCloud.dbUpdate(query);
  // matched 必须大于0，表示有匹配
  if (!res || res.errcode !== 0 || !res.matched) {
    return Promise.resolve(false);
  }

  // 使用设备 SN 查询设备信息
  let bindInfo = await _dbGetDeviceBindInfoBySn(sn);
  if (bindInfo && bindInfo.errcode === 0) {
    // 生成 device -> user 映射关系
    _setDeviceMapUser(sn, bindInfo.data.length ? bindInfo.data : []);
    return Promise.resolve(true);
  }

  return Promise.resolve(false);
}

/**
 * 应用端连接鉴权
 * 
 * @param context 上下文对象
 * @param client 客户端连接对象
 * @param openid 应用端的openid
 */
async function authUserConnection(
  context: MqttServer,
  client: MqttClient,
  openid: string,
  password: string = null): Promise<boolean> {

  // 非空
  if (!openid) {
    return Promise.resolve(false);
  }

  // 同一个协议不能重复连接
  if (context.isOnline(client.id)) {
    return Promise.resolve(false);
  }

  // 使用 openid 查询设备绑定
  const res = await _dbGetDevicesByOpenid(openid);
  if (res && res.errcode === 0) {
    // 设置 user -> device 映射关系
    _setUserMapDevice(openid, res.data.length ? res.data : []);
    return Promise.resolve(true);
  }

  return Promise.resolve(false);
}

/**
 * 客户端连接成功回调
 * 
 * @param context 上下文对象
 * @param client 客户端实例
 */
function onClientConnnect(
  context: MqttServer,
  client: MqttClient) {
  logger.info(`onClientConnnect trigged`);
}

/**
 * 客户端发布消息回调
 * 
 * @param context 上下文
 * @param client 客户端对象
 * @param packet 数据包，{topic, payload}
 */
function onClientPublish(
  context: MqttServer,
  client: MqttClient,
  packet: MqttPacket) {

  // 应用端的广播数据
  if (client.role === ClientRole.user) {
    
    // 广播
    if (packet.topic === `/broadcast/${client.uid}`) {
      return _broadcastToDevicesByUid(context, client.uid, packet.payload.toString());
    }

    // 点对点，发送消息给设备 /device/did
    if (packet.topic.indexOf("/device/") === 0) {
      let sn = packet.topic.split('/device/')[1];
      // 获取在线的 serv 实例
      const onlineInServs = _getDeviceAvailableServers(sn);
      if (!onlineInServs.length && client.role === ClientRole.user) {
        return _broadcastDeviceOfflineMsg(sn);
      }
      onlineInServs.forEach(serv => {
        serv.transfer(packet.topic, packet.payload.toString())
      });
      return;
    }

    // 映射更新
    if (packet.topic === "/datamap/update") {
      let mapKeys = JSON.parse(packet.payload.toString());
      logger.warn(`</datamap/update>`, `reset device mapper width ${mapKeys.openid} & ${mapKeys.sn}`);
      return _resetMapData(mapKeys.openid, mapKeys.sn);
    }
  }
  // 设备端的广播数据
  else if (client.role === ClientRole.device) {
    return _broadcastToUsersBySn(client.did, packet.payload.toString());
  }
}

/**
 * 客户端断开连接时回调
 * 
 * @param context 上下文对象
 * @param client 客户端实例
 */
function onClientDisconnect(
  context: MqttServer,
  client: MqttClient) {
  // 设备端开，则通知 user app 设备下线
  if (client.role === ClientRole.device) {
    _broadcastDeviceOfflineMsg(client.did);
  }
}

/**
 * 启动服务
 */
async function start(): Promise<void> {
  const options = {
    authDeviceConnection,
    authUserConnection,
    onClientConnnect,
    onClientPublish,
    onClientDisconnect
  };

  mqServ.setCallbackOptions(options);
  wsServ.setCallbackOptions(options);

  await mqServ.startBroker();
  await wsServ.startBroker();
}

export default {
  start,
};