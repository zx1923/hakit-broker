import axios from 'axios';
import config from '../../config';
import wxUrl from './wx-url';
import helper from '../../utils/helper';
import { Logger } from '../../utils/logger';
import { accessTokenResponse } from '../../types/index';
const fs = require('fs');

const logger = new Logger('WxToken');

const { appid, secret } = config.wx;
const simpleRequest = axios.create();

const TokenFile = helper.pathJoin(__dirname, './token.cach');

// response 拦截处理
simpleRequest.interceptors.response.use(
  response => Promise.resolve(response.data),
  error => Promise.reject(error)
);

/**
 * 刷新当前的token
 */
function refreashAccessToken() {

}

/**
 * 重新从微信服务器获取token
 */
function regetAccessToken(): Promise<accessTokenResponse | null> {
  const { method, url } = wxUrl.getToken;
  const params = {
    grant_type: `client_credential`,
    appid,
    secret,
  };
  logger.info(`Request access token from wx api server`);
  return simpleRequest[method](url, { params })
    .then(res => {
      const { access_token, expires_in } = res;
      const token = {
        access_token,
        expires_in,
        request_at: Date.now() / 1000,
        expires_at: Date.now() / 1000 + expires_in - 60,
      }
      return token;
    })
    .catch(err => {
      logger.error(err);
      return null;
    });
}

/**
 * 保存获取到的token
 */
function saveAccessToken(token: accessTokenResponse): void {
  try {
    fs.writeFileSync(TokenFile, JSON.stringify(token), { encoding: "utf-8" });
  }
  catch (err) {
    logger.error(err);
  }
}

/**
 * 从缓存文件中读取token
 * 
 * @returns null/token object
 */
function readAccessTokenFromCach(): accessTokenResponse | null {
  if (!fs.existsSync(TokenFile)) {
    return null;
  }

  logger.info(`Read access token from cach file`);

  try {
    const token = fs.readFileSync(TokenFile);
    return JSON.parse(token);
  }
  catch (err) {
    logger.error(err);
    return null;
  }
}

/**
 * 获取微信接口调用凭据
 * @param {string} appid 
 * @param {string} secret 
 */
async function getAccessToken(): Promise<string | null> {
  let token = readAccessTokenFromCach();
  if (helper.isObject(token) && Date.now() / 1000 < token.expires_at) {
    return token.access_token;
  }

  // 重新获取token并缓存
  token = await regetAccessToken();
  if (token !== null) {
    saveAccessToken(token);
    return token.access_token;
  }
  
  return null;
}

export {
  getAccessToken,
};