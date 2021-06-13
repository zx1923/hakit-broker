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
  return wxCloud.dbQuery(`db.collection("devices").where({sn:"${sn}"}).get()`);
}

/**
 * 通过openid获取设备列表
 * 
 * @param openid 用户Openid，client.id
 */
function _dbGetDevicesByOpenid(openid: string) {
  return wxCloud.dbQuery(`db.collection("devices").where({_openid:"${openid}"}).get()`)
}

/**
 * 重置映射关系
 * 
 * @param openid 应用端ID
 * @param sn 设备端ID
 */
async function _resetMapData(openid: string, sn: string) {
  // user map device
  if (openid) {
    const res = await _dbGetDevicesByOpenid(openid);
    if (res.errcode === 0 && res.data.length) {
      return _setUserMapDevice(openid, res.data);
    }
    // 没有则置空
    return _setUserMapDevice(openid, []);
  }

  // device map user
  if (sn) {
    // let query = `db.collection("devices").where({sn:"${sn}"}).get()`;
    // wxDbRequest("dbQuery", query).then(res => {
    const res = await _dbGetDeviceBindInfoBySn(sn);
    if (res.errcode === 0 && res.data.lenght) {
      return _setDeviceMapUser(sn, res.data);
    }
    return _setDeviceMapUser(sn, []);
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
  console.log(userMapDevice);
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
  console.log(deviceMapUser);
}

/**
 * 透传消息给客户端
 * 
 * @param uid 客户端id，to devices
 * @param topic 话题
 * @param payload 数据
 */
function _broadcastToDevices(uid: string = null, msgstr: string) {
  let devices = userMapDevice[uid];
  if (!devices) {
    return;
  }
  for (let sn of devices) {
    mqServ.sendToClient(`D:${sn}`, `/device/${sn}`, msgstr);
    wsServ.sendToClient(`D:${sn}`, `/device/${sn}`, msgstr);
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
    mqServ.sendToClient(null, `/user/${openid}`, msgstr);
    wsServ.sendToClient(null, `/user/${openid}`, msgstr);
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

  // 验证设备是否在数据库有备案
  let query = `db.collection("devices").where({sn:"${sn}",secret:"${secret}"}).update({data:{activated:true}})`;
  const res = await wxCloud.dbUpdate(query);
  if (!res || res.errcode !== 0) {
    return Promise.resolve(false);
  }

  // 使用设备 SN 查询设备信息
  let bindInfo = await _dbGetDeviceBindInfoBySn(sn);
  if (bindInfo && bindInfo.errcode === 0) {
    // 生成 device -> user 映射关系
    _setDeviceMapUser(sn, bindInfo.data);
  }
  
  return Promise.resolve(true);
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
  password: string = null): Promise<boolean>  {
  
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
    _setUserMapDevice(openid, res.data);
  }

  return Promise.resolve(true);
}

/**
 * 客户端连接成功回调
 * 
 * @param context 上下文对象
 * @param client 客户端实例
 */
function onClientConnnect (
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
function onClientPublish (
  context: MqttServer,
  client: MqttClient, 
  packet: MqttPacket) {
  
  // 应用端的广播数据
  if (client.role === ClientRole.user) {
    // 广播
    if (packet.topic === `/broadcast/${client.uid}`) {
      return _broadcastToDevices(client.uid, packet.payload.toString());
    }

    // 点对点
    if (packet.topic.indexOf("/device/") === 0) {
      let sn = packet.topic.split('/device/')[1];
      mqServ.sendToClient(`D:${sn}`, packet.topic, packet.payload.toString());
      wsServ.sendToClient(`D:${sn}`, packet.topic, packet.payload.toString());
      return;
    }

    // 映射更新
    if (packet.topic === "/datamap/update") {
      let mapKeys = JSON.parse(packet.payload.toString());
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
    const strmsg = JSON.stringify({
      response: 'offline', 
      sn: client.did 
    });
    _broadcastToUsersBySn(client.did, strmsg);
  }
}

/**
 * 启动服务
 */
async function start(): Promise<void> {
  mqServ.setCallbackOptions({
    authDeviceConnection,
    authUserConnection,
    onClientConnnect,
    onClientPublish,
    onClientDisconnect
  });

  wsServ.setCallbackOptions({
    authDeviceConnection,
    authUserConnection,
    onClientConnnect,
    onClientPublish,
    onClientDisconnect
  });
  
  await mqServ.startBroker();
  await wsServ.startBroker();
}

export default {
  start,
};