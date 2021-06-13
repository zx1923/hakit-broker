import config from "../../config";
import wxUrl from "./wx-url";
import wxRequest from "./wx-request";
import { getAccessToken } from './wx-token';
import { Logger } from "../../utils/logger";
import { WxCloudFuncResponse } from '../../types/index';

const { env } = config.wx;
const logger = new Logger('WxCloud');

/**
 * 填充URL中的参数
 * @param url 原URL
 * @param params 参数对象
 * @returns 
 */
function _fillUrlParams(url: string, params: object): string {
  let resurl = url;
  for (let key in params) {
    resurl = resurl.replace(`{${key}}`, params[key]);
  }
  return resurl;
}

/**
 * 向云数据库发送请求
 * 
 * @param type 请求类型
 * @param query 请求参数
 */
async function _dbRequest(type: string, query: string): Promise<WxCloudFuncResponse | null> {
  const { method, url } = wxUrl[type];
  const reqUrl = _fillUrlParams(url, {
    access_token: await getAccessToken()
  });
  return wxRequest[method](reqUrl, { env, query })
    .then(result => {
      return result;
    })
    .catch(err => {
      logger.error(err);
      return null;
    });
}

/**
 * 查询数据
 * 
 * @param sql 查询语句
 * @returns 
 */
function dbQuery(sql: string) {
  return _dbRequest('dbQuery', sql);
}

/**
 * 更新数据
 * 
 * @param sql sql语句
 * @returns 
 */
function dbUpdate(sql: string) {
  return _dbRequest('dbUpdate', sql);
}

/**
 * 请求云函数
 * 
 * @param name 云函数名
 * @param params 函数参数
 */
async function funcInvoke(name: string, params: object = {}): Promise<object | null> {
  const { method, url } = wxUrl.invokeFunction;
  const reqUrl = _fillUrlParams(url, {
    access_token: await getAccessToken(),
    env,
    name,
  });
  return wxRequest[method](reqUrl, params)
    .then(result => {
      return result;
    })
    .catch(err => {
      logger.error(err);
      return null;
    });
}

export default {
  dbQuery,
  dbUpdate,
  funcInvoke,
};