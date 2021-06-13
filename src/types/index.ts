declare interface BrokerOptions {
  ws: boolean,
  port: number
}

interface BrokerCallbacks {
  onClientConnnect: Function,
  onClientDisconnect: Function,
  onClientPublish: Function,
  authDeviceConnection: Function,
  authUserConnection: Function,
}

enum ClientRole {
  super,
  user,
  device
}

interface MqttClient {
  id: string,
  role: ClientRole,
  did: string,
  uid: string
}

interface MqttPacket {
  topic: string
  payload: string
}

interface accessTokenResponse {
  access_token: string,
  expires_in: number,
  request_at: number,
  expires_at: number
}

interface WxCloudFuncResponse {
  errcode: number,
  errmsg: string,
  data: any
}

export {
  BrokerOptions,
  BrokerCallbacks,
  ClientRole,
  MqttClient,
  MqttPacket,
  accessTokenResponse,
  WxCloudFuncResponse,
};